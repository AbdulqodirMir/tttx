// TTTX online: rooms + invite links, presence list + gentle invites, rematch, spectate.
import {db,ready} from '../js/fb.js';
import {ref,get,set,update,remove,push,onValue,onDisconnect,serverTimestamp,increment} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

const $=s=>document.querySelector(s);
const T=()=>window.__tttx;
const ADJ=['Swift','Calm','Bright','Lucky','Quiet','Merry','Bold','Clever','Gentle','Jolly','Keen','Mighty','Nimble','Proud','Rapid','Sunny','Witty','Zesty','Cosy','Eager'];
const ANI=['Fox','Owl','Bear','Wolf','Lynx','Hawk','Deer','Frog','Crow','Seal','Wren','Elk','Jay','Mole','Hare','Newt','Ibex','Toad','Vole','Puma'];
const nick=()=>ADJ[Math.random()*ADJ.length|0]+ANI[Math.random()*ANI.length|0]+(10+Math.random()*90|0);
const rid=()=>{const a='abcdefghjkmnpqrstuvwxyz23456789';let s='';for(let i=0;i<6;i++)s+=a[Math.random()*a.length|0];return s};

let tOff=0;
let me=null, myNick=localStorage.getItem('tttx-nick')||nick();
localStorage.setItem('tttx-nick',myNick);
let room=null, roomId=null, seat=null, spectate=false, seenMC=-1, roomOff=null, inviteOff=null, sentInvite=null;
let hb=0;

const Online={active:()=>!!room, seat:()=>seat, spectating:()=>spectate};
window.Online=Online;

let roomLink='';
function flashBtn(btn){if(!btn)return;const old=btn.textContent;btn.textContent='Copied!';btn.disabled=true;setTimeout(()=>{btn.textContent=old;btn.disabled=false},1800)}
function copyText(txt,btn){
  const done=()=>{flashBtn(btn);toast('Link copied')};
  if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(txt).then(done).catch(()=>{legacyCopy(txt);done()});
  else{legacyCopy(txt);done()}
}
function legacyCopy(txt){const i=$('#rlink');if(i&&i.value===txt){i.select();try{document.execCommand('copy')}catch(e){}}else{const t=document.createElement('textarea');t.value=txt;document.body.appendChild(t);t.select();try{document.execCommand('copy')}catch(e){}t.remove()}}
function shareLink(){if(roomLink&&navigator.share)navigator.share({title:'TicTacToe Extended',text:'Play TicTacToe Extended with me',url:roomLink}).catch(()=>{})}
function toast(msg,ms=2600){const t=$('#toast');t.textContent=msg;if(!t.open)t.show();t.className='show';clearTimeout(t._h);t._h=setTimeout(()=>{t.className='';t.close()},ms)}
const wbShow=e=>{if(e&&!e.open)e.show()};const wbHide=e=>{if(e&&e.open)e.close()};
function toastAsk(fromNick,accept,decline){
  const t=$('#toast');t.innerHTML='';
  const s=document.createElement('span');s.textContent=fromNick+' invites you to play';
  const a=document.createElement('button');a.textContent='Accept';a.className='ok';
  const d=document.createElement('button');d.textContent='Decline';
  a.onclick=()=>{t.className='';t.close();accept()};d.onclick=()=>{t.className='';t.close();decline()};
  t.append(s,a,d);if(!t.open)t.show();t.className='show ask';
  clearTimeout(t._h);t._h=setTimeout(()=>{if(t.className){t.className='';t.close();decline(true)}},60000);
}

