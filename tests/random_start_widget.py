from pathlib import Path
exec((Path(__file__).parent/'random_start_two_clients.py').read_text().split('async def main():')[0])
async def main():
 async with async_playwright() as p:
  b=await p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
  errors=[]
  async def make(name):
   c=await b.new_context(viewport={'width':390,'height':844},ignore_https_errors=True)
   await c.add_init_script('localStorage.setItem("tttx-hide","1");localStorage.setItem("tttx-nick",'+json.dumps(name)+')')
   async def route(r):
    path=r.request.url.split('tttx.miraliyev.tech',1)[1].split('?')[0];f=ROOT/('index.html' if path=='/' else path.lstrip('/'))
    if f.is_file():await r.fulfill(path=str(f))
    else:await r.continue_()
   await c.route('https://tttx.miraliyev.tech/**',route)
   page=await c.new_page();page.on('pageerror',lambda e:errors.append(str(e)))
   await page.goto('https://tttx.miraliyev.tech/');await page.wait_for_function('window.Online&&window.__tttx');return page
  setup=await make('Widget Seed')
  for coin in [0,4294967295]:
   rid=await setup.evaluate('''async()=>{const {db,ready}=await import('/js/fb.js');const D=await import('https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js');window.testD=D;window.testDb=db;const me=await ready;const id='test'+Math.random().toString(36).slice(2,8);await D.set(D.ref(db,'rooms/'+id),{createdAt:Date.now(),status:'waiting',host:me.uid,cfg:{rule:'line'},gameId:1,players:{X:{uid:me.uid,nick:'Widget Host',pending:true}},state:{cells:Array.from({length:9},()=>Array(9).fill('')),owner:Array(9).fill(''),turn:'X',target:-1,winner:'',echo:Array.from({length:9},()=>Array(9).fill(0))},moveCount:0,score:{X:4,O:2,D:1}});return id}''')
   joiner=await make('Widget Guest');host=await make('Widget Host')
   await joiner.context.add_init_script('const orig=crypto.getRandomValues.bind(crypto);crypto.getRandomValues=a=>{if(a instanceof Uint32Array&&a.length===1){a[0]='+str(coin)+';return a}return orig(a)}')
   await joiner.goto('https://tttx.miraliyev.tech/?room='+rid)
   await joiner.wait_for_function('Online.active()&&!Online.waiting()')
   await joiner.click('#startok');assert (await joiner.evaluate('Online.statusText().chip'))=='Waiting…'
   await joiner.evaluate('Online.tap(4,4)');assert await joiner.evaluate('__tttx.G.cells[4][4]')==''
   await host.goto('https://tttx.miraliyev.tech/?room='+rid+'&as=host');await host.wait_for_function('Online.active()&&!Online.waiting()')
   await host.click('#startok');await joiner.wait_for_function('Online.statusText().chip!=="Waiting…"')
   hs=await host.evaluate('Online.seat()');gs=await joiner.evaluate('Online.seat()');assert hs!=gs;assert gs==('X' if coin==0 else 'O')
   assert await host.evaluate('__tttx.score[Online.seat()]')==4
   assert await joiner.evaluate('__tttx.score[Online.seat()]')==2
   print('WIDGET RESERVED SEAT',hs,gs,'scores follow people PASS',flush=True)
   # Race two requests / repeat listeners. Exactly one new game commits.
   before=await setup.evaluate('''async id=>(await testD.get(testD.ref(testDb,'rooms/'+id))).val().gameId''',rid)
   await asyncio.gather(host.evaluate('Online.requestRematch();Online.requestRematch()'),joiner.evaluate('Online.requestRematch();Online.requestRematch()'))
   await host.wait_for_selector('#startnotice[open]');await host.wait_for_timeout(500)
   after=await setup.evaluate('''async id=>(await testD.get(testD.ref(testDb,'rooms/'+id))).val().gameId''',rid)
   assert after==before+1
   assert await host.evaluate('__tttx.score[Online.seat()]')==4
   assert await joiner.evaluate('__tttx.score[Online.seat()]')==2
   print('DUPLICATE REMATCH one round only PASS',flush=True)
   await host.evaluate('Online.leave()');await joiner.wait_for_function('!Online.active()')
  print('ERRORS',errors,flush=True);await b.close()
asyncio.run(main())
