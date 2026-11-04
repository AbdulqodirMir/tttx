import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
Path('/downloads/proof').mkdir(parents=True,exist_ok=True)
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
  contexts=[];pages=[];errors=[]
  for name in ['Starter Alpha','Starter Beta']:
   c=await b.new_context(viewport={'width':390,'height':844},ignore_https_errors=True)
   await c.add_init_script('localStorage.setItem("tttx-hide","1");localStorage.setItem("tttx-nick",'+json.dumps(name)+')')
   async def route(r):
    path=r.request.url.split('tttx.miraliyev.tech',1)[1].split('?')[0]
    f=ROOT/('index.html' if path=='/' else path.lstrip('/'))
    if f.is_file():await r.fulfill(path=str(f))
    else:await r.continue_()
   await c.route('https://tttx.miraliyev.tech/**',route)
   page=await c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   contexts.append(c);pages.append(page)
  a,z=pages
  await a.goto('https://tttx.miraliyev.tech/');await a.wait_for_function('window.Online && window.__tttx')
  await a.click('#online');await a.click('#mkroom');await a.wait_for_function('document.querySelector("#rlink").value.includes("?room=")')
  link=await a.input_value('#rlink');print('ROOM',link,flush=True)
  await z.goto(link);await z.wait_for_function('window.Online && Online.active() && !Online.waiting()')
  await a.wait_for_function('!Online.waiting()')
  await a.wait_for_function('document.querySelector("#startsteps").textContent.includes("moves first")')
  print('A',await a.locator('#startnotice').inner_text(),'Z',await z.locator('#startnotice').inner_text(),flush=True)
  print('SEATS',await a.evaluate('Online.seat()'),await z.evaluate('Online.seat()'),flush=True)
  await a.screenshot(path='/downloads/proof/alpha-start.png');await z.screenshot(path='/downloads/proof/beta-start.png')
  await a.click('#startok');await z.click('#startok')
  x=a if await a.evaluate('Online.seat()')=='X' else z;o=z if x==a else a
  await x.click('#swapseat');await o.wait_for_selector('#toast.ask');await o.screenshot(path='/downloads/proof/offer.png')
  await o.locator('#toast button.ok').click();await o.wait_for_function('Online.seat()==="X"');await x.wait_for_function('Online.seat()==="O"')
  assert not await o.locator('#swapseat').is_visible()
  print('SWAP PASS',flush=True)
  # Play from the new X client; confirm board equality.
  await o.evaluate('Online.tap(4,4)');await x.wait_for_function('window.__tttx.G.cells[4][4]==="X"')
  assert await a.evaluate('JSON.stringify(__tttx.G.cells)')==await z.evaluate('JSON.stringify(__tttx.G.cells)')
  print('MOVE SYNC PASS',flush=True)
  # Both request a new round, repeat to exercise both draw outcomes.
  draws=[]
  for i in range(8):
   await a.evaluate('Online.requestRematch()');await z.evaluate('Online.requestRematch()')
   if i==0:await a.wait_for_function('__tttx.G.cells[4][4]===""')
   await a.wait_for_timeout(650)
   sa=await a.evaluate('Online.seat()');sz=await z.evaluate('Online.seat()');assert sa!=sz
   draws.append(sa)
   assert await a.locator('#startnotice').is_visible()
   await a.click('#startok');await z.click('#startok')
  print('REMATCH DRAWS',draws,flush=True)
  print('ERRORS',errors,flush=True)
  await a.screenshot(path='/downloads/proof/alpha-rematch.png');await z.screenshot(path='/downloads/proof/beta-rematch.png')
  # Close through real cleanup hook, so no test room/presence left behind.
  await a.evaluate('Online.leave()');await z.wait_for_function('!Online.active()')
  await b.close()
asyncio.run(main())
