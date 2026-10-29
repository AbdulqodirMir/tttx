import json, re, subprocess, time, sys, os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 8942
BASE = f'http://127.0.0.1:{PORT}/index.html'
results = []
def check(name, ok, info=''):
    results.append((name, bool(ok)))
    print(('PASS' if ok else 'FAIL'), name, info if not ok else '')

html = open(f'{ROOT}/index.html').read()
online = open(f'{ROOT}/online.js').read()

# ---------- static tests ----------
def static_tests():
    check('og:image absolute https', 'property="og:image" content="https://tttx.miraliyev.tech/og-cover.png"' in html)
    check('og:image:type present', 'property="og:image:type" content="image/png"' in html)
    check('og:site_name present', 'og:site_name' in html)
    check('twitter:image:alt present', 'twitter:image:alt' in html)
    check('gstatic preconnect', 'rel="preconnect" href="https://www.gstatic.com"' in html)
    check('fonts css non-blocking', 'media="print" onload="this.media=\'all\'"' in html)
    total = sum(os.path.getsize(f'{ROOT}/{f}') for f in ['index.html','online.js','js/fb.js','js/online.js','embed.js'])
    check('local bytes budget < 120KB', total < 120000, f'{total}')
    check('reduced-motion block covers breathe', re.search(r'prefers-reduced-motion:reduce\)\{[^}]*breathe|prefers-reduced-motion:reduce[\s\S]*?box\.live\.pX[^}]*animation:none', html))
    check('reduced-motion covers ripple', '.cell.rip::after{content:none' in html)
    check('reduced-motion covers winline', '#winline line.draw{animation:none;stroke-dashoffset:0}' in html)
    check('winline uses pathLength draw', 'pathLength' in html and 'drawline' in html)
    check('tap targets 44px rule', 'min-height:44px' in html)
    check('who-starts honesty note', 'takes effect on the next new game' in html)
    check('online: pageshow bfcache resync', "pageshow" in online and 'persisted' in online)
    check('online: stale invitee presence = offline', 'nowSrv()-pv.ts>90000' in online)
    check('online: connection lost toast', 'Connection lost' in online)
    # fmtOnlinePill logic via extraction
    m = re.search(r'function fmtOnlinePill\(n\)\{[^}]*\}', online)
    check('fmtOnlinePill extractable', bool(m))
    if m:
        import subprocess as sp
        js = m.group(0) + "\nconsole.log(fmtOnlinePill(0)+'|'+fmtOnlinePill(3))"
        out = sp.run(['node','-e',js],capture_output=True,text=True).stdout.strip()
        check('pill: alone = resting Online', out.split('|')[0].endswith('>Online'), out)
        check('pill: 3 others = "3 online"', out.endswith('3 online'), out)

