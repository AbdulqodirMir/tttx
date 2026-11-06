/* TTTX site embed v2 - visitors on miraliyev.tech / .me / .app appear in the shared
   TTTX lobby and can send/receive game invites without leaving the site.
   Locked spec: 9D board mark (breathes at rest, grows into the pill on hover),
   2E player stack (lobby panel opens above the fixed pill), 12 invite toast
   (12A/12B on .tech/.me, 12D on .app; ring depletes anti-clockwise over 10s,
   ignored toast leaves on its own). One skin per site; duotone avatars on .app.
   Classic script on purpose: GitHub Pages sends no CORS headers, so a module
   script would fail cross-origin. Firebase loads via dynamic import instead.
   Install: <script src="https://tttx.miraliyev.tech/embed.js" defer></script> */
(function(){
'use strict';

if(window.__tttxEmbed)return;window.__tttxEmbed=true;

var GAME='https://tttx.miraliyev.tech/';
var CFG={
  apiKey:"AIzaSyCQpNHsTtu7k6u2IXqIngNk4eX1dvCljcY",
  authDomain:"tttx-e7404.firebaseapp.com",
  databaseURL:"https://tttx-e7404-default-rtdb.europe-west1.firebasedatabase.app",
  projectId:"tttx-e7404",
  storageBucket:"tttx-e7404.firebasestorage.app",
  messagingSenderId:"862633433956",
  appId:"1:862633433956:web:bce95cf065d73d0858f871"
};
var FB='https://www.gstatic.com/firebasejs/10.12.5/';

/* ---------- site skins ---------- */
var me=document.currentScript;
var host=(me&&me.getAttribute('data-site'))||new URLSearchParams(location.search).get('tttxskin')||location.hostname.replace(/^www\./,'');
var SKINS={
  'tech':{place:'center',font:"'Bricolage Grotesque',sans-serif",duo:false},
  'miraliyev.tech':{place:'center',font:"'Bricolage Grotesque',sans-serif",duo:false},
  'me':{place:'center',font:"'Inter Tight',sans-serif",duo:true},
  'miraliyev.me':{place:'center',font:"'Inter Tight',sans-serif",duo:true},
  'app':{place:'right',font:"'JetBrains Mono',monospace",duo:false},
  'miraliyev.app':{place:'right',font:"'JetBrains Mono',monospace",duo:false}
};
var skin=SKINS[host]||SKINS.tech;
var isApp=/app$/.test(host)&&/miraliyev/.test(host)||host==='app';
var tag={ 'miraliyev.tech':'from .tech','miraliyev.me':'from .me','miraliyev.app':'from .app' };
var hue=['#8b9cff','#ff5d8f','#3ddc97','#ffc9a3','#a9b6ff'];
var duo=['#9d3f27','#b85538','#752d1b'];
function avColor(nick){var h=0;for(var i=0;i<nick.length;i++)h=(h*31+nick.charCodeAt(i))|0;var pal=isApp?duo:hue;return pal[Math.abs(h)%pal.length]}
function siteTag(p){return p.site&&tag[p.site]?tag[p.site]:(p.site?null:null)}

/* ---------- shadow root + styles ---------- */
var rootEl=document.createElement('div');rootEl.id='tttx-embed';
var sh=rootEl.attachShadow({mode:'open'});
function thm(){rootEl.setAttribute('data-t',document.documentElement.getAttribute('data-theme')==='light'?'light':'dark')}thm();try{new MutationObserver(thm).observe(document.documentElement,{attributes:true,attributeFilter:['data-theme']})}catch(e){}
var right=skin.place==='right';
var top_=isApp;
var css=`
:host{all:initial}
*{margin:0;padding:0;box-sizing:border-box;font-family:${skin.font}}
.hold{position:fixed;${right?'right:22px':'left:50%;transform:translateX(-50%)'};bottom:calc(20px + env(safe-area-inset-bottom));z-index:2147483646;display:flex;flex-direction:column;align-items:${right?'flex-end':'center'};gap:10px}
.hold.top{top:78px;bottom:auto}@media (max-width:767.98px){.hold.top{top:66px;right:12px}}
.hold.top .pill{order:0}
.hold.top .panel{order:1;transform-origin:top right;transform:scale(.92) translateY(-8px)}
/* lobby panel (2E: opens above the fixed pill) */
.panel{width:284px;max-width:calc(100vw - 24px);border-radius:18px;overflow:hidden;transform-origin:bottom ${right?'right':'center'};transform:scale(.92) translateY(8px);opacity:0;pointer-events:none;transition:transform .28s cubic-bezier(.2,.9,.25,1.15),opacity .2s ease}
.panel.open{transform:none;opacity:1;pointer-events:auto}
.panel .phead{display:flex;align-items:baseline;justify-content:space-between;padding:12px 14px 8px;font-size:13px;font-weight:600}
.panel .phead small{font-weight:400;opacity:.6;font-size:11px}
.prows{max-height:252px;overflow-y:auto;padding:0 6px 8px}
.prow{display:flex;align-items:center;gap:9px;padding:7px 8px;border-radius:12px}
.prow .pn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}
.prow .pn small{display:block;font-size:10.5px;opacity:.55;font-weight:400}
.prow button{flex:none;font:inherit;font-size:11.5px;padding:5px 12px;border-radius:99px;cursor:pointer}
.pempty{padding:14px 14px 16px;font-size:12.5px;opacity:.65;text-align:center}
/* pill */
.pill{display:flex;align-items:center;gap:9px;cursor:pointer;user-select:none;-webkit-user-select:none}
.pill .face{position:relative;width:30px;height:30px;flex:none;transition:width .34s cubic-bezier(.25,.9,.3,1)}
.mark{position:absolute;inset:0;display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);gap:2px;transition:opacity .22s ease,transform .3s cubic-bezier(.3,1.4,.5,1)}
.hold.live .mark{animation:breathe 2.8s ease-in-out infinite}
.mark i{border-radius:2px;position:relative}
@keyframes breathe{0%,100%{transform:scale(1);opacity:.82}50%{transform:scale(1.07);opacity:1}}
.avstack{display:inline-flex;flex:none;position:absolute;inset:0;align-items:center;opacity:0;transform:scale(.6);transition:opacity .22s ease,transform .3s cubic-bezier(.3,1.4,.5,1)}
.av{width:26px;height:26px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;flex:none;border:2px solid transparent}
.avstack .av+.av{margin-left:-8px}
.pill .extra{display:flex;align-items:center;gap:9px;max-width:0;opacity:0;overflow:hidden;white-space:nowrap;transition:max-width .34s cubic-bezier(.25,.9,.3,1),opacity .22s ease}
.pill .count{font-size:13px}
.pill .sep{width:1px;height:14px;background:currentColor;opacity:.3}
.pill .go{font-size:13px;font-weight:600}
.pill .go button{font:inherit;color:inherit;background:none;border:0;cursor:pointer;font-weight:600}
.pill{transition:padding .34s cubic-bezier(.25,.9,.3,1),gap .34s cubic-bezier(.25,.9,.3,1)}
.pill.open .extra{max-width:230px;opacity:1}
.pill.open .avstack{opacity:1;transform:none}
.pill.open .face{width:max(30px,var(--sw,30px))}
.pill.open .mark{animation:none;opacity:0;transform:scale(.55)}
@media (hover:hover){
  .pill:not(:hover):not(.open){padding:9px!important;gap:0!important}
  .pill:hover .extra{max-width:230px;opacity:1}
  .pill:hover .avstack{opacity:1;transform:none}
  .pill:hover .face{width:max(30px,var(--sw,30px))}
  .pill:hover .mark{animation:none;opacity:0;transform:scale(.55)}
}
@media (hover:none){
  .pill:not(.open){padding:9px!important;gap:0!important}
}
@media (max-width:767.98px){.hold{left:auto;right:14px;transform:none;align-items:flex-end}}
/* invite toast (12) */
.toast{position:fixed;left:50%;transform:translateX(-50%) translateY(14px);bottom:calc(84px + env(safe-area-inset-bottom));z-index:2147483647;display:flex;align-items:center;gap:11px;opacity:0;pointer-events:none;transition:opacity .25s ease,transform .3s cubic-bezier(.25,1.2,.4,1);max-width:calc(100vw - 20px)}
.toast.show{opacity:1;pointer-events:auto;transform:translateX(-50%) translateY(0)}
.ring{position:relative;width:44px;height:44px;flex:none}
.ring .track{stroke:currentColor;opacity:.22}
.ring svg{position:absolute;inset:0;transform:rotate(-90deg)}
.ring .av{position:absolute;inset:7px;width:30px;height:30px;font-size:12px;border-width:0}
.tmsg{font-size:13.5px;line-height:1.35;min-width:0}
.tmsg b{font-weight:600}
.tmsg small{display:block;font-size:10.5px;opacity:.6;letter-spacing:.06em}
.tbtns{display:flex;gap:8px;flex:none}
.tbtns button{font:inherit;cursor:pointer}
.toast.lift{bottom:calc(150px + env(safe-area-inset-bottom))}
@media (max-width:767.98px){
.toast{left:12px;right:12px;max-width:none;transform:translateY(14px);border-radius:18px!important}
.toast.show{transform:none}
.tmsg{flex:1}
.tmsg b{display:block;line-height:1.2}
.tmsg small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tbtns button{padding-left:12px!important;padding-right:12px!important}
}
.prow button.hot{font-weight:700;box-shadow:0 0 0 2px currentColor}
/* mini note */
.note{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom));z-index:2147483645;font-size:12.5px;padding:8px 14px;border-radius:99px;opacity:0;transition:opacity .25s ease;pointer-events:none;white-space:nowrap}
.note.show{opacity:1}
/* ---------- skins ---------- */
${skinCss()}
.prow button:disabled{opacity:.6;border-style:dashed}

`;
function skinCss(){
  if(isApp)return `
:host{--hl:rgba(255,255,255,.06);--bg:rgba(58,33,28,.94);--fg:#ecebe4;--pnfg:#ffffff;--bd:rgba(236,235,228,.2);--bd2:rgba(255,248,236,.18);--av:#c4664a;--avfg:#ecebe4;--avbd:#3a211c;--hv:#ecebe4;--hvfg:#3a211c;--ring:#ecebe4;--sh:0 18px 46px rgba(14,6,4,.5)}
:host([data-t="light"]){--hl:rgba(255,255,255,.5);--bg:rgba(241,237,230,.93);--fg:#2c130c;--pnfg:#1c0904;--bd:rgba(157,63,39,.65);--bd2:rgba(60,25,15,.14);--av:#c4664a;--avfg:#ffffff;--avbd:#f1ede6;--hv:#9d3f27;--hvfg:#f1ede6;--ring:#9d3f27;--sh:0 18px 50px rgba(28,9,4,.4)}
:host .panel{background:var(--bg);color:var(--fg);border:1px solid var(--bd);box-shadow:var(--sh);border-radius:0;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
:host .panel .phead{text-transform:uppercase;letter-spacing:.12em;font-size:11px;font-weight:500;border-bottom:1px solid var(--bd2);padding:12px 14px 10px;margin-bottom:6px}
:host .panel .phead small{text-transform:uppercase;letter-spacing:.12em;font-size:10px}
:host .prow{border-radius:0}
:host .prow .pn{font-size:12.5px;color:var(--pnfg);font-weight:500}
:host .prow .pn small{opacity:.8;font-weight:400;color:var(--fg)}
:host .panel .phead small{opacity:.8}
:host .prow button{background:none;border:1px solid var(--bd);color:var(--fg);text-transform:uppercase;letter-spacing:.12em;font-size:10px;border-radius:0;padding:6px 11px;transition:background .15s,color .15s}
:host .prow button:hover:not(:disabled){background:var(--hv);color:var(--hvfg)}
:host .prow button:disabled{opacity:.5;cursor:default}
:host .pempty{text-transform:uppercase;letter-spacing:.1em;font-size:11px;opacity:.7}
:host .pill{background:var(--bg);border:1px solid var(--bd);border-radius:0;box-shadow:var(--sh);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);color:var(--fg);padding:9px 16px 9px 9px;text-transform:uppercase;letter-spacing:1.3px;font-size:11px;font-weight:500}
:host .pill .count,:host .pill .go{text-transform:uppercase;letter-spacing:1.3px;font-size:11px}
:host .av{font-family:'JetBrains Mono',monospace;font-weight:500}
:host .pill .av{border-color:var(--avbd);color:var(--avfg)}
:host .avstack .av,:host .prow .av,:host .ring .av{background:var(--av)!important;color:var(--avfg)!important}
:host .avstack .av{border-color:var(--avbd)!important}
:host .mark i{background:var(--fg);opacity:.9}
:host .mark i:nth-child(2n){opacity:.45}
:host .toast{background:var(--bg);color:var(--fg);border:1px solid var(--bd);border-radius:0;box-shadow:var(--sh);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);padding:13px 15px}
:host .tmsg small{color:var(--fg);opacity:.7;text-transform:uppercase;letter-spacing:.14em}
:host .tbtns button{font-size:10.5px;text-transform:uppercase;letter-spacing:.12em;padding:9px 16px;border-radius:0;border:1px solid var(--bd)}
:host .tbtns .ok{background:var(--hv);color:var(--hvfg);border-color:var(--hv)}
:host .tbtns .no{background:none;color:var(--fg)}
:host .note{background:var(--bg);color:var(--fg);border:1px solid var(--bd);border-radius:0;text-transform:uppercase;letter-spacing:.1em;font-size:11px}
:host .ring circle{stroke:var(--ring)}
@media (max-width:767.98px){:host .toast{border-radius:0!important}}
`+(function(){var rm='full2';if(rm==='round')rm='medium';if(rm==='subtle')return `
:host .panel{border-radius:16px;corner-shape:squircle;box-shadow:var(--sh),inset 0 1px 0 var(--hl,rgba(255,255,255,.06))}
:host .prow{border-radius:10px;corner-shape:squircle}
:host .prow button{border-radius:8px;corner-shape:squircle;padding:6px 12px}
:host .pill{border-radius:12px;corner-shape:squircle;box-shadow:var(--sh),inset 0 1px 0 var(--hl,rgba(255,255,255,.06))}
:host .toast{border-radius:16px;corner-shape:squircle;box-shadow:var(--sh),inset 0 1px 0 var(--hl,rgba(255,255,255,.06))}
:host .tbtns button{border-radius:9px;corner-shape:squircle;padding:9px 17px}
:host .note{border-radius:10px;corner-shape:squircle}
:host .av{border-radius:50%!important}
@media (max-width:767.98px){:host .toast{border-radius:16px!important}}
`;if(rm==='medium')return `
:host .panel{border-radius:22px;corner-shape:squircle;box-shadow:var(--sh),inset 0 1px 0 var(--hl,rgba(255,255,255,.06))}
:host .prow{border-radius:14px;corner-shape:squircle}
:host .prow button{border-radius:999px;corner-shape:squircle;padding:6px 14px}
:host .pill{border-radius:999px;corner-shape:squircle;box-shadow:var(--sh),inset 0 1px 0 var(--hl,rgba(255,255,255,.06))}
:host .toast{border-radius:22px;corner-shape:squircle;box-shadow:var(--sh),inset 0 1px 0 var(--hl,rgba(255,255,255,.06))}
:host .tbtns button{border-radius:999px;corner-shape:squircle;padding:9px 18px}
:host .note{border-radius:999px;corner-shape:squircle}
:host .av{border-radius:50%!important}
@media (max-width:767.98px){:host .toast{border-radius:22px!important}}
`;if(rm==='full')return `
:host .panel{border-radius:32px;corner-shape:squircle;box-shadow:var(--sh),inset 0 1px 0 var(--hl,rgba(255,255,255,.06));transition:transform .3s cubic-bezier(.2,.8,.2,1),opacity .2s ease}
:host .prow{border-radius:20px;corner-shape:squircle}
:host .prow button{border-radius:999px;corner-shape:squircle;padding:6px 15px}
:host .pill{border-radius:999px;corner-shape:squircle;box-shadow:var(--sh),inset 0 1px 0 var(--hl,rgba(255,255,255,.06))}
:host .toast{border-radius:32px;corner-shape:squircle;box-shadow:var(--sh),inset 0 1px 0 var(--hl,rgba(255,255,255,.06))}
:host .tbtns button{border-radius:999px;corner-shape:squircle;padding:9px 19px}
:host .note{border-radius:999px;corner-shape:squircle}
:host .mark i{border-radius:3px}
:host .av{border-radius:50%!important}
@media (max-width:767.98px){:host .toast{border-radius:32px!important}}
`;if(rm==='full2')return `
:host .panel{border-radius:33.5px;corner-shape:round;box-shadow:var(--sh),inset 0 1px 0 var(--hl,rgba(255,255,255,.06));transition:transform .3s cubic-bezier(.2,.8,.2,1),opacity .2s ease}
:host .panel .phead{padding:16px 18px 12px}
:host .prow{border-radius:999px;corner-shape:round;padding:10px 12px}
:host .prow button{border-radius:999px;corner-shape:round;padding:8px 16px 6px}
:host .pill{border-radius:999px;corner-shape:round;box-shadow:var(--sh),inset 0 1px 0 var(--hl,rgba(255,255,255,.06))}
:host .toast{border-radius:999px;corner-shape:round;box-shadow:var(--sh),inset 0 1px 0 var(--hl,rgba(255,255,255,.06));padding:15px 18px}
:host .tbtns button{border-radius:999px;corner-shape:round;padding:10px 20px}
:host .note{border-radius:999px;corner-shape:round}
:host .mark i{border-radius:3px}
:host .av{border-radius:50%!important}
@media (max-width:767.98px){:host .toast{border-radius:33.5px!important;corner-shape:round}}
`;return `
:host .av{border-radius:50%!important}
`})();
  if(skin.duo)return `
.duo{display:flex;gap:10px}
@media (min-width:768px){
.duo{display:contents}
.duo .pill{background:rgba(18,22,48,.42);border:1px solid rgba(255,255,255,.28);border-radius:999px;box-shadow:0 10px 28px rgba(6,8,24,.3);backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);color:#f6eee2;padding:9px 15px 9px 9px}
.duo .pill .go{color:#ffc9a3}
}
@media (max-width:767.98px){
.duo .pill .sep,.duo .pill .go .playlabel-sep{display:none}
.duo .pill .go{display:none}
}
.panel{background:rgba(24,28,66,.88);color:#f6eee2;border:1px solid rgba(255,255,255,.1);box-shadow:0 18px 46px rgba(4,5,18,.55);backdrop-filter:blur(16px) saturate(1.3);-webkit-backdrop-filter:blur(16px) saturate(1.3)}
.prow button{background:rgba(255,201,163,.14);border:1px solid rgba(255,201,163,.4);color:#ffc9a3}
.prow button:disabled{opacity:.45;cursor:default}
.pill{background:rgba(24,28,66,.66);border-radius:13px;box-shadow:0 3px 0 rgba(7,8,26,.8),0 12px 24px rgba(0,0,0,.34),inset 0 1px 0 rgba(255,255,255,.18);backdrop-filter:blur(14px) saturate(1.3);-webkit-backdrop-filter:blur(14px) saturate(1.3);color:#f6eee2;padding:10px 14px;font-size:13.5px}
.pill .go{color:#ffc9a3}
.pill .av{border-color:#12152f;color:#05060f}
.mark i{background:rgba(246,238,226,.9)}
.mark i:nth-child(2n){background:rgba(255,201,163,.55)}
.toast{background:rgba(24,28,66,.92);color:#f6eee2;border:1px solid rgba(255,255,255,.14);border-radius:13px;box-shadow:0 3px 0 rgba(7,8,26,.8),0 16px 40px rgba(0,0,0,.4);backdrop-filter:blur(14px);padding:11px 13px}
.tbtns button{font-size:12.5px;padding:7px 15px;border-radius:9px;border:1px solid rgba(255,255,255,.2)}
.tbtns .ok{background:rgba(255,201,163,.16);border-color:rgba(255,201,163,.55);color:#ffc9a3}
.tbtns .no{background:none;color:#f6eee2;opacity:.85}
.note{background:rgba(24,28,66,.9);color:#f6eee2;border:1px solid rgba(255,255,255,.12)}
.ring circle{stroke:#ffc9a3}
`;
  return `
.panel{background:rgba(10,12,24,.9);color:#f5f3ee;border:1px solid rgba(255,255,255,.16);box-shadow:0 18px 46px rgba(2,3,10,.6);backdrop-filter:blur(18px) saturate(1.5);-webkit-backdrop-filter:blur(18px) saturate(1.5)}
.prow button{background:rgba(169,182,255,.12);border:1px solid rgba(169,182,255,.45);color:#a9b6ff}
.prow button:disabled{opacity:.45;cursor:default}
.pill{background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.2);border-radius:99px;backdrop-filter:blur(18px) saturate(1.5);-webkit-backdrop-filter:blur(18px) saturate(1.5);color:#f5f3ee;padding:9px 16px 9px 9px;box-shadow:0 14px 36px rgba(3,4,12,.5);font-size:13px}
.pill .go{color:#a9b6ff}
.pill .av{border-color:#0b0d1a;color:#05060f}
.mark i{background:rgba(245,243,238,.9)}
.mark i:nth-child(2n){background:rgba(169,182,255,.5)}
.toast{background:rgba(10,12,24,.94);color:#f5f3ee;border:1px solid rgba(255,255,255,.18);border-radius:99px;box-shadow:0 16px 44px rgba(2,3,10,.55);backdrop-filter:blur(18px) saturate(1.5);padding:9px 11px 9px 9px}
.tbtns button{font-size:12.5px;padding:7px 15px;border-radius:99px;border:1px solid rgba(255,255,255,.25)}
.tbtns .ok{background:rgba(255,93,143,.18);border-color:rgba(255,93,143,.55);color:#ff9dbe}
.tbtns .no{background:none;color:#f5f3ee;opacity:.85}
.note{background:rgba(10,12,24,.92);color:#f5f3ee;border:1px solid rgba(255,255,255,.14)}
.ring circle{stroke:#ff5d8f}
`;
}
var st=document.createElement('style');st.textContent=css;sh.appendChild(st);

/* ---------- widget DOM ---------- */
var hold=document.createElement('div');hold.className='hold'+(top_?' top':'');sh.appendChild(hold);
var panel=document.createElement('div');panel.className='panel';hold.appendChild(panel);
panel.innerHTML='<div class="phead"><span>Lobby</span><small class="pc"></small></div><div class="prows"></div>';
var pill=document.createElement('div');pill.className='pill';hold.appendChild(pill);
var face=document.createElement('span');face.className='face';
var mark=document.createElement('span');mark.className='mark';
for(var i=0;i<9;i++)mark.appendChild(document.createElement('i'));
var stack=document.createElement('span');stack.className='avstack';
face.appendChild(mark);face.appendChild(stack);
var extra=document.createElement('span');extra.className='extra';
extra.innerHTML='<span class="count"></span><span class="sep"></span><span class="go"><button type="button">Play \u2192</button></span>';
pill.appendChild(face);pill.appendChild(extra);
if(skin.duo){var duo=document.createElement('span');duo.className='duo';hold.appendChild(duo);duo.appendChild(pill)}
var countEl=extra.querySelector('.count'),goBtn=extra.querySelector('.go button');
goBtn.addEventListener('click',function(e){e.stopPropagation();window.open(GAME,'_blank')});
var panelOpen=false;
function setPanel(o){panelOpen=o;pill.classList.toggle('open',o);panel.classList.toggle('open',o)}
pill.addEventListener('click',function(){setPanel(!panelOpen)});
document.addEventListener('click',function(e){if(panelOpen&&!rootEl.contains(e.target))setPanel(false)});
document.addEventListener('keydown',function(e){if(e.key==='Escape')setPanel(false)});

var noteEl=null;
function note(msg){if(!noteEl){noteEl=document.createElement('div');noteEl.className='note';sh.appendChild(noteEl)}noteEl.textContent=msg;noteEl.classList.add('show');clearTimeout(noteEl._h);noteEl._h=setTimeout(function(){noteEl.classList.remove('show')},2600)}

/* ---------- board mark face ---------- */
function markCells(){/* 9D: the game's face - a tiny won board */
  var cells=mark.children,pat=['x','','o','','x','','o','','x'];
  for(var i=0;i<9;i++){cells[i].style.opacity=(pat[i]?1:.35)}
}
markCells();

/* ---------- same-device identity ---------- */
function devId(){var k='tttx-did',id=null;try{id=localStorage.getItem(k)}catch(e){}
  var m=/(?:^|; )tttx_did=([^;]+)/.exec(document.cookie);if(m)id=m[1];
  if(!id)id=Math.random().toString(36).slice(2,8)+Math.random().toString(36).slice(2,8);
  try{localStorage.setItem(k,id)}catch(e){}
  if(/(^|\.)miraliyev\.tech$/.test(location.hostname))document.cookie='tttx_did='+id+';domain=.miraliyev.tech;path=/;max-age=63072000;SameSite=Lax;Secure';
  return id}
function devFp(){var n=navigator,s=screen,g='';try{var c=document.createElement('canvas').getContext('webgl');var e=c&&c.getExtension('WEBGL_debug_renderer_info');g=e?c.getParameter(e.UNMASKED_RENDERER_WEBGL):''}catch(e){}
  var str=[n.userAgent,n.platform,n.language,(n.languages||[]).join(),s.width,s.height,s.colorDepth,devicePixelRatio,n.hardwareConcurrency,n.deviceMemory,n.maxTouchPoints,Intl.DateTimeFormat().resolvedOptions().timeZone,g].join('|');
  var h=5381;for(var i=0;i<str.length;i++)h=((h<<5)+h+str.charCodeAt(i))|0;return (h>>>0).toString(36)}
var MY_DK=devId(),MY_FP=devFp();
function sameDev(p){return p&&((p.dk&&p.dk===MY_DK)||(p.fp&&p.fp===MY_FP))}

/* ---------- names ---------- */
function dn(n){var m=/^([A-Z][a-z]+)([A-Z][a-z]+)(\d+)$/.exec(n||'');return m?{name:m[1]+' '+m[2],num:'#'+m[3]}:{name:n||'Someone',num:''}}
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function srvNow(){return Date.now()+tOff}
function mkAv(nick){var a=document.createElement('span');a.className='av';a.textContent=(dn(nick).name||'?')[0].toUpperCase();a.style.background=avColor(nick||'?');if(!isApp)a.style.color='#05060f';return a}

/* ---------- avatar stack in pill ---------- */
function renderStack(list){
  stack.innerHTML='';
  var n=Math.max(1,Math.min(3,list.length));
  rootEl.style.setProperty('--sw',(26+(n-1)*18)+'px');
  list.slice(0,3).forEach(function(p){stack.appendChild(mkAv(p.nick))});
  if(!list.length){var a=document.createElement('span');a.className='av';a.textContent='\u00B7';if(!isApp){a.style.background=hue[0];a.style.color='#05060f'}stack.appendChild(a)}
}

/* ---------- state ---------- */
var lastList=[],out=null,cool={},inT=null,outT=null,queue=[],seen={};
/* out = {uid,nick,roomId,ir,state:'waiting'|'ready',t0,offs:[]} */

/* ---------- lobby panel ---------- */
var rowsEl=panel.querySelector('.prows'),pcEl=panel.querySelector('.pc');
function renderLobby(list){
  if(list)lastList=list;list=lastList;
  var n=list.length;
  var playing=false;list.forEach(function(p){if(p.room)playing=true});
  hold.classList.toggle('live',playing);
  countEl.textContent=n?('You + '+n):'Only you';
  pcEl.textContent=n?(n+' other'+(n>1?'s':'')):'';
  renderStack(list);
  rowsEl.innerHTML='';
  if(!n){rowsEl.innerHTML='<p class="pempty">Nobody else is online right now.</p>';return}
  list.forEach(function(p){
    var row=document.createElement('div');row.className='prow';
    var d=dn(p.nick);
    var nn=document.createElement('span');nn.className='pn';nn.textContent=d.name;
    var tg=siteTag(p),sub=p.room?'in a game':(tg||'free');var dupN=list.filter(function(q){return dn(q.nick).name===d.name}).length>1;if(d.num&&dupN)sub=d.num+' \u00B7 '+sub;
    var sm=document.createElement('small');sm.textContent=sub;nn.appendChild(sm);
    var b=document.createElement('button');b.type='button';
    var cd=cool[p.uid]&&cool[p.uid]>Date.now();
    if(out&&out.uid===p.uid){
      if(out.state==='ready'){b.textContent='Join';b.className='hot';b.addEventListener('click',function(e){e.stopPropagation();joinOut()})}
      else{b.textContent='Cancel';b.addEventListener('click',function(e){e.stopPropagation();cancelOut()})}
    }else{
      b.textContent=p.room?'In game':(cd?'Later':'Invite');
      b.disabled=!!p.room||!!out||cd;
      if(!b.disabled)b.addEventListener('click',function(e){e.stopPropagation();sendInvite(p)});
    }
    row.appendChild(mkAv(p.nick));row.appendChild(nn);row.appendChild(b);rowsEl.appendChild(row);
  });
}

/* ---------- toasts (12): one builder for incoming and outgoing ---------- */
function layout(){if(outT)outT.el.classList.toggle('lift',!!inT)}
function closeT(t){if(!t)return;clearTimeout(t.timer);if(t.raf)cancelAnimationFrame(t.raf);t.el.classList.remove('show');var el=t.el;setTimeout(function(){el.remove()},320);if(t===inT)inT=null;if(t===outT)outT=null;layout()}
function buildToast(o){
  /* o: nick, title, sub, ok, no, ms (ring; 0 = none), life (ms), cls, onOk, onNo, onEnd */
  var t={};
  var el=document.createElement('div');el.className='toast '+o.cls;t.el=el;
  var ring=document.createElement('span');ring.className='ring';
  ring.innerHTML='<svg width="44" height="44" viewBox="0 0 44 44"><circle class="track" cx="22" cy="22" r="19.5" fill="none" stroke-width="3"/><circle class="prog" cx="22" cy="22" r="19.5" fill="none" stroke-width="3" stroke-dasharray="122.5" stroke-dashoffset="'+(o.ms?0:122.5)+'" stroke-linecap="round"/></svg>';
  var av=mkAv(o.nick);av.style.position='absolute';ring.appendChild(av);
  var msg=document.createElement('span');msg.className='tmsg';
  var b=document.createElement('b');b.textContent=o.title;var sm=document.createElement('small');sm.textContent=o.sub||'';
  msg.appendChild(b);if(o.sub)msg.appendChild(sm);
  el.appendChild(ring);el.appendChild(msg);
  if(o.ok||o.no){
    var btns=document.createElement('span');btns.className='tbtns';
    if(o.no){var no=document.createElement('button');no.type='button';no.className='no';no.textContent=o.no;no.addEventListener('click',function(){o.onNo&&o.onNo()});btns.appendChild(no)}
    if(o.ok){var ok=document.createElement('button');ok.type='button';ok.className='ok';ok.textContent=o.ok;ok.addEventListener('click',function(){o.onOk&&o.onOk()});btns.appendChild(ok)}
    el.appendChild(btns);
  }
  sh.appendChild(el);requestAnimationFrame(function(){el.classList.add('show')});
  if(o.ms){var c=ring.querySelector('.prog'),t0=performance.now();
    var lastS=-1;(function tick(tm){var left=1-(tm-t0)/o.ms;if(left<=0){c.setAttribute('stroke-dashoffset','122.5');if(o.cd)sm.textContent=o.cd(0);return}c.setAttribute('stroke-dashoffset',String(122.5*(1-left)));if(o.cd){var sc=Math.ceil(left*o.ms/1000);if(sc!==lastS){lastS=sc;sm.textContent=o.cd(sc)}}t.raf=requestAnimationFrame(tick)})(t0)}
  if(o.life)t.timer=setTimeout(function(){o.onEnd&&o.onEnd()},o.life);
  return t;
}
function siteLabel(s){return tag[s]||''}

/* ---------- incoming ---------- */
function markRoom(roomId,extra){
  /* the sender can read the room but not our inbox, so answers travel through the room (same as the game's own lobby) */
  var rr=DB.ref(db,'rooms/'+roomId);
  DB.get(rr).then(function(sn){var rv=sn.val();
    if(rv&&rv.status==='waiting'&&!(rv.players&&rv.players.O)){var o={uid:me_.uid,nick:myNick,declined:true};for(var k in extra)o[k]=extra[k];DB.update(rr,{'players/O':o}).catch(function(){})}
  }).catch(function(){});
}
function showIncoming(iv,key){
  var ir=DB.ref(db,'invites/'+me_.uid+'/'+key),d=dn(iv.fromNick),done=false,off=null;
  function end(){done=true;if(off){off();off=null}closeT(inT);next()}
  var sub=(isApp?'TICTACTOE':'TicTacToe')+(siteLabel(iv.fromSite)?' \u00B7 '+(isApp?siteLabel(iv.fromSite).toUpperCase():siteLabel(iv.fromSite)):'');
  var left=Math.max(4000,30000-(srvNow()-(iv.ts||srvNow())));
  inT=buildToast({cls:'in',nick:iv.fromNick,title:d.name+' invites you',sub:sub,ms:left,life:left,
    ok:isApp?'Play':'Accept',no:isApp?'Later':'Decline',
    cd:function(n){return sub+(n>0?((isApp?' \u00B7 ENDS IN ':' \u00B7 ends in ')+n+(isApp?' S':' s')):(isApp?' \u00B7 EXPIRED':' \u00B7 expired'))},
    onOk:function(){if(done)return;/* open in the click so popups are not blocked */window.open(GAME+'?room='+encodeURIComponent(iv.roomId),'_blank');DB.update(ir,{status:'accepted'}).catch(function(){});end()},
    onNo:function(){if(done)return;DB.update(ir,{status:'declined'}).catch(function(){});markRoom(iv.roomId,{});end()},
    onEnd:function(){if(done)return;DB.update(ir,{status:'expired'}).catch(function(){});markRoom(iv.roomId,{timeout:true});note((isApp?'INVITE FROM ':'Invite from ')+d.name+(isApp?' EXPIRED':' expired'));end()}});
  layout();
  /* sender cancelled, or another tab already answered */
  off=DB.onValue(ir,function(s){var v=s.val();if(done)return;if(!v||v.status!=='pending'){var cancelled=v&&(v.status==='cancelled'||v.status==='offline');end();if(cancelled)note(d.name+' cancelled the invite')}});
}
function next(){
  if(inT||!queue.length)return;
  var q=queue.shift();showIncoming(q.iv,q.key);
}

/* ---------- outgoing ---------- */
function clearOut(keepRoom){
  if(!out)return;
  out.offs.forEach(function(f){try{f()}catch(e){}});clearTimeout(out.timer);
  if(!keepRoom)DB.remove(DB.ref(db,'rooms/'+out.roomId)).catch(function(){});
  out=null;renderLobby();
}
function outEnd(msg,sub,coolMs){
  var o=out;if(!o)return;
  DB.update(o.ir,{status:o.final||'expired'}).catch(function(){});
  clearOut(false);clearInviteRate();if(coolMs){cool[o.uid]=Date.now()+coolMs;renderLobby()}
  closeT(outT);
  outT=buildToast({cls:'out',nick:o.nick,title:msg,sub:sub,ms:0,life:4500,onEnd:function(){closeT(outT)}});layout();
  if(coolMs)setTimeout(function(){renderLobby()},coolMs+50);
}
/* Tearing down our own never-started waiting room frees the sender at once: the rate
   entry slows invite spam, it must not hold someone whose invite just ended. */
function clearInviteRate(){if(me_)DB.update(DB.ref(db,'rate/'+me_.uid),{lastRoom:0,lastInvite:0}).catch(function(){})}
function cancelOut(){
  if(!out)return;var o=out;
  DB.update(o.ir,{status:'cancelled'}).catch(function(){});
  clearOut(false);clearInviteRate();closeT(outT);renderLobby();
}
function joinOut(){
  if(!out)return;var o=out;
  window.open(GAME+'?room='+encodeURIComponent(o.roomId)+'&as=host','_blank');
  clearOut(true);closeT(outT);
}
function showWaiting(){
  closeT(outT);var o=out,d=dn(o.nick);
  /* anchored to the invite's server timestamp when known: the receiver expires at iv.ts+30 s, so a local start made the ring show time left after the invite had already died */
  var left=o.deadline?Math.max(3000,o.deadline-srvNow()):30000;
  outT=buildToast({cls:'out',nick:o.nick,title:isApp?'Waiting for '+d.name:'Inviting '+d.name,sub:isApp?'EXPIRES IN 30 S':'Waiting for an answer \u00B7 30 s',cd:function(n){return isApp?'EXPIRES IN '+n+' S':'Waiting for an answer \u00B7 '+n+' s'},ms:left,no:'Cancel',onNo:cancelOut});layout();
}
function showReady(){
  closeT(outT);var o=out,d=dn(o.nick);
  outT=buildToast({cls:'out',nick:o.nick,title:d.name+(isApp?' is in':' joined'),sub:isApp?'JOIN TO START':'Join to start the game',ms:90000,life:90000,
    ok:isApp?'Join':'Join game',no:isApp?'Close':'Not now',onOk:joinOut,onNo:function(){cancelOut()},onEnd:function(){if(out&&out.state==='ready')cancelOut()}});layout();
}
function rid(){var a='abcdefghjkmnpqrstuvwxyz23456789',s='';for(var i=0;i<6;i++)s+=a[Math.random()*a.length|0];return s}
function freshState(){return{cells:Array.from({length:9},function(){return Array(9).fill('')}),owner:Array(9).fill(''),turn:'X',target:-1,winner:'',last:null,echo:Array.from({length:9},function(){return Array(9).fill(0)})}}
function createRoom(){
  var id=rid();
  function attempt(tries){
    if(!tries)return Promise.resolve(null);
    var r=DB.ref(db,'rooms/'+id);
    return DB.get(r).then(function(s2){
      if(s2.exists()){id=rid();return attempt(tries-1)}
      /* X is held for the inviter: the game page claims it when they press Join (different login on the game domain) */
      return DB.set(r,{createdAt:DB.serverTimestamp(),status:'waiting',host:me_.uid,cfg:{rule:'line'},gameId:1,players:{X:{uid:me_.uid,nick:myNick,pending:true},O:null},state:freshState(),anim:null,moveCount:0,score:{X:0,O:0,D:0}}).then(function(){return id});
    });
  }
  return attempt(5);
}
function sendInvite(p){
  if(!me_){note('Still connecting, try again in a moment');return}
  if(out||(cool[p.uid]&&cool[p.uid]>Date.now()))return;
  var rate=0;
  setPanel(false);
  out={uid:p.uid,nick:p.nick,roomId:null,ir:null,state:'waiting',t0:Date.now(),offs:[]};renderLobby();
  var mine=out;
  /* fresh checks: still here, not in a game */
  DB.get(DB.ref(db,'presence/'+p.uid)).then(function(s){
    var pv=s.val();
    if(!pv||!pv.ts||srvNow()-pv.ts>60000){out=null;renderLobby();showSimple(p.nick,dn(p.nick).name+' just left','Lobby updated');return null}
    if(pv.room){out=null;renderLobby();showSimple(p.nick,dn(p.nick).name+' is in a game','Try again later');return null}
    return DB.get(DB.ref(db,'rate/'+me_.uid)).then(function(rs){
      var r=rs.val()||{};
      if(r.lastInvite&&Date.now()-r.lastInvite<8000){out=null;renderLobby();note('One invite at a time, wait a few seconds');return null}
      return createRoom();
    });
  }).then(function(id){
    if(id===null||id===undefined){if(out===mine&&!mine.roomId){out=null;renderLobby()}return}
    if(out!==mine){DB.remove(DB.ref(db,'rooms/'+id)).catch(function(){});return}
    mine.roomId=id;
    var ir=DB.push(DB.ref(db,'invites/'+p.uid));mine.ir=ir;
    DB.set(ir,{from:me_.uid,fromNick:myNick,fromSite:host,roomId:id,ts:DB.serverTimestamp(),status:'pending'}).then(function(){return DB.get(ir)}).then(function(s){var v=s.val();if(out!==mine)return;mine.deadline=((v&&v.ts)||srvNow())+30000;showWaiting();mine.timer=setTimeout(function(){if(out===mine&&mine.state==='waiting'){mine.final='expired';outEnd('No answer from '+dn(p.nick).name,'Invite expired after 30 s',20000)}},Math.max(3000,mine.deadline+3000-srvNow()))}).catch(function(){});
    DB.update(DB.ref(db,'rate/'+me_.uid),{lastInvite:Date.now()});
    renderLobby();showWaiting();
    mine.offs.push(DB.onValue(DB.ref(db,'rooms/'+id),function(snap){
      var v=snap.val();if(!v||out!==mine)return;
      var o=v.players&&v.players.O,nm=dn(p.nick).name;
      if(o&&o.declined){mine.final=o.timeout?'expired':(o.busy?'busy':'declined');
        if(o.timeout)outEnd('No answer from '+nm,'Invite expired',20000);else if(o.busy)outEnd(nm+' is in a game','Try again later',20000);else outEnd(nm+' declined','You can ask again in 20 s',20000)}
      else if(o&&mine.state==='waiting'){mine.state='ready';showReady();renderLobby()}
    }));
    mine.offs.push(DB.onValue(DB.ref(db,'presence/'+p.uid),function(ps){
      if(out!==mine||mine.state!=='waiting')return;
      var pv=ps.val();if(!pv||!pv.ts||srvNow()-pv.ts>90000){mine.final='offline';outEnd(dn(p.nick).name+' went offline','Invite withdrawn',0)}
    }));
  }).catch(function(){if(out===mine){out=null;renderLobby()}showSimple(p.nick,'Could not send the invite','Check your connection and try again')});
}
function showSimple(nick,title,sub){closeT(outT);outT=buildToast({cls:'out',nick:nick,title:title,sub:sub,ms:0,life:4000,onEnd:function(){closeT(outT)}});layout()}
window.addEventListener('pagehide',function(){if(out&&out.state==='waiting'&&out.ir){DB.update(out.ir,{status:'cancelled'}).catch(function(){});DB.remove(DB.ref(db,'rooms/'+out.roomId)).catch(function(){})}});

/* ---------- firebase ---------- */
var FBA,DB,db,auth,me_=null,tOff=0,offReady=false,myNick;
var ADJ=['Swift','Calm','Bright','Lucky','Quiet','Merry','Bold','Clever','Gentle','Mighty','Nimble','Proud','Rapid','Sunny','Witty','Zesty','Cosy','Eager'];
var ANI=['Fox','Owl','Bear','Wolf','Lynx','Hawk','Deer','Frog','Crow','Seal','Wren','Elk','Jay','Mole','Hare','Newt','Ibex','Toad','Vole','Puma'];
function newNick(){return ADJ[Math.random()*ADJ.length|0]+ANI[Math.random()*ANI.length|0]+(10+Math.random()*90|0)}
myNick=localStorage.getItem('tttx-nick')||newNick();localStorage.setItem('tttx-nick',myNick);

Promise.all([import(FB+'firebase-app.js'),import(FB+'firebase-auth.js'),import(FB+'firebase-database.js')]).then(function(mods){
  FBA=mods[0];var A=mods[1];DB=mods[2];
  var app=FBA.initializeApp(CFG,'tttx-embed'+(new URLSearchParams(location.search).get('tttxuser')||''));
  auth=A.getAuth(app);db=DB.getDatabase(app);
  return A.signInAnonymously(auth);
}).then(function(cred){
  me_=cred.user;window.__dbg={DB:DB,db:db,uid:me_.uid};
  DB.onValue(DB.ref(db,'.info/serverTimeOffset'),function(s){tOff=s.val()||0});
  /* the offset listener fires at once with the placeholder 0; only the connection
     handshake produces a real estimate, so treat the offset as usable from connected */
  DB.onValue(DB.ref(db,'.info/connected'),function(s){if(s.val())offReady=true});
  var p=DB.ref(db,'presence/'+me_.uid);
  var beat=function(){DB.set(p,{nick:myNick,ts:DB.serverTimestamp(),hide:false,room:null,site:host,dk:MY_DK,fp:MY_FP})};
  beat();DB.onDisconnect(p).remove();setInterval(beat,25000);
  var rawV={};
  function refresh(){
    var now=srvNow();
    var list=Object.keys(rawV).filter(function(u){return u!==me_.uid&&rawV[u]&&!sameDev(rawV[u])&&!rawV[u].hide&&rawV[u].ts&&now-rawV[u].ts<90000})
      .map(function(u){var o=rawV[u];o.uid=u;return o});
    if(false){list=[{uid:'d1',nick:'CalmWolf27',site:'miraliyev.tech',ts:now},{uid:'d2',nick:'ProudOwl51',site:'miraliyev.app',ts:now},{uid:'d3',nick:'LuckyHare88',site:'miraliyev.me',ts:now},{uid:'d4',nick:'BoldNewt34',ts:now}]}
    renderLobby(list);
  }
  DB.onValue(DB.ref(db,'presence'),function(snap){rawV=snap.val()||{};refresh()});
  setInterval(refresh,15000);
  /* incoming invites: queue, one toast at a time, never twice for the same invite.
     attach only once the server-time offset is in: with tOff=0 a skewed local clock
     inflates the invite age, the toast dies early and markRoom(timeout) kills the room
     while the sender's countdown still shows seconds left */
  function wireInvites(){DB.onValue(DB.ref(db,'invites/'+me_.uid),function(snap){
    var v=snap.val()||{},now=srvNow();
    Object.keys(v).forEach(function(k){
      var iv=v[k];
      if(!iv||seen[k])return;
      if(iv.status!=='pending'||!iv.ts||now-iv.ts>30000)return;
      seen[k]=1;queue.push({iv:iv,key:k});
    });
    next();
  })}
  if(offReady)wireInvites();else{var offW=setInterval(function(){if(offReady){clearInterval(offW);wireInvites()}},150)}
}).catch(function(){/* offline or blocked: widget stays as a static Play link */});

(document.body||document.documentElement).appendChild(rootEl);
})();
