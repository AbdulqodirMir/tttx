// TTTX online: rooms + invite links, presence list + gentle invites, rematch, spectate.
// v3.2 sync hardening: transactional moves/joins/rematch, reconnect resync, opponent liveness, pinned ruleset.
import {db,ready} from './js/fb.js';
import {ref,get,set,update,remove,push,onValue,onDisconnect,serverTimestamp,runTransaction} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js';

const $=s=>document.querySelector(s);
const T=()=>window.__tttx;
const ADJ=['Swift','Calm','Bright','Lucky','Quiet','Merry','Bold','Clever','Gentle','Jolly','Keen','Mighty','Nimble','Proud','Rapid','Sunny','Witty','Zesty','Cosy','Eager'];
const ANI=['Fox','Owl','Bear','Wolf','Lynx','Hawk','Deer','Frog','Crow','Seal','Wren','Elk','Jay','Mole','Hare','Newt','Ibex','Toad','Vole','Puma'];
const nick=()=>ADJ[Math.random()*ADJ.length|0]+ANI[Math.random()*ANI.length|0]+(10+Math.random()*90|0);
const rid=()=>{const a='abcdefghjkmnpqrstuvwxyz23456789';let s='';for(let i=0;i<6;i++)s+=a[Math.random()*a.length|0];return s};

let tOff=0;
const nowSrv=()=>Date.now()+tOff;
let me=null, myNick=localStorage.getItem('tttx-nick')||nick();
localStorage.setItem('tttx-nick',myNick);
let room=null, roomId=null, seat=null, spectate=false, seenMC=-1, seenGameId=null, roomOff=null, sentInvite=null;
let hb=0, goneOff=null, goneRef=null, oppPresOff=null, oppGoneTimer=0, oppGoneUid=null, oppGone=false;
const GONE_GRACE=()=>+(localStorage.getItem('tttx-gone-grace')||45000);