# ---------- browser tests ----------
def browser_tests():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(viewport={'width':390,'height':844}).new_page()
        errors=[]
        pg.on('pageerror', lambda e: errors.append(str(e)))
        pg.goto(BASE); pg.wait_for_selector('#big .cell')
        pg.wait_for_timeout(300)

        # --- settings audit ---
        pg.click('#menu'); pg.wait_for_selector('#dlg[open]')
        # speed applies immediately to pace()
        p0 = pg.evaluate("window.__tttx.pace().beat")
        pg.click('#segSpeed button[data-v="normal"]')
        p1 = pg.evaluate("window.__tttx.pace().beat")
        check('settings: speed change switches pacing live', p0 != p1, f'{p0}->{p1}')
        check('settings: speed persisted', pg.evaluate("JSON.parse(localStorage.getItem('tttx')).cfg.speed")=='normal')
        # who starts applies to next new game
        pg.click('#segFirst button[data-v="O"]')
        pg.evaluate("window.__tttx.localNew()")
        check('settings: who-starts applies on next new game', pg.evaluate("window.__tttx.G.turn")=='O')
        pg.click('#segFirst button[data-v="X"]')
        # rule change persists + seg reflects real state
        pg.click('#segRule button[data-v="fill"]')
        check('settings: rule persisted', pg.evaluate("JSON.parse(localStorage.getItem('tttx')).cfg.rule")=='fill')
        check('settings: seg shows real rule', pg.evaluate("document.querySelector('#segRule button.on').dataset.v")=='fill')
        pg.click('#segRule button[data-v="line"]')
        # mode re-pick no-op
        pg.evaluate("window.__tttx.move(4,4)")
        cells_before = pg.evaluate("JSON.stringify(window.__tttx.G.cells)")
        pg.click('#segMode button[data-v="cpu"]')  # already cpu -> no-op
        check('settings: re-picking current mode keeps running game', pg.evaluate("JSON.stringify(window.__tttx.G.cells)")==cells_before)
        pg.click('#close')
        pg.wait_for_timeout(100)

        # --- glow pass (2p mode: no CPU timer interfering with effect timing) ---
        pg.evaluate("window.__tttx.cfg.mode='2p';window.__tttx.localNew()")
        # fresh board: no .cell.last
        check('glow: fresh board has no last-mark', pg.evaluate("document.querySelectorAll('.cell.last').length")==0)
        # make a move as X in cpu mode -> X cell gets .last and .rip right after
        pg.evaluate("window.__tttx.move(0,0)")
        pg.wait_for_timeout(120)
        check('glow: last move has thin-outline class', pg.evaluate("!!document.querySelector('.cell.last')"))
        check('glow: last move ripple fired', pg.evaluate("document.querySelectorAll('.cell.rip').length")==1)
        pg.wait_for_timeout(800)
        check('glow: ripple settles to outline only', pg.evaluate("document.querySelectorAll('.cell.rip').length")==0 and pg.evaluate("document.querySelectorAll('.cell.last').length")==1)
        # target box pulse: after move(0,0), opponent sent to box 0
        pg.evaluate("window.__tttx.localNew()")
        pg.evaluate("window.__tttx.move(0,0)")  # X plays; target=0
        check('glow: target box is .live', pg.evaluate("document.querySelectorAll('.box.live').length")==1 and pg.evaluate("document.querySelector('.box.live').dataset.b")=='0')
        dimmed = pg.evaluate("document.querySelectorAll('.box.dim').length")
        check('glow: other open boxes dimmed', dimmed>=7, f'dim={dimmed}')
        anim = pg.evaluate("getComputedStyle(document.querySelector('.box.live')).animationName")
        check('glow: target box breathes (animation)', 'breathe' in (anim or ''), anim)
        # capture -> cap shows W with shine + echo ghosts
        # X: (0,0); O: (3,0) somewhere harmless? O must play in box 0. Sequence: X(0,0) O(0,3)->target3 X(3,0)? need X line in box0... simpler: craft state via setG then render for winline, and play a real capture:
        pg.evaluate("window.__tttx.localNew()")
        pg.evaluate("window.__tttx.move(0,0)")  # X in box0 cell0, O sent to box0
        pg.evaluate("window.__tttx.move(0,4)")  # O box0 center, X sent to box4
        pg.evaluate("window.__tttx.move(4,1)")  # X box4 cell1, O sent to box1
        pg.evaluate("window.__tttx.move(1,0)")  # O box1 cell0 -> X to box0
        pg.evaluate("window.__tttx.move(0,1)")  # X box0 cell1 -> O to box1
        pg.evaluate("window.__tttx.move(1,4)")  # O box1 center -> X to box4
        pg.evaluate("window.__tttx.move(4,2)")  # X box4 cell2 -> captures box4? cells 0,1,2 = X X X? no: box4 cells 1 and 2... need top row: X played (4,1),(4,2) only 2. 
        st = pg.evaluate("JSON.stringify({cells:window.__tttx.G.cells[4],owner:window.__tttx.G.owner})")
        # Directly test capture visuals via crafted state: box 0 full X line, render, check cap
        pg.evaluate("""(()=>{const T=window.__tttx;const g=T.G;g.cells[0]=['X','X','X','','','','','',''];g.owner[0]='X';g.cells[1][0]='X';g.echo[1][0]=1;g.winner='';T.render()})()""")
        pg.wait_for_timeout(100)
        capcls = pg.evaluate("document.querySelector('.box[data-b=\"0\"] .cap').className")
        check('glow: captured box shows clean W fill', 'show' in capcls and 'W X' in capcls, capcls)
        ovf = pg.evaluate("getComputedStyle(document.querySelector('.box[data-b=\"0\"] .cap')).overflow")
        check('glow: cap clips one-time shine', ovf=='hidden', ovf)
        eanim = pg.evaluate("getComputedStyle(document.querySelector('.cell[data-b=\"1\"][data-i=\"0\"] .mark')).animationName")
        check('glow: echo mark fades in as ghost', eanim=='echoIn', eanim)
        # win line
        pg.evaluate("""(()=>{const T=window.__tttx;const g=T.G;g.owner=['X','X','X','','','','','',''];g.winner='X';T.render()})()""")
        pg.wait_for_timeout(50)
        wl = pg.evaluate("(()=>{const l=document.querySelector('#winline line');return l?{cls:l.getAttribute('class'),x1:l.getAttribute('x1'),y1:l.getAttribute('y1'),x2:l.getAttribute('x2'),y2:l.getAttribute('y2')}:null})()")
        check('glow: winning line drawn on big board', wl and 'draw' in wl['cls'] and 'X' in wl['cls'], json.dumps(wl))
        check('glow: winline spans first to third box', wl and abs(float(wl['x1'])-34)<2 and abs(float(wl['x2'])-266)<2 and wl['y1']==wl['y2'], json.dumps(wl))
        # new game clears winline
        pg.evaluate("window.__tttx.localNew()")
        check('glow: new game clears winline', pg.evaluate("!document.getElementById('winline')"))

        # --- reduced motion ---
        pg2 = b.new_context(viewport={'width':390,'height':844}, reduced_motion='reduce').new_page()
        pg2.goto(BASE); pg2.wait_for_selector('#big .cell')
        pg2.evaluate("window.__tttx.cfg.mode='2p';window.__tttx.localNew();window.__tttx.move(0,0)")
        pg2.wait_for_timeout(80)
        an = pg2.evaluate("getComputedStyle(document.querySelector('.box.live')).animationName")
        check('rm: target box does not pulse', an=='none', an)
        rp = pg2.evaluate("getComputedStyle(document.querySelector('.cell.rip'),'::after').content")
        check('rm: ripple suppressed', rp=='none', rp)
        pg2.evaluate("(()=>{const T=window.__tttx;const g=T.G;g.owner=['O','O','O','','','','','',''];g.winner='O';T.render()})()")
        dash = pg2.evaluate("getComputedStyle(document.querySelector('#winline line')).strokeDashoffset")
        an2 = pg2.evaluate("getComputedStyle(document.querySelector('#winline line')).animationName")
        check('rm: winline static, fully drawn', an2=='none' and dash in ('0px','0'), f'{an2} {dash}')

        # --- tap targets at 390px ---
        pg3 = b.new_context(viewport={'width':390,'height':844}).new_page()
        pg3.goto(BASE); pg3.wait_for_selector('#big .cell')
        hs = pg3.evaluate("[...document.querySelectorAll('header button')].map(b=>b.getBoundingClientRect().height)")
        check('tap: header chips >=44px', all(h>=44 for h in hs), str(hs))
        ps = pg3.evaluate("[...document.querySelectorAll('.pillrow button')].map(b=>b.getBoundingClientRect().height)")
        check('tap: pill buttons >=44px', all(h>=44 for h in ps), str(ps))
        pg3.click('#menu'); pg3.wait_for_selector('#dlg[open]')
        sb = pg3.evaluate("[...document.querySelectorAll('#dlg .seg button')].map(b=>b.getBoundingClientRect().height)")
        check('tap: settings seg buttons >=44px', all(h>=44 for h in sb), str(sb))
        pg3.click('#close')

        # --- layout regression at 360/390/412 ---
        for w in (360,390,412):
            pgw = b.new_context(viewport={'width':w,'height':800}).new_page()
            pgw.goto(BASE); pgw.wait_for_selector('#big .cell'); pgw.wait_for_timeout(200)
            over = pgw.evaluate("document.documentElement.scrollWidth>document.documentElement.clientWidth")
            check(f'layout: no horizontal overflow at {w}px', not over)
            pgw.context.close()

        check('no page errors', not errors, '; '.join(errors[:3]))
        b.close()