// ---------- presence ----------
let plistOn=false;
async function presenceOn(){
  me=await ready;
  onValue(ref(db,'.info/serverTimeOffset'),s=>{tOff=s.val()||0});
  const p=ref(db,'presence/'+me.uid);
  const hide=localStorage.getItem('tttx-hide')==='1';
  const beat=()=>set(p,{nick:myNick,ts:serverTimestamp(),hide,room:roomId||null});
  beat();onDisconnect(p).remove();
  clearInterval(hb);hb=setInterval(beat,25000);
  if(plistOn)return;plistOn=true;
  onValue(ref(db,'presence'),snap=>{
    const v=snap.val()||{},now=Date.now()+tOff;
    const list=Object.entries(v).filter(([u,p])=>u!==me.uid&&p&&!p.hide&&p.ts&&now-p.ts<90000);
    $('#pcount').textContent=list.length;
    const ob=$('#online');if(ob)ob.innerHTML='<span class="dot"></span>'+(list.length+1)+' online';
    const el=$('#plist');el.innerHTML='';
    if(!list.length){el.innerHTML='<p class="dim">Nobody else here yet. Share an invite link!</p>';return}
    for(const[u,p]of list){
      const row=document.createElement('div');row.className='pitem';
      const dot=document.createElement('span');dot.className='dot'+(p.room?' busy':'');
      const n=document.createElement('span');n.className='nick';n.textContent=p.nick;
      const st=document.createElement('span');st.className='st';st.textContent=p.room?'· in a game':'· free';
      const b=document.createElement('button');
      if(p.room){b.textContent='In a game';b.disabled=true}
      else{b.textContent='Invite';b.onclick=()=>sendInvite(u,p.nick,b)}
      row.append(dot,n,st,b);el.appendChild(row);
    }
  });
}

// ---------- rooms ----------
function freshState(){return{cells:Array.from({length:9},()=>Array(9).fill('')),owner:Array(9).fill(''),turn:'X',target:-1,winner:'',last:null,echo:Array.from({length:9},()=>Array(9).fill(0))}}
async function createRoom(){
  const rate=(await get(ref(db,'rate/'+me.uid))).val()||{};
  if(rate.lastRoom&&Date.now()-rate.lastRoom<30000){toast('Slow down - try again in a few seconds');return null}
  for(let tries=0;tries<5;tries++){
    const id=rid(),r=ref(db,'rooms/'+id);
    if((await get(r)).exists())continue;
    await set(r,{createdAt:serverTimestamp(),status:'waiting',host:me.uid,players:{X:{uid:me.uid,nick:myNick},O:null},state:freshState(),anim:null,moveCount:0,score:{X:0,O:0,D:0}});
    update(ref(db,'rate/'+me.uid),{lastRoom:Date.now()});
    return id;
  }
  toast('Could not create a room, try again');return null;
}
function enterRoom(id,asSeat,spec,keepLobby){
  roomId=id;seat=asSeat;spectate=spec;seenMC=-1;
  set(ref(db,'presence/'+me.uid+'/room'),id).catch(()=>{});
  if(!keepLobby)$('#lobby').close();
  const r=ref(db,'rooms/'+id);
  if(roomOff)roomOff();
  roomOff=onValue(r,snap=>{
    const v=snap.val();
    if(!v){
      if(room){
        const hadOpp=room.players&&room.players.X&&room.players.O;
        cleanupRoom();
        const oppNick=hadOpp?((room.players[seat==='X'?'O':'X']||{}).nick||'Opponent'):'Opponent';toast(hadOpp?oppNick+' left - back to local play':'Room closed');
      }
      return
    }
    room=v;
    if(v.players){if(v.players.X&&v.players.X.uid===me.uid)seat='X';else if(v.players.O&&v.players.O.uid===me.uid)seat='O'}
    const opp=seat==='X'?v.players&&v.players.O:v.players&&v.players.X;
    $('#obar').style.display='flex';
    const wb=$('#waitbar');(!spec&&v.status==='waiting')?wbShow(wb):wbHide(wb);
    if(!spec&&v.status==='waiting'){wb.querySelector('span').textContent='Room ready - send this link, then stay on this page';const wcx=$('#waitcancel');if(wcx)wcx.style.display='none'}
    $('#leave').textContent=spec?'Leave':(v.host===me.uid?'Close room':'Leave game');
    $('#onick').textContent=spectate?'Spectating':(opp&&opp.nick?('vs '+opp.nick):'Waiting for opponent…');
    if(v.score){const s=T().score;s.X=v.score.X||0;s.O=v.score.O||0;s.D=v.score.D||0}
    if(v.state&&typeof v.moveCount==='number'&&v.moveCount!==seenMC){
      const fresh=seenMC===-1;
      seenMC=v.moveCount;
      if(true){
        const h=T().G.hist;
        T().setG(Object.assign(JSON.parse(JSON.stringify(v.state)),{hist:fresh?[]:h}));
        const a=v.anim;
        if(a&&v.lastMoveBy!==me.uid){const g=T().G;g.lastEchoes=a.echoes||null;g.lastChainCaps=a.caps||null;g.lastChainGlow=a.glow||null;g.lastOpps=a.opps||null}
        T().render();
        if(v.state.winner)setTimeout(()=>T().showOver(),650);
        else if($('#over').open)$('#over').close();
      }
    }else T().render(); // refresh names/seat/chip/lock even when no move landed
    // rematch handshake: both flagged -> host resets with swapped seats
    if(v.rematch&&v.rematch.X&&v.rematch.O&&v.host===me.uid){
      const px=v.players.X,po=v.players.O;
      update(r,{players:{X:po,O:px},state:freshState(),anim:null,moveCount:0,rematch:null,status:'playing'});
    }
  });
  // opponent presence watch
  if(!spec&&inviteOff===null){/* presence of opponent handled via nick line */ }
}
function cleanupRoom(){
  if(roomOff){roomOff();roomOff=null}
  room=null;roomId=null;seat=null;spectate=false;seenMC=-1;roomLink='';
  $('#obar').style.display='none';
  wbHide($('#waitbar'));
  if(me)set(ref(db,'presence/'+me.uid+'/room'),null).catch(()=>{});
  T().localNew();
}
function leaveRoom(){
  const r=room,id=roomId;
  const iPlay=r&&id&&!spectate&&r.players&&((r.players.X&&r.players.X.uid===me.uid)||(r.players.O&&r.players.O.uid===me.uid));
  cleanupRoom();
  if(iPlay)remove(ref(db,'rooms/'+id)).catch(()=>{});
}
Online.leave=leaveRoom;
Online.names=function(){if(!room)return null;const px=room.players&&room.players.X,po=room.players&&room.players.O;return{X:px&&px.nick||'\u2026',O:po&&po.nick||'\u2026'}};
Online.waiting=function(){return!!(room&&room.status==='waiting')};

