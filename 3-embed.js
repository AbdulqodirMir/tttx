// TTTX site embed: visitors on miraliyev.tech / miraliyev.me / miraliyev.app show up
// as online in TTTX and can receive game invites without leaving the site.
// One-line install on any page: <script type="module" src="https://tttx.miraliyev.tech/embed.js"></script>
import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {getAuth,signInAnonymously} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';
import {getDatabase,ref,get,update,onValue,onDisconnect,serverTimestamp,set} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

const GAME='https://tttx.miraliyev.tech/';
const cfg={
  apiKey:"AIzaSyCQpNHsTtu7k6u2IXqIngNk4eX1dvCljcY",
  authDomain:"tttx-e7404.firebaseapp.com",
  databaseURL:"https://tttx-e7404-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:"tttx-e7404",
  storageBucket:"tttx-e7404.firebasestorage.app",
  messagingSenderId:"862633433956",
  appId:"1:862633433956:web:bce95cf065d73d0858f871"
};

// Never run on the game site itself.
if(location.hostname!=='tttx.miraliyev.tech'){

const ADJ=['Swift','Calm','Bright','Lucky','Quiet','Merry','Bold','Clever','Gentle','Jolly','Keen','Mighty','Nimble','Proud','Rapid','Sunny','Witty','Zesty','Cosy','Eager'];
const ANI=['Fox','Owl','Bear','Wolf','Lynx','Hawk','Deer','Frog','Crow','Seal','Wren','Elk','Jay','Mole','Hare','Newt','Ibex','Toad','Vole','Puma'];
const newNick=()=>ADJ[Math.random()*ADJ.length|0]+ANI[Math.random()*ANI.length|0]+(10+Math.random()*90|0);
let myNick=localStorage.getItem('tttx-nick')||newNick();
localStorage.setItem('tttx-nick',myNick);
const site=location.hostname.replace(/^www\./,'');

const app=initializeApp(cfg,'tttx-embed');
const auth=getAuth(app);
const db=getDatabase(app);
const me=(await signInAnonymously(auth)).user;

// server clock offset for sane invite expiry across skewed devices
let tOff=0;
onValue(ref(db,'.info/serverTimeOffset'),s=>{tOff=s.val()||0});

// ---- presence: appear online in the TTTX lobby ----
const p=ref(db,'presence/'+me.uid);
const beat=()=>set(p,{nick:myNick,ts:serverTimestamp(),hide:false,room:null,site});
beat();onDisconnect(p).remove();
setInterval(beat,25000);

// ---- invite toast (self-styled, no CSS dependencies) ----
function ask(fromNick,accept,decline){
  const el=document.createElement('div');
  el.setAttribute('role','alert');
  el.style.cssText='position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483647;background:rgba(10,12,24,.97);color:#f5f3ee;border:1px solid rgba(245,243,238,.25);border-radius:99px;padding:10px 16px;font:14px/1.4 system-ui,-apple-system,sans-serif;display:flex;gap:8px;align-items:center;box-shadow:0 12px 40px rgba(0,0,0,.55);max-width:92vw;flex-wrap:wrap;justify-content:center';
  const s=document.createElement('span');
  s.textContent=fromNick+' invites you to play TicTacToe Extended';
  const mk=(label,primary)=>{
    const b=document.createElement('button');b.textContent=label;
    b.style.cssText='font:inherit;font-size:13px;padding:6px 14px;border-radius:99px;cursor:pointer;color:#f5f3ee;border:1px solid '+(primary?'rgba(255,93,143,.55);background:rgba(255,93,143,.18)':'rgba(245,243,238,.25);background:rgba(245,243,238,.06)');
    return b;
  };
  const a=mk('Accept',true),d=mk('Decline',false);
  el.append(s,a,d);
  (document.body||document.documentElement).appendChild(el);
  const kill=()=>el.remove();
  a.onclick=()=>{kill();accept()};
  d.onclick=()=>{kill();decline(false)};
  setTimeout(()=>{if(el.isConnected){kill();decline(true)}},60000);
}

// ---- invites: get pinged from the TTTX lobby ----
onValue(ref(db,'invites/'+me.uid),snap=>{
  const v=snap.val()||{},now=Date.now()+tOff;
  for(const[k,iv]of Object.entries(v)){
    if(!iv||iv.status!=='pending'||!iv.ts||now-iv.ts>60000)continue;
    if(iv._shown)continue;iv._shown=true;
    const ir=ref(db,'invites/'+me.uid+'/'+k);
    ask(iv.fromNick||'Someone',
      // Accept: let the game page itself claim the O seat (its own session), just open it.
      ()=>{update(ir,{status:'accepted'}).catch(()=>{});window.open(GAME+'?room='+iv.roomId,'_blank')},
      (silent)=>{update(ir,{status:silent?'expired':'declined'}).catch(()=>{});
        if(!silent)update(ref(db,'rooms/'+iv.roomId),{'players/O':{uid:me.uid,nick:myNick,declined:true}}).catch(()=>{})});
    break; // one toast at a time
  }
});

}
