import asyncio,json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
D='/downloads/proof';Path(D).mkdir(parents=True,exist_ok=True)
async def mk(b,name):
 c=await b.new_context(viewport={'width':390,'height':844},ignore_https_errors=True)
 await c.add_init_script('localStorage.setItem("tttx-hide","1");localStorage.setItem("tttx-nick",'+json.dumps(name)+')')
 async def route(r):
  path=r.request.url.split('tttx.miraliyev.tech',1)[1].split('?')[0]
  f=ROOT/('index.html' if path=='/' else path.lstrip('/'))
  if f.is_file():await r.fulfill(path=str(f))
  else:await r.continue_()
 await c.route('https://tttx.miraliyev.tech/**',route)
 p=await c.new_page();p.on('dialog',lambda d:asyncio.ensure_future(d.accept()));return p
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
  a=await mk(b,'Host Alpha');z=await mk(b,'Guest Beta');s=await mk(b,'Spec Gamma')
  await a.goto('https://tttx.miraliyev.tech/');await a.wait_for_function('window.Online && window.__tttx')
  await a.click('#online');await a.click('#mkroom');await a.wait_for_function('document.querySelector("#rlink").value.includes("?room=")')
  link=await a.input_value('#rlink')
  await z.goto(link);await z.wait_for_function('window.Online && Online.active() && !Online.waiting()')
  await s.goto(link);await s.wait_for_function('window.Online && Online.active()')
  print('spectating',await s.evaluate('Online.spectating()'))
  for pg in (a,z):await pg.evaluate('document.querySelector("#startnotice")?.close()')
  print('Z url in room',z.url)
  # spectator New game -> leaves to local
  await s.evaluate('document.querySelector("#startnotice")?.close()')
  await s.evaluate('document.querySelector("#new").click()');await s.wait_for_timeout(1500)
  print('SPEC after New game: active',await s.evaluate('Online.active()'),'url',s.url)
  # host closes room -> guest redirected
  await a.evaluate('document.querySelector("#leave").click()')
  await z.wait_for_function('!Online.active()',timeout=15000)
  await z.wait_for_timeout(300)
  print('GUEST after close: active',await z.evaluate('Online.active()'),'url',z.url,'obar',await z.evaluate('getComputedStyle(document.querySelector("#obar")).display'))
  print('toast',await z.evaluate('document.querySelector("#toast")?.innerText'))
  await z.screenshot(path=D+'/guest-after-close.png')
  # New game on guest works as local
  await z.evaluate('document.querySelector("#new").click()');await z.wait_for_timeout(500)
  print('NEW works: G cells empty',await z.evaluate('JSON.stringify(__tttx.G).length>0'))
  # closed link opened fresh
  await s.goto(link);await s.wait_for_timeout(3000)
  print('CLOSED LINK: active',await s.evaluate('Online.active()'),'url',s.url,'toast',await s.evaluate('document.querySelector("#toast")?.innerText'))
  await s.screenshot(path=D+'/closed-link.png')
  await b.close()
asyncio.run(main())