// move hook: called inside move() after play(), before persist/render
Online.onLocalMove=function(){
  if(!room||spectate)return;
  const g=T().G;
  const anim={echoes:g.lastEchoes||null,caps:g.lastChainCaps||null,glow:g.lastChainGlow||null,opps:g.lastOpps||null};
  const st=JSON.parse(JSON.stringify({cells:g.cells,owner:g.owner,turn:g.turn,target:g.target,winner:g.winner,last:g.last,echo:g.echo}));
  const upd={state:st,anim,moveCount:(room.moveCount||0)+1,lastMoveBy:me.uid,status:'playing'};
  if(g.winner)upd['score/'+g.winner]=increment(1);
  seenMC=upd.moveCount;
  update(ref(db,'rooms/'+roomId),upd).catch(e=>console.warn('move write failed',e));
};
// tap hook: returns true when the tap was handled online
Online.tap=function(b,i){
  if(!room)return false;
  if(spectate){T().warn('You are spectating');return true}
  if(room.status==='waiting'){T().warn('Waiting for opponent to join');return true}
  const g=T().G;
  if(g.winner)return true;
  if(g.turn!==seat){T().warn("Opponent's turn");return true}
  if(!T().legal().some(m=>m[0]===b&&m[1]===i)){T().badTap(b,i);return true}
  T().move(b,i); // local apply; onLocalMove hook ships it
  return true;
};
Online.statusText=function(){
  if(!room)return null;
  const g=T().G;
  if(spectate)return{chip:g.winner?(g.winner==='D'?'Draw':(T().mkIco?T().mkIco(g.winner):g.winner)+' wins'):(T().mkIco?T().mkIco(g.turn):g.turn)+' to move',hint:'Spectating'};
  if(room.status==='waiting')return{chip:'Waiting…',hint:'Share the invite link'};
  if(g.winner)return null; // default over text
  return{chip:g.turn===seat?'Your move':(room.players[otherSeat()]||{}).nick+' to move',hint:g.turn===seat?'':'Wait for your turn'};
};
function otherSeat(){return seat==='X'?'O':'X'}
Online.requestRematch=function(){
  if(!room||spectate)return;
  set(ref(db,'rooms/'+roomId+'/rematch/'+seat),true).catch(()=>{});
  toast('Rematch offered');
};