static_tests()
browser_tests()

# appended: chain choreography tests run inside browser_tests via separate function
def gating_tests():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(viewport={'width':390,'height':844}).new_page()
        pg.goto(BASE); pg.wait_for_selector('#big .cell'); pg.wait_for_timeout(200)

        def craft(pgx, speed):
            pgx.evaluate(f"""(()=>{{const T=window.__tttx;T.cfg.mode='2p';T.cfg.speed='{speed}';T.localNew();const g=T.G;
              g.cells[0]=['X','X','','','','','','',''];
              g.cells[1]=['','X','X','','','','','',''];
              g.turn='X';g.target=0;T.render()}})()""")

        # normal speed: cues hidden during cascade, revealed after
        craft(pg,'normal')
        pg.evaluate("window.__tttx.move(0,2)")
        pg.wait_for_timeout(60)
        st = pg.evaluate("""JSON.stringify({
          live:document.querySelectorAll('.box.live').length,
          dim:document.querySelectorAll('.box.dim').length,
          free:document.getElementById('big').className.includes('free'),
          can:document.querySelectorAll('.cell.can').length,
          chip:document.getElementById('chip').textContent,
          hint:document.getElementById('hint').textContent})""")
        st = json.loads(st)
        check('gate: no target glow during cascade', st['live']==0 and st['dim']==0 and not st['free'], st)
        check('gate: no playable-cell highlight during cascade', st['can']==0, st)
        check('gate: chip announces capture, not next turn', 'captures' in st['chip'], st['chip'])
        check('gate: hint empty during cascade', st['hint']=='', st['hint'])
        pg.wait_for_timeout(2600)  # normal chain ends ~2.4s
        st2 = json.loads(pg.evaluate("""JSON.stringify({
          liveOrFree:document.querySelectorAll('.box.live').length>0||document.getElementById('big').className.includes('free'),
          chip:document.getElementById('chip').textContent,
          hint:document.getElementById('hint').textContent})"""))
        check('gate: cues revealed after cascade', st2['liveOrFree'] and 'to move' in st2['chip'] and len(st2['hint'])>0, st2)

        # skip-by-tap reveals cues immediately without playing
        craft(pg,'slow')
        pg.evaluate("window.__tttx.move(0,2)")
        pg.wait_for_timeout(100)
        check('gate: slow still cascading at 1.4s', 'captures' in pg.evaluate("document.getElementById('chip').textContent"))
        pg.evaluate("window.__tttx.play(4,4)")
        pg.wait_for_timeout(50)
        st3 = json.loads(pg.evaluate("""JSON.stringify({
          liveOrFree:document.querySelectorAll('.box.live').length>0||document.getElementById('big').className.includes('free'),
          chip:document.getElementById('chip').textContent,
          turn:window.__tttx.G.turn})"""))
        check('gate: skip reveals cues instantly, no move played', st3['liveOrFree'] and 'to move' in st3['chip'] and st3['turn']=='O', st3)

        # cascade-to-win: winline and win chip wait for the cascade
        craft(pg,'normal')
        pg.evaluate("(()=>{const g=window.__tttx.G;g.owner[2]='X';window.__tttx.render()})()")
        pg.evaluate("window.__tttx.move(0,2)")
        pg.wait_for_timeout(60)
        st4 = json.loads(pg.evaluate("""JSON.stringify({
          winner:window.__tttx.G.winner,
          wl:!!document.getElementById('winline'),
          chip:document.getElementById('chip').textContent})"""))
        check('gate: win decided but winline waits for cascade', st4['winner']=='X' and not st4['wl'] and 'captures' in st4['chip'], st4)
        pg.wait_for_timeout(2600)
        st5 = json.loads(pg.evaluate("""JSON.stringify({
          wl:!!document.getElementById('winline'),
          chip:document.getElementById('chip').textContent})"""))
        check('gate: winline + win chip after cascade', st5['wl'] and 'wins' in st5['chip'], st5)

        # slow cascade window is longer than normal
        craft(pg,'slow')
        pg.evaluate("window.__tttx.move(0,2)")
        pg.wait_for_timeout(2600)
        check('gate: slow cascade still gated when normal would be done', 'captures' in pg.evaluate("document.getElementById('chip').textContent"))
        pg.wait_for_timeout(2800)
        check('gate: slow reveals after its own beat', 'to move' in pg.evaluate("document.getElementById('chip').textContent"))
        b.close()

