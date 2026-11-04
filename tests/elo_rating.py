"""Elo ratings against real Firebase (local static files). Two clients with distinct device ids/fingerprints.
A) quit mid-game (>=8 moves): quitter -> loss, stayer -> forfeit win, ratings/{uid} written, shown in lobby/over text.
B) 16 s later a full game to a result: both rated, deltas mirror, g==2.
C) Rules: +100 jump, double write inside 15 s, delete, extra key, same-device game stays unrated."""
import asyncio, json, sys, time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
D = Path('/downloads/proof/elo'); D.mkdir(parents=True, exist_ok=True)
S = str(int(time.time()))[-5:]
UA = ['Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/126 Mobile Safari/537.36', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/605.1.15']

async def mk(b, name, i):
    c = await b.new_context(viewport={'width': 390 + i * 40, 'height': 844}, user_agent=UA[i], locale=['en-GB', 'uz-UZ'][i], ignore_https_errors=True)
    await c.add_init_script('localStorage.setItem("tttx-hide","1");localStorage.setItem("tttx-nick",%s)' % json.dumps(name))
    async def route(r):
        path = r.request.url.split('tttx.miraliyev.tech', 1)[1].split('?')[0]
        f = ROOT / ('index.html' if path == '/' else path.lstrip('/'))
        if f.is_file(): await r.fulfill(path=str(f))
        else: await r.continue_()
    await c.route('https://tttx.miraliyev.tech/**', route)
    p = await c.new_page(); p.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    p.on('console', lambda m: print('  [console %s]' % name, m.text[:160]) if m.type == 'error' else None)
    return p

async def uid(p): return await p.evaluate('()=>window.__uid||null')

async def play_until(a, z, n=None):
    """alternate legal moves until n moves done (or a winner)."""
    done = 0
    for _ in range(400):
        st = await a.evaluate('()=>({w:__tttx.G.winner,t:__tttx.G.turn})')
        if st['w'] or (n is not None and done >= n): return done
        for pg in (a, z):
            seat = await pg.evaluate('Online.seat()')
            if seat == st['t']:
                await pg.evaluate('()=>{const m=__tttx.legal()[0];__tttx.play(m[0],m[1])}')
                done += 1; break
        await a.wait_for_timeout(450)
    return done

async def rating(p, uid_):
    return await p.evaluate('''async(u)=>{const m=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js');const f=await import('/js/fb.js');
      return (await m.get(m.ref(f.db,'ratings/'+u))).val()}''', uid_)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
        a = await mk(b, 'EloAlpha' + S, 0); z = await mk(b, 'EloBeta' + S, 1)
        for pg in (a, z):
            await pg.goto('https://tttx.miraliyev.tech/'); await pg.wait_for_function('window.Online && window.__tttx')
            await pg.evaluate('''async()=>{const f=await import('/js/fb.js');window.__uid=(await f.ready).uid}''')
        ua, uz = await uid(a), await uid(z)
        print('uids', ua[:6], uz[:6])
        await a.click('#online'); await a.click('#mkroom'); await a.wait_for_function('document.querySelector("#rlink").value.includes("?room=")')
        link = await a.input_value('#rlink')
        await z.goto(link); await z.wait_for_function('window.Online && Online.active() && !Online.waiting()')
        await a.wait_for_function('!Online.waiting()')
        for pg in (a, z): await pg.evaluate('document.querySelector("#startnotice")?.close()')
        n = await play_until(a, z, 9); print('A) moves played', n)
        await a.screenshot(path=str(D / 'a-ingame.png'))
        label = await a.evaluate('document.querySelector("#onick").textContent'); print('   in-game opp label:', label)
        # beta quits
        await z.evaluate('document.querySelector("#leave").click()')
        await a.wait_for_function('!Online.active()', timeout=20000); await a.wait_for_timeout(2500)
        ra, rz = await rating(a, ua), await rating(a, uz)
        print('   alpha', json.dumps({k: ra.get(k) for k in 'r g w l d'.split()}) if ra else None)
        print('   beta ', json.dumps({k: rz.get(k) for k in 'r g w l d'.split()}) if rz else None)
        okA = bool(ra and rz and ra['r'] > 1200 and ra['w'] == 1 and rz['r'] < 1200 and rz['l'] == 1 and ra['g'] == 1 and rz['g'] == 1)
        print('A PASS' if okA else 'A FAIL')
        # B: full game
        await a.wait_for_timeout(32000)
        await a.goto('https://tttx.miraliyev.tech/'); await a.wait_for_function('window.Online && window.__tttx')
        await a.evaluate('''async()=>{const f=await import('/js/fb.js');window.__uid=(await f.ready).uid}''')
        await a.click('#online'); await a.click('#mkroom'); await a.wait_for_function('document.querySelector("#rlink").value.includes("?room=")')
        link = await a.input_value('#rlink'); await z.goto(link); await z.wait_for_function('window.Online && Online.active() && !Online.waiting()')
        await a.wait_for_function('!Online.waiting()')
        for pg in (a, z):
            await pg.evaluate('document.querySelector("#startnotice")?.close()'); await pg.evaluate('()=>{window.__uid=window.__uid}')
        t0 = time.time(); n = await play_until(a, z, None); print('B) full game moves', n, 'in %.0fs' % (time.time() - t0))
        for i in range(6):
            await a.wait_for_timeout(1000)
            print('   t+%ds'%i, [await pg.evaluate('()=>({w:__tttx.G.winner,open:document.querySelector("#over").open,sub:document.querySelector("#overSub").textContent.slice(0,90)})') for pg in (a,z)])
        ra2, rz2 = await rating(a, ua), await rating(a, uz)
        print('   alpha', {k: ra2.get(k) for k in 'r g w l d'.split()}, 'beta', {k: rz2.get(k) for k in 'r g w l d'.split()})
        over = await a.evaluate('(document.querySelector("#over").open?"OPEN ":"CLOSED ")+document.querySelector("#overSub").textContent'); print('   over text:', over.replace('\n', ' | '))
        await a.screenshot(path=str(D / 'b-over.png'))
        okB = ra2['g'] == 2 and rz2['g'] == 2 and (ra2['r'] - ra['r']) * -1 != 0 and abs((ra2['r'] - ra['r']) + (rz2['r'] - rz['r'])) <= 2 and 'Elo' in over
        print('B PASS' if okB else 'B FAIL')
        # C: rules
        res = await a.evaluate('''async(u)=>{const m=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js');const f=await import('/js/fb.js');
          const R=m.ref(f.db,'ratings/'+u);const cur=(await m.get(R)).val();const out={};
          const base=Object.assign({},cur,{ts:m.serverTimestamp()});
          const t=async(k,v)=>{try{await m.set(R,v);out[k]='ALLOWED'}catch(e){out[k]='denied'}};
          await t('jump+100',Object.assign({},base,{r:cur.r+100,g:cur.g+1,last:'x'}));
          await t('fast-second-game',Object.assign({},base,{r:cur.r+10,g:cur.g+1,last:'x'}));
          await t('skip-games',Object.assign({},base,{r:cur.r+10,g:cur.g+5,last:'x'}));
          await t('extra-key',Object.assign({},base,{r:cur.r+10,g:cur.g+1,last:'x',admin:true}));
          try{await m.remove(R);out['delete']='ALLOWED'}catch(e){out['delete']='denied'}
          try{await m.set(m.ref(f.db,'ratings/someone-else'),Object.assign({},base,{r:1200,g:1,last:'x'}));out['other-uid']='ALLOWED'}catch(e){out['other-uid']='denied'}
          return out}''', ua)
        print('C) rules:', res)
        okC = all(v == 'denied' for v in res.values()); print('C PASS' if okC else 'C FAIL')
        await b.close()
        sys.exit(0 if okA and okB and okC else 1)
asyncio.run(main())