// ---------- invites ----------
async function sendInvite(toUid,toNick,btn){
  const rate=(await get(ref(db,'rate/'+me.uid))).val()||{};
  if(rate.lastInvite&&Date.now()-rate.lastInvite<10000){toast('One invite at a time - wait a few seconds');return}
  const id=await createRoom();if(!id)return;
  const ir=push(ref(db,'invites/'+toUid));
  await set(ir,{from:me.uid,fromNick:myNick,roomId:id,ts:serverTimestamp(),status:'pending'});
  update(ref(db,'rate/'+me.uid),{lastInvite:Date.now()});
  btn.disabled=true;btn.textContent='Sent';
  $('#lobby').close();
  toast('Invite sent to '+toNick);
  roomLink=location.origin+location.pathname+'?room='+id;
  const wb=$('#waitbar');wbShow(wb);
  wb.querySelector('span').textContent='Invited '+toNick+' - waiting for answer (60s)';
  const wc=$('#waitcancel');if(wc){wc.style.display='';wc.onclick=()=>{update(ir,{status:'cancelled'}).catch(()=>{});remove(ref(db,'rooms/'+id)).catch(()=>{});if(sentInvite){sentInvite();sentInvite=null}wbHide(wb);wc.style.display='none';btn.disabled=false;btn.textContent='Invite';toast('Invite cancelled')}}
  const clearWait=()=>{wbHide(wb);if(wc)wc.style.display='none'};
  if(sentInvite)sentInvite();
  const rref=ref(db,'rooms/'+id);
  let presWatch=null;
  const stopWatch=()=>{if(sentInvite){sentInvite();sentInvite=null}if(presWatch){presWatch();presWatch=null}};
  const rearm=()=>{btn.disabled=false;btn.textContent='Invite'};
  sentInvite=onValue(rref,snap=>{
    const v=snap.val();if(!v)return;
    const o=v.players&&v.players.O;
    if(o&&o.declined){stopWatch();clearWait();rearm();toast(toNick+(o.busy?' is already in a game':' declined'));remove(rref).catch(()=>{});update(ir,{status:o.busy?'busy':'declined'}).catch(()=>{})}
    else if(o&&v.status==='playing'){stopWatch();clearWait();toast(toNick+' joined - game on!');enterRoom(id,'X',false)}
  });
  presWatch=onValue(ref(db,'presence/'+toUid),ps=>{
    if(!sentInvite)return; // already resolved
    if(!ps.val()){stopWatch();clearWait();rearm();toast(toNick+' went offline');update(ir,{status:'offline'}).catch(()=>{});remove(rref).catch(()=>{})}
  });
  setTimeout(()=>{if(!sentInvite)return;get(rref).then(s=>{const v=s.val();if(v&&v.status==='waiting'&&!(v.players&&v.players.O)){stopWatch();clearWait();rearm();toast(toNick+" didn't respond in 60 s");update(ir,{status:'expired'}).catch(()=>{});remove(rref).catch(()=>{})}})},65000);
}
function invitesOn(){
  onValue(ref(db,'invites/'+me.uid),snap=>{
    const v=snap.val()||{},now=Date.now();
    for(const[k,iv]of Object.entries(v)){
      if(!iv||iv.status!=='pending'||!iv.ts||now-iv.ts>60000)continue;
      const ir=ref(db,'invites/'+me.uid+'/'+k);
      if(room){update(ir,{status:'busy'}).catch(()=>{});update(ref(db,'rooms/'+iv.roomId),{'players/O':{uid:me.uid,nick:myNick,declined:true,busy:true}}).catch(()=>{});continue}
      if(iv._shown)continue;iv._shown=true;
      toastAsk(iv.fromNick||'Someone',async()=>{
        const rr=ref(db,'rooms/'+iv.roomId);
        const rv=(await get(rr)).val();
        if(!rv||rv.status!=='waiting'||(rv.players&&rv.players.O)){update(ir,{status:'expired'});toast('That invite expired');return}
        await update(rr,{'players/O':{uid:me.uid,nick:myNick},status:'playing'});
        await update(ir,{status:'accepted'});
        toast('Game started - you are O');
        enterRoom(iv.roomId,'O',false);
      },(silent)=>{update(ir,{status:silent?'expired':'declined'}).catch(()=>{});if(!silent)update(ref(db,'rooms/'+iv.roomId),{'players/O':{uid:me.uid,nick:myNick,declined:true}}).catch(()=>{})});
      break; // one toast at a time
    }
  });
}

