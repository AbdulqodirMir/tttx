"""Invite countdown alignment test (real Firebase, local static files).

RUN modes:
  sender-skew : sender (game page) clock +5s AHEAD of real time, receiver widget normal.
  rcvr-skew   : receiver widget clock +5s AHEAD, sender normal. Asserts the widget's
                incoming toast lives ~the full TTL (offset correction + gate).

Invariant asserted (both runs): the sender's "invite expired" toast must never
appear while the waitbar still shows seconds left.
"""
import asyncio, json, re, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
MODE = sys.argv[1] if len(sys.argv) > 1 else 'sender-skew'
OUT = Path(sys.argv[2] if len(sys.argv) > 2 else '/downloads/proof') / MODE
OUT.mkdir(parents=True, exist_ok=True)
SKEW = 5000
SUFFIX = str(int(time.time()))[-5:]
SENDER = 'SkewSend' + SUFFIX
RCVR = 'CalmRcvr' + SUFFIX

HOST_HTML = b"""<!doctype html><html><head><meta charset="utf-8"><title>host</title></head>
<body><script src="https://tttx.miraliyev.tech/embed.js" data-site="miraliyev.tech" defer></script></body></html>"""

def skew_script(delta):
    # shift the whole Date family (now + constructor), like a real skewed device clock
    return ('(()=>{const R=Date,D=%d;'
            'function F(){return arguments.length?new (Function.prototype.bind.apply(R,[null].concat([].slice.call(arguments))))():new R(R.now()+D)}'
            'F.now=()=>R.now()+D;F.prototype=R.prototype;Object.setPrototypeOf(F,R);window.Date=F})()') % delta

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])

        async def route_local(r):
            url = r.request.url
            if 'tttx.miraliyev.tech' in url:
                path = url.split('tttx.miraliyev.tech', 1)[1].split('?')[0]
            elif 'miraliyev.tech' in url:
                path = url.split('miraliyev.tech', 1)[1].split('?')[0]
                if path in ('/', ''):
                    await r.fulfill(body=HOST_HTML, content_type='text/html'); return
            else:
                await r.continue_(); return
            f = ROOT / ('index.html' if path in ('/', '') else path.lstrip('/'))
            if f.is_file():
                await r.fulfill(path=str(f))
            else:
                await r.fulfill(status=404, body=b'')

        # --- sender: game page ---
        cs = await b.new_context(ignore_https_errors=True, viewport={'width': 390, 'height': 844},
                                 record_video_dir=str(OUT), record_video_size={'width': 390, 'height': 844})
        await cs.route('**://tttx.miraliyev.tech/**', route_local)
        init = 'localStorage.setItem("tttx-hide","1");localStorage.setItem("tttx-nick",%s);' % json.dumps(SENDER)
        if MODE == 'sender-skew':
            init += skew_script(SKEW)
        await cs.add_init_script(init)
        ps = await cs.new_page()
        await ps.goto('https://tttx.miraliyev.tech/index.html')

        # --- receiver: widget host page ---
        cr = await b.new_context(ignore_https_errors=True, viewport={'width': 390, 'height': 844})
        await cr.route('**://tttx.miraliyev.tech/**', route_local)
        await cr.route('**://miraliyev.tech/**', route_local)
        init2 = 'localStorage.setItem("tttx-nick",%s);' % json.dumps(RCVR)
        if MODE == 'rcvr-skew':
            init2 += skew_script(SKEW)
        await cr.add_init_script(init2)
        pr = await cr.new_page()
        await pr.goto('https://miraliyev.tech/')

        await ps.evaluate('Online.openLobby()')
        uid = None
        for _ in range(90):
            uid = await pr.evaluate('window.__dbg && window.__dbg.uid')
            if uid: break
            await asyncio.sleep(0.5)
        assert uid, 'receiver widget never signed in'
        print('receiver uid:', uid)

        # widget shadow-root probe
        rcv_toast_js = '''()=>{const el=document.querySelector('#tttx-embed');if(!el||!el.shadowRoot)return '';
            return el.shadowRoot.textContent.replace(/\\s+/g,' ').trim()}'''

        await ps.evaluate('Online.debugInvite(%s, %s)' % (json.dumps(uid), json.dumps(RCVR)))
        t0 = asyncio.get_event_loop().time()

        result = {'expired_at': None, 'left_at_expiry': None, 'rcv_first_toast': None, 'rcv_toast_gone': None}
        last_left = None
        prev = None
        while asyncio.get_event_loop().time() - t0 < 55:
            el = asyncio.get_event_loop().time() - t0
            st = await ps.evaluate('''()=>({
                wb: document.querySelector('#waitbar').classList.contains('on'),
                wbText: (document.querySelector('#waitbar span')||{}).textContent||'',
                toast: (document.querySelector('#toast')||{}).textContent||''
            })''')
            rt = await pr.evaluate(rcv_toast_js)
            if 'invites you' in rt and result['rcv_first_toast'] is None:
                result['rcv_first_toast'] = el
            if result['rcv_first_toast'] is not None and result['rcv_toast_gone'] is None and 'invites you' not in rt:
                result['rcv_toast_gone'] = el
            m = re.search(r'\((\d+)s\)', st['wbText'])
            left = int(m.group(1)) if (m and st['wb']) else None
            if st['wb'] and left is not None: last_left = left
            key = (st['wb'], left, st['toast'][:40], 'invites you' in rt)
            if key != prev:
                print('t=%5.1fs wb=%s left=%s rcv_toast=%s toast=%r' % (el, st['wb'], left, key[3], st['toast'][:60]))
                prev = key
            if 'invite expired' in st['toast'] and result['expired_at'] is None:
                result['expired_at'] = el
                result['left_at_expiry'] = left if st['wb'] else (last_left if last_left is not None else 0)
                await ps.screenshot(path=str(OUT / 'sender_at_expiry.png'))
                break
            await asyncio.sleep(0.25)

        print('RESULT DATA:', result)
        if result['expired_at'] is None:
            print('RESULT: FAIL - no expiry toast within 55s'); return 1
        ok = (result['left_at_expiry'] or 0) <= 1
        if MODE == 'rcvr-skew' and result['rcv_first_toast'] is not None and result['rcv_toast_gone'] is not None:
            life = result['rcv_toast_gone'] - result['rcv_first_toast']
            print('receiver toast lifetime: %.1fs' % life)
            ok = ok and life >= 29
        print('RESULT:', 'PASS' if ok else 'FAIL - expired toast shown with %ss left on the bar' % result['left_at_expiry'])
        await cs.close(); await cr.close(); await b.close()
        return 0 if ok else 1

sys.exit(asyncio.run(main()))
