"""Cancel/decline frees the sender immediately (real Firebase, local static files).

Phase 1: sender invites, cancels via the waitbar, re-invites at once.
Phase 2: sender invites, receiver declines, sender re-invites at once.

Asserted: no 'Slow down' / 'One invite at a time' toast ever appears, each re-invite
opens the waitbar again, and the receiver sees all three invites.
"""
import asyncio, json, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = Path('/downloads/proof') / 'cancel-reinvite'
OUT.mkdir(parents=True, exist_ok=True)
SUFFIX = str(int(time.time()))[-5:]
SENDER = 'CnclSend' + SUFFIX
RCVR = 'CnclRcvr' + SUFFIX

HOST_HTML = b"""<!doctype html><html><head><meta charset="utf-8"><title>host</title></head>
<body><script src="https://tttx.miraliyev.tech/embed.js" data-site="miraliyev.tech" defer></script></body></html>"""

SENDER_STATE = '''()=>({
    wb: document.querySelector('#waitbar').classList.contains('on'),
    wbText: (document.querySelector('#waitbar span')||{}).textContent||'',
    toast: (document.querySelector('#toast')||{}).textContent||''
})'''
RCV_TOAST = '''()=>{const el=document.querySelector('#tttx-embed');if(!el||!el.shadowRoot)return '';
    return el.shadowRoot.textContent.replace(/\\s+/g,' ').trim()}'''
RCV_DECLINE = '''()=>{const el=document.querySelector('#tttx-embed');if(!el||!el.shadowRoot)return false;
    const b=[...el.shadowRoot.querySelectorAll('.toast.in button.no')].pop();if(!b)return false;b.click();return true}'''

BLOCK = ("Slow down", "One invite at a time")

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

        cs = await b.new_context(ignore_https_errors=True, viewport={'width': 390, 'height': 844},
                                 record_video_dir=str(OUT), record_video_size={'width': 390, 'height': 844})
        await cs.route('**://tttx.miraliyev.tech/**', route_local)
        await cs.add_init_script('localStorage.setItem("tttx-hide","1");localStorage.setItem("tttx-nick",%s);' % json.dumps(SENDER))
        ps = await cs.new_page()
        await ps.goto('https://tttx.miraliyev.tech/index.html')

        cr = await b.new_context(ignore_https_errors=True, viewport={'width': 390, 'height': 844})
        await cr.route('**://tttx.miraliyev.tech/**', route_local)
        await cr.route('**://miraliyev.tech/**', route_local)
        await cr.add_init_script('localStorage.setItem("tttx-nick",%s);' % json.dumps(RCVR))
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

        fails = []
        invites_seen = 0

        async def invite_once(tag):
            await ps.evaluate('Online.debugInvite(%s, %s)' % (json.dumps(uid), json.dumps(RCVR)))
            for _ in range(40):
                st = await ps.evaluate(SENDER_STATE)
                for bad in BLOCK:
                    if bad in st['toast']:
                        fails.append('%s: blocked toast %r' % (tag, st['toast'][:80]))
                if st['wb']:
                    print('%s: waitbar on: %s' % (tag, st['wbText']))
                    return True
                await asyncio.sleep(0.25)
            fails.append('%s: waitbar never appeared' % tag)
            return False

        async def receiver_sees_invite(tag):
            nonlocal invites_seen
            for _ in range(40):
                rt = await pr.evaluate(RCV_TOAST)
                if 'invites you' in rt:
                    invites_seen += 1
                    print('%s: receiver toast: %s' % (tag, rt[:90]))
                    return True
                await asyncio.sleep(0.25)
            fails.append('%s: receiver never saw the invite' % tag)
            return False

        # ---- phase 1: cancel -> immediate re-invite ----
        await invite_once('p1-invite')
        await receiver_sees_invite('p1-invite')
        await ps.click('#waitcancel')
        await asyncio.sleep(0.5)
        st = await ps.evaluate(SENDER_STATE)
        print('p1: after cancel toast=%r' % st['toast'][:60])
        await ps.screenshot(path=str(OUT / 'p1_cancelled.png'))
        await invite_once('p1-reinvite')
        await receiver_sees_invite('p1-reinvite')
        await ps.screenshot(path=str(OUT / 'p1_reinvited.png'))

        # ---- phase 2: decline -> immediate re-invite ----
        for _ in range(40):
            if await pr.evaluate(RCV_DECLINE): break
            await asyncio.sleep(0.25)
        else:
            fails.append('p2: receiver decline button never appeared')
        declined = False
        for _ in range(40):
            st = await ps.evaluate(SENDER_STATE)
            for bad in BLOCK:
                if bad in st['toast']:
                    fails.append('p2-decline: blocked toast %r' % st['toast'][:80])
            if 'declined' in st['toast']:
                declined = True
                print('p2: sender saw decline: %r' % st['toast'][:60])
                break
            await asyncio.sleep(0.25)
        if not declined:
            fails.append('p2: sender never saw the decline')
        await ps.screenshot(path=str(OUT / 'p2_declined.png'))
        await invite_once('p2-reinvite')
        await receiver_sees_invite('p2-reinvite')
        await ps.screenshot(path=str(OUT / 'p2_reinvited.png'))

        # leave nothing pending: cancel the last invite
        try:
            await ps.click('#waitcancel', timeout=2000)
        except Exception:
            pass

        print('invites seen by receiver:', invites_seen)
        if fails:
            print('RESULT: FAIL'); [print(' -', f) for f in fails]; code = 1
        else:
            print('RESULT: PASS'); code = 0
        await cs.close(); await cr.close(); await b.close()
        return code

sys.exit(asyncio.run(main()))