gating_tests()
def chain_tests():
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_context(viewport={'width':390,'height':844}).new_page()
        pg.goto(BASE); pg.wait_for_selector('#big .cell'); pg.wait_for_timeout(200)
        pg.evaluate("window.__tttx.cfg.mode='2p';window.__tttx.cfg.speed='normal';window.__tttx.localNew()")
        # craft a chain: X captures box0 -> echo at cell0 of box1 completes X line there -> chain capture
        pg.evaluate("""(()=>{const T=window.__tttx;T.localNew();const g=T.G;
          g.cells[0]=['X','X','','','','','','',''];
          g.cells[1]=['','X','X','','','','','',''];
          g.turn='X';g.target=0;T.render()})()""")
        pg.evaluate("window.__tttx.move(0,2)")  # completes box0 top row
        pg.wait_for_timeout(80)
        n = pg.evaluate("window.__tttx.G.owner.filter(o=>o==='X').length")
        check('chain: capture cascaded to second box', n==2, f'X owns {n}')
        d0 = pg.evaluate("document.querySelector('.box[data-b=\"0\"] .cap').style.animationDelay")
        d1 = pg.evaluate("document.querySelector('.box[data-b=\"1\"] .cap').style.animationDelay")
        check('chain: captures scheduled step-by-step', d0 and d1 and float(d0[:-2]) < float(d1[:-2]), f'{d0} vs {d1}')
        ed = pg.evaluate("[...document.querySelectorAll('.cell.echo')].map(c=>c.style.animationDelay).filter(Boolean).length")
        check('chain: echo landings individually timed', ed>=6, f'{ed} echoes timed')
        src = pg.evaluate("[...document.querySelectorAll('.box')].filter(b=>b.className.includes('srcp')).length")
        check('chain: source box highlighted', src>=1, f'{src}')
        fanim = pg.evaluate("getComputedStyle(document.querySelector('.cell.echo')).animationName")
        check('chain: echo landing flashes', 'echoFlash' in (fanim or ''), fanim)
        # skip: tap during cascade fast-forwards, does not play a move
        turn = pg.evaluate("window.__tttx.G.turn")
        pg.evaluate("window.__tttx.play(4,4)")  # tap during cascade
        pg.wait_for_timeout(50)
        check('chain: tap during cascade skips without playing', pg.evaluate("window.__tttx.G.turn")==turn)
        check('chain: skip strips pending delays', pg.evaluate("[...document.querySelectorAll('.cap')].every(c=>!c.style.animationDelay)"))
        check('chain: skip leaves final board visible', pg.evaluate("document.querySelectorAll('.cap.show').length")==2)
        # speed setting still drives the cascade clock
        pg.evaluate("""(()=>{const T=window.__tttx;T.cfg.speed='slow';T.localNew();const g=T.G;
          g.cells[0]=['X','X','','','','','','',''];g.turn='X';g.target=0;T.render()})()""")
        pg.evaluate("window.__tttx.move(0,2)")
        slowCap = pg.evaluate("parseFloat(document.querySelector('.box[data-b=\"0\"] .cap').style.animationDelay)")
        check('chain: slow setting stretches the beat', slowCap>800, f'{slowCap}ms')
        b.close()

chain_tests()
fails=[n for n,ok in results if not ok]
print(f"\nTOTAL {len(results)-len(fails)}/{len(results)} PASS")

import sys as _s;_s.exit(1 if [n for n,ok in results if not ok] else 0)