// ---------- UI wiring ----------
async function openLobby(){
  $('#lobby').showModal();
  if(roomLink){$('#rlink').value=roomLink;$('#rlinkrow').style.display='flex'}
  $('#mynick').textContent=myNick;
  $('#offlineTgl').checked=localStorage.getItem('tttx-hide')==='1';
  if(!me)await presenceOn();
}
Online.openLobby=openLobby;
Online.debugInvite=(uid,nick)=>sendInvite(uid,nick,{disabled:false,textContent:'Invite'});

async function boot(){
  $('#online').onclick=openLobby;
  $('#lclose').onclick=()=>$('#lobby').close();
  $('#reshuffle').onclick=()=>{myNick=nick();localStorage.setItem('tttx-nick',myNick);$('#mynick').textContent=myNick;presenceOn()};
  const mn=$('#mynick');
  mn.style.cursor='text';mn.title='Tap to edit';
  mn.onclick=()=>{
    if(mn.dataset.editing)return;mn.dataset.editing='1';
    const inp=document.createElement('input');
    inp.value=myNick;inp.maxLength=16;inp.id='mynickedit';
    inp.style.cssText='font:inherit;font-weight:700;background:#0a0d15;border:1px solid var(--line);border-radius:8px;padding:2px 8px;width:10em;color:var(--txt)';
    mn.replaceWith(inp);inp.focus();inp.select();
    const done=ok=>{
      const v=inp.value.trim().slice(0,16);
      inp.replaceWith(mn);delete mn.dataset.editing;
      if(ok&&v){myNick=v;localStorage.setItem('tttx-nick',myNick);presenceOn()}
      mn.textContent=myNick;
    };
    inp.onkeydown=e=>{if(e.key==='Enter')done(true);else if(e.key==='Escape')done(false)};
    inp.onblur=()=>done(true);
  };
  $('#offlineTgl').onchange=e=>{localStorage.setItem('tttx-hide',e.target.checked?'1':'0');presenceOn()};
  $('#mkroom').onclick=async()=>{
    if(!me)await presenceOn();
    const id=await createRoom();if(!id)return;
    const link=location.origin+location.pathname+'?room='+id;
    roomLink=link;
    $('#rlink').value=link;$('#rlinkrow').style.display='flex';
    $('#rcopied').textContent='Room ready - link copied to your clipboard. Send it to a friend and stay on this page.';
    copyText(link,$('#copylink'));
    enterRoom(id,'X',false,true);
  };
  $('#copylink').onclick=()=>copyText($('#rlink').value,$('#copylink'));
  $('#waitcopy').onclick=()=>copyText(roomLink||$('#rlink').value,$('#waitcopy'));
  if(navigator.share){$('#sharelink').style.display='';$('#waitshare').style.display=''}
  $('#sharelink').onclick=shareLink;$('#waitshare').onclick=shareLink;
  $('#leave').onclick=()=>{
    if(room&&!spectate&&room.status==='playing'){
      const host=room.host===me.uid;
      if(!confirm(host?'Close the room and end the game for both players?':'Leave and end the game for both players?'))return;
    }
    leaveRoom();
  };
  // join via ?room=
  const q=new URLSearchParams(location.search),join=q.get('room');
  if(join){
    me=await ready;await presenceOn();
    const rr=ref(db,'rooms/'+join);
    const rv=(await get(rr)).val();
    if(!rv){toast('That room is closed');return}
    if(rv.players&&rv.players.X&&rv.players.X.uid===me.uid)enterRoom(join,'X',false);
    else if(rv.players&&rv.players.O&&rv.players.O.uid===me.uid)enterRoom(join,'O',false);
    else if(rv.players&&!rv.players.O&&rv.status==='waiting'){await update(rr,{'players/O':{uid:me.uid,nick:myNick},status:'playing'});enterRoom(join,'O',false)}
    else enterRoom(join,null,true);
  }
  await presenceOn();invitesOn();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