const Online={active:()=>!!roomId, seat:()=>seat, spectating:()=>spectate};
// top-bar pill counts OTHER players only (presence list already excludes self); alone shows the resting label
function fmtOnlinePill(n){return '<span class="dot"></span>'+(n>0?n+' online':'Online')}
Online.fmtOnlinePill=fmtOnlinePill;
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
const popOpen=e=>!!(e&&e.matches&&e.matches(':popover-open'));
function toast(msg,ms=2600){const t=$('#toast');t.textContent=msg;if(!popOpen(t))t.showPopover();t.className='show';clearTimeout(t._h);t._h=setTimeout(()=>{t.className='';if(popOpen(t))t.hidePopover()},ms)}
const wbShow=e=>{if(e)e.classList.add('on')};const wbHide=e=>{if(e)e.classList.remove('on')};
function toastAsk(fromNick,accept,decline){
  const t=$('#toast');t.innerHTML='';
  const s=document.createElement('span');s.textContent=fromNick+' invites you to play';
  const a=document.createElement('button');a.textContent='Accept';a.className='ok';
  const d=document.createElement('button');d.textContent='Decline';
  a.onclick=()=>{t.className='';if(popOpen(t))t.hidePopover();accept()};d.onclick=()=>{t.className='';if(popOpen(t))t.hidePopover();decline()};
  t.append(s,a,d);if(!popOpen(t))t.showPopover();t.className='show ask';
  clearTimeout(t._h);t._h=setTimeout(()=>{if(t.className){t.className='';if(popOpen(t))t.hidePopover();decline(true)}},60000);
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
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)beat()});
  if(plistOn)return;plistOn=true;
  onValue(ref(db,'presence'),snap=>{
    const v=snap.val()||{},now=nowSrv();
    const list=Object.entries(v).filter(([u,p])=>u!==me.uid&&p&&!p.hide&&p.ts&&now-p.ts<90000);
    $('#pcount').textContent=list.length;
    const ob=$('#online');if(ob)ob.innerHTML=fmtOnlinePill(list.length);
    const el=$('#plist');el.innerHTML='';
    if(!list.length){el.innerHTML='<p class="dim">Nobody else here yet. Share an invite link!</p>';return}
    for(const[u,p]of list){
      const row=document.createElement('div');row.className='pitem';
      const dot=document.createElement('span');dot.className='dot'+(p.room?' busy':'');
      const n=document.createElement('span');n.className='nick';n.textContent=p.nick;
      const st=document.createElement('span');st.className='st';st.textContent=(p.room?'· in a game':'· free')+(p.site?' · on '+p.site:'');
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
    // pin the host's ruleset so both sides adjudicate identically
    await set(r,{createdAt:serverTimestamp(),status:'waiting',host:me.uid,cfg:{rule:(T().cfg&&T().cfg.rule)||'line'},gameId:1,players:{X:{uid:me.uid,nick:myNick},O:null},state:freshState(),anim:null,moveCount:0,score:{X:0,O:0,D:0}});
    update(ref(db,'rate/'+me.uid),{lastRoom:Date.now()});
    return id;
  }
  toast('Could not create a room, try again');return null;
}
// Atomically claim the O seat. Returns true only if THIS client seated itself.
async function claimSeatO(id){
  const r=ref(db,'rooms/'+id);
  // RTDB transactions need a locally cached value, and the cache is dropped when the last
  // listener detaches - so hold a one-shot listener attached across the transaction.
  let off=null;
  await new Promise(res=>{off=onValue(r,()=>res());setTimeout(res,4000)});
  try{
    const res=await runTransaction(r,cur=>{
      if(!cur)return;                       // room gone
      if(cur.status!=='waiting')return;      // already started
      if(cur.players&&cur.players.O)return;  // seat taken
      cur.players=cur.players||{};
      cur.players.O={uid:me.uid,nick:myNick};
      cur.status='playing';
      return cur;
    });
    return !!(res&&res.committed);
  }catch(e){return false}
  finally{if(off)off()}
}
function applyServerState(v,fresh){
  seenMC=v.moveCount||0;
  const h=T().G.hist;
  T().setG(Object.assign(JSON.parse(JSON.stringify(v.state)),{hist:fresh?[]:h}));
  const a=v.anim;
  if(a&&v.lastMoveBy!==me.uid){const g=T().G;g.lastEchoes=a.echoes||null;g.lastChainCaps=a.caps||null;g.lastChainGlow=a.glow||null;g.lastOpps=a.opps||null}
  T().render();
  if(v.state.winner)setTimeout(()=>T().showOver(),(T().overDelay||function(){return 650})());
  else if($('#over').open)$('#over').close();
}
// Force the local board to the server truth (reconnect, failed/aborted move).
async function resyncFromServer(reason){
  const id=roomId;if(!id)return;
  try{
    const v=(await get(ref(db,'rooms/'+id))).val();
    if(roomId!==id||!v||!v.state)return; // listener handles a deleted room
    room=v;
    seenGameId=v.gameId||1;
    applyServerState(v,false);
    if(reason==='move')toast('Move did not go through - board resynced');
    else if(reason==='reconnect')toast('Reconnected - board resynced');
  }catch(e){/* offline still; listener will fire on reconnect */}
}
function stopOppWatch(){
  if(oppPresOff){oppPresOff();oppPresOff=null}
  clearTimeout(oppGoneTimer);oppGoneTimer=0;oppGoneUid=null;oppGone=false;
}
function oppLeftCleanup(id,oppNick){
  stopOppWatch();
  if(roomId!==id)return;
  remove(ref(db,'rooms/'+id)).catch(()=>{});
  // the room listener fires with null and does the UI cleanup + toast
}
function handleOppGone(v,id){
  if(spectate||!v.players||!seat)return;
  const oppSeat=seat==='X'?'O':'X';
  const opp=v.players[oppSeat];
  if(!opp||!opp.uid||opp.declined||v.status!=='playing'){ // nobody to watch (yet)
    stopOppWatch();return;
  }
  const goneMarker=!!opp.gone;
  if(oppGoneUid!==opp.uid){
    stopOppWatch();oppGoneUid=opp.uid;
    // fallback signal: presence heartbeat staleness (covers clients without the gone marker)
    oppPresOff=onValue(ref(db,'presence/'+opp.uid),ps=>{
      const pv=ps.val();
      const stale=!pv||!pv.ts||(nowSrv()-pv.ts>90000);
      onOppGoneState(stale||goneMarker,id,opp);
    });
  }
  onOppGoneState(goneMarker,id,opp);
}
function onOppGoneState(gone,id,opp){
  if(roomId!==id)return;
  const name=(opp&&opp.nick)||'Opponent';
  if(gone&&!oppGone){
    oppGone=true;
    $('#onick').textContent='vs '+name+' - reconnecting…';
    clearTimeout(oppGoneTimer);
    oppGoneTimer=setTimeout(()=>{oppGone=false;toast(name+' left - back to local play');oppLeftCleanup(id,name)},GONE_GRACE());
  }else if(!gone&&oppGone){
    oppGone=false;
    clearTimeout(oppGoneTimer);oppGoneTimer=0;
    $('#onick').textContent='vs '+name;
    toast(name+' is back');
  }
}
function enterRoom(id,asSeat,spec,keepLobby){
  roomId=id;seat=asSeat;spectate=spec;seenMC=-1;seenGameId=null;
  if(!spec)get(ref(db,'invites/'+me.uid)).then(s=>{const v=s.val()||{};
    // mark other pending invites busy; never write into the other room itself
    for(const[k,iv]of Object.entries(v)){if(iv&&iv.status==='pending'){update(ref(db,'invites/'+me.uid+'/'+k),{status:'busy'}).catch(()=>{})}}
  }).catch(()=>{});
  set(ref(db,'presence/'+me.uid+'/room'),id).catch(()=>{});
  if(!keepLobby)$('#lobby').close();
  if(!spec&&seat){
    goneRef=ref(db,'rooms/'+id+'/players/'+seat+'/gone');
    set(goneRef,null).catch(()=>{});
    onDisconnect(goneRef).set(serverTimestamp());
  }
  const r=ref(db,'rooms/'+id);
  if(roomOff)roomOff();
  roomOff=onValue(r,snap=>{
    const v=snap.val();
    if(!v){
      if(room){
        const hadOpp=room.players&&room.players.X&&room.players.O;
        const oppNick=hadOpp?((room.players[seat==='X'?'O':'X']||{}).nick||'Opponent'):'Opponent';
        cleanupRoom();
        toast(hadOpp?oppNick+' left - back to local play':'Room closed');
      }
      return
    }
    room=v;
    if(v.players){if(v.players.X&&v.players.X.uid===me.uid)seat='X';else if(v.players.O&&v.players.O.uid===me.uid)seat='O'}
    const opp=seat==='X'?v.players&&v.players.O:v.players&&v.players.X;
    $('#obar').style.display='flex';
    const wb=$('#waitbar');(!spec&&v.status==='waiting')?wbShow(wb):wbHide(wb);
    if(!spec&&v.status==='waiting'){wb.querySelector('span').textContent='Room ready - send this link, then stay on this page';const wcx=$('#waitcancel');if(wcx)wcx.style.display='none'}
    if(!spec&&v.status==='playing'){const lb=$('#lobby');if(lb.open)lb.close()}
    $('#leave').textContent=spec?'Leave':(v.host===me.uid?'Close room':'Leave game');
    if(!oppGone)$('#onick').textContent=spectate?'Spectating':(opp&&opp.nick?('vs '+opp.nick):'Waiting for opponent…');
    T().setOnlineRule(v.cfg&&v.cfg.rule||null);
    if(v.score){const s=T().score;s.X=v.score.X||0;s.O=v.score.O||0;s.D=v.score.D||0}
    handleOppGone(v,id);
    // game state: apply only genuinely new snapshots; never rewind past what we already have
    const gid=v.gameId||1;
    if(gid!==seenGameId){seenGameId=gid;seenMC=-1;if(v.state)applyServerState(v,true)}
    else if(v.state&&typeof v.moveCount==='number'&&v.moveCount>seenMC){applyServerState(v,false)}
    else T().render(); // refresh names/seat/chip/lock even when no move landed
    // rematch handshake: both flagged -> host resets atomically with swapped seats
    if(v.rematch&&v.rematch.X&&v.rematch.O&&v.host===me.uid&&!spec){
      runTransaction(r,cur=>{
        if(!cur||!cur.rematch||!cur.rematch.X||!cur.rematch.O)return; // abort: flags changed
        const px=cur.players.X,po=cur.players.O;
        if(!px||!po)return;
        cur.players={X:po,O:px};
        const sc=cur.score||{X:0,O:0,D:0};
        cur.score={X:sc.O||0,O:sc.X||0,D:sc.D||0}; // scores stay with the players across the seat swap
        cur.state=freshState();cur.anim=null;cur.moveCount=0;cur.gameId=(cur.gameId||1)+1;cur.rematch=null;cur.status='playing';
        return cur;
      }).catch(()=>{});
    }
  });
}
function cleanupRoom(){
  if(roomOff){roomOff();roomOff=null}
  stopOppWatch();
  if(goneRef){onDisconnect(goneRef).cancel();set(goneRef,null).catch(()=>{});goneRef=null}
  room=null;roomId=null;seat=null;spectate=false;seenMC=-1;seenGameId=null;roomLink='';
  T().setOnlineRule(null);
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
Online.waiting=function(){if(!roomId)return false;return!room||room.status==='waiting'};

// move hook: called inside move() after play(), before persist/render
Online.onLocalMove=function(){
  if(!room||spectate)return;
  const g=T().G;
  const anim={echoes:g.lastEchoes||null,caps:g.lastChainCaps||null,glow:g.lastChainGlow||null,opps:g.lastOpps||null};
  const st=JSON.parse(JSON.stringify({cells:g.cells,owner:g.owner,turn:g.turn,target:g.target,winner:g.winner,last:g.last,echo:g.echo}));
  const expected=room.moveCount||0, mySeat=seat, uid=me.uid, id=roomId, won=g.winner;
  seenMC=expected+1; // optimistic: stale snapshots (moveCount <= this) are ignored until our write echoes
  runTransaction(ref(db,'rooms/'+id),cur=>{
    if(!cur)return;                             // abort: room gone
    if((cur.moveCount||0)!==expected)return;    // abort: state moved on without us
    if(!cur.state||cur.state.turn!==mySeat)return; // abort: not our turn on the server
    cur.state=st;cur.anim=anim;cur.moveCount=expected+1;cur.lastMoveBy=uid;cur.status='playing';
    if(won){cur.score=cur.score||{X:0,O:0,D:0};cur.score[won]=(cur.score[won]||0)+1}
    return cur;
  }).then(res=>{
    if(roomId!==id)return;
    if(!res.committed){seenMC=expected;resyncFromServer('move')}
  }).catch(()=>{if(roomId===id){seenMC=expected;resyncFromServer('move')}});
};
// tap hook: returns true when the tap was handled online
Online.tap=function(b,i){
  if(!roomId)return false;
  if(!room){T().warn('Connecting…');return true}
  if(spectate){T().warn('You are spectating');return true}
  if(room.status==='waiting'){T().warn('Waiting for opponent to join');return true}
  const g=T().G;
  if(g.winner)return true;
  if(g.turn!==seat){T().warn("Opponent's turn");return true}
  if(!T().legal().some(m=>m[0]===b&&m[1]===i)){T().badTap(b,i);return true}
  T().move(b,i); // local apply; onLocalMove hook ships it transactionally
  return true;
};
Online.statusText=function(){
  if(!room)return null;
  const g=T().G;
  if(spectate)return{chip:g.winner?(g.winner==='D'?'Draw':(T().mkIco?T().mkIco(g.winner):g.winner)+' wins'):(T().mkIco?T().mkIco(g.turn):g.turn)+' to move',hint:'Spectating'};
  if(room.status==='waiting')return{chip:'Waiting…',hint:'Share the invite link'};
  if(oppGone)return{chip:'Reconnecting…',hint:'Opponent lost connection'};
  if(g.winner)return null; // default over text
  return{chip:g.turn===seat?'Your move':(room.players[otherSeat()]||{}).nick+' to move',hint:g.turn===seat?'':'Wait for your turn'};
};
function otherSeat(){return seat==='X'?'O':'X'}
Online.requestRematch=function(){
  if(!room||spectate)return;
  set(ref(db,'rooms/'+roomId+'/rematch/'+seat),true).catch(()=>{});
  toast('Rematch offered');
};

// ---------- reconnect resync ----------
let connWired=false;
function wireReconnect(){
  if(connWired)return;connWired=true;
  let wasDown=false;
  onValue(ref(db,'.info/connected'),s=>{
    const c=!!s.val();
    if(!c&&roomId)toast('Connection lost - reconnecting\u2026');
    if(c&&wasDown&&roomId)resyncFromServer('reconnect');
    wasDown=!c;
  });
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&roomId)resyncFromServer()});
  window.addEventListener('online',()=>{if(roomId)resyncFromServer('reconnect')});
  window.addEventListener('pageshow',e=>{if(e.persisted&&roomId)resyncFromServer('reconnect')}); // mobile bfcache restore
}

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
  const wspan=wb.querySelector('span');const t0=Date.now();
  const tick=()=>{const left=Math.max(0,60-Math.floor((Date.now()-t0)/1000));wspan.textContent='Invited '+toNick+' - waiting for answer ('+left+'s)'};
  tick();const cd=setInterval(tick,1000);
  const wc=$('#waitcancel');if(wc){wc.style.display='';wc.onclick=()=>{clearInterval(cd);update(ir,{status:'cancelled'}).catch(()=>{});remove(ref(db,'rooms/'+id)).catch(()=>{});if(sentInvite){sentInvite();sentInvite=null}wbHide(wb);wc.style.display='none';btn.disabled=false;btn.textContent='Invite';toast('Invite cancelled')}}
  const clearWait=()=>{clearInterval(cd);wbHide(wb);if(wc)wc.style.display='none'};
  if(sentInvite)sentInvite();
  const rref=ref(db,'rooms/'+id);
  let presWatch=null,invWatch=null;
  const stopWatch=()=>{if(sentInvite){sentInvite();sentInvite=null}if(presWatch){presWatch();presWatch=null}if(invWatch){invWatch();invWatch=null}};
  const rearm=()=>{btn.disabled=false;btn.textContent='Invite'};
  sentInvite=onValue(rref,snap=>{
    const v=snap.val();if(!v)return;
    const o=v.players&&v.players.O;
    if(o&&o.declined){stopWatch();clearWait();rearm();toast(toNick+(o.busy?' is already in a game':' declined'));remove(rref).catch(()=>{});update(ir,{status:o.busy?'busy':'declined'}).catch(()=>{})}
    else if(o&&v.status==='playing'){stopWatch();clearWait();toast(toNick+' joined - game on!');enterRoom(id,'X',false)}
  });
  invWatch=onValue(ir,s=>{
    if(!sentInvite)return;
    const st=(s.val()||{}).status;
    if(st==='busy'){stopWatch();clearWait();rearm();toast(toNick+' is already in a game');remove(rref).catch(()=>{})}
  });
  presWatch=onValue(ref(db,'presence/'+toUid),ps=>{
    if(!sentInvite)return; // already resolved
    const pv=ps.val();
    const stale=!pv||!pv.ts||(nowSrv()-pv.ts>90000); // dead tab leaves a stale row, not null
    if(stale){stopWatch();clearWait();rearm();toast(toNick+' went offline');update(ir,{status:'offline'}).catch(()=>{});remove(rref).catch(()=>{})}
  });
  setTimeout(()=>{if(!sentInvite)return;get(rref).then(s=>{const v=s.val();if(v&&v.status==='waiting'&&!(v.players&&v.players.O)){stopWatch();clearWait();rearm();toast(toNick+" didn't respond in 60 s");update(ir,{status:'expired'}).catch(()=>{});remove(rref).catch(()=>{})}})},65000);
}
function invitesOn(){
  onValue(ref(db,'invites/'+me.uid),snap=>{
    const v=snap.val()||{},now=nowSrv();
    for(const[k,iv]of Object.entries(v)){
      if(!iv||iv.status!=='pending'||!iv.ts||now-iv.ts>60000)continue;
      const ir=ref(db,'invites/'+me.uid+'/'+k);
      if(roomId){update(ir,{status:'busy'}).catch(()=>{});continue}
      if(iv._shown)continue;iv._shown=true;
      toastAsk(iv.fromNick||'Someone',async()=>{
        const ok=await claimSeatO(iv.roomId);
        if(!ok){
          const rv=(await get(ref(db,'rooms/'+iv.roomId))).val();
          const mine=rv&&rv.players&&((rv.players.O&&rv.players.O.uid===me.uid)||(rv.players.X&&rv.players.X.uid===me.uid));
          if(!mine){update(ir,{status:'expired'}).catch(()=>{});toast('That invite expired');return}
        }
        await update(ir,{status:'accepted'}).catch(()=>{});
        toast('Game started - you are O');
        enterRoom(iv.roomId,'O',false);
      },(silent)=>{
        update(ir,{status:silent?'expired':'declined'}).catch(()=>{});
        if(!silent){
          // decline marker only while the room is still waiting for an O - never touch a live game
          get(ref(db,'rooms/'+iv.roomId)).then(s=>{const rv=s.val();
            if(rv&&rv.status==='waiting'&&!(rv.players&&rv.players.O))update(ref(db,'rooms/'+iv.roomId),{'players/O':{uid:me.uid,nick:myNick,declined:true}}).catch(()=>{});
          }).catch(()=>{});
        }
      });
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
  const rs=$('#reshuffle');
  const doReshuffle=()=>{if(Date.now()-(window.__nickSavedAt||0)<300)return;myNick=nick();localStorage.setItem('tttx-nick',myNick);$('#mynick').textContent=myNick;presenceOn()};
  rs.onclick=doReshuffle;
  const mn=$('#mynick');
  mn.style.cursor='text';mn.title='Tap to edit';
  mn.onclick=()=>{
    if(mn.dataset.editing)return;mn.dataset.editing='1';
    rs.textContent='\u2713';rs.title='Save name';
    const inp=document.createElement('input');
    inp.value=myNick;inp.maxLength=16;inp.id='mynickedit';
    inp.style.cssText='font:inherit;font-weight:700;background:#0a0d15;border:1px solid var(--line);border-radius:8px;padding:2px 8px;width:10em;color:var(--txt);margin:0 6px 0 2px;vertical-align:middle';
    mn.replaceWith(inp);inp.focus();inp.select();
    const done=ok=>{
      if(!mn.dataset.editing)return;
      const v=inp.value.trim().slice(0,16);
      inp.replaceWith(mn);delete mn.dataset.editing;
      rs.textContent='\u21bb';rs.title='';rs.onclick=doReshuffle;
      if(ok&&v){window.__nickSavedAt=Date.now();myNick=v;localStorage.setItem('tttx-nick',myNick);presenceOn()}
      mn.textContent=myNick;
    };
    rs.onclick=()=>done(true);
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
    else if(rv.players&&!rv.players.O&&rv.status==='waiting'){
      const ok=await claimSeatO(join);
      if(ok)enterRoom(join,'O',false);
      else{
        const rv2=(await get(rr)).val();
        if(rv2&&rv2.players&&rv2.players.O&&rv2.players.O.uid===me.uid)enterRoom(join,'O',false);
        else enterRoom(join,null,true);
      }
    }
    else enterRoom(join,null,true);
  }
  await presenceOn();invitesOn();wireReconnect();
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
