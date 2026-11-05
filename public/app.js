'use strict';
/* =========================================================
   Rendu, navigation, actions, démarrage
   ========================================================= */
const ICONS={lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',receipt:'<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3z"/><path d="M9 8h6M9 12h6"/>',box:'<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
  sliders:'<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>',
  store:'<path d="M3.5 9.5L5 4h14l1.5 5.5"/><path d="M3.5 9.5c0 1.5 1.1 2.5 2.5 2.5s2.5-1 2.5-2.5c0 1.5 1.1 2.5 2.5 2.5s2.5-1 2.5-2.5c0 1.5 1.1 2.5 2.5 2.5s2.5-1 2.5-2.5"/><path d="M5 12v8h14v-8"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',back:'<path d="M15 5l-7 7 7 7"/>',next:'<path d="M9 5l7 7-7 7"/>',check:'<path d="M5 12.5l4.5 4.5L19 7.5"/>',x:'<path d="M6 6l12 12M18 6L6 18"/>',
  chat:'<path d="M4 20l1.4-4.2A8 8 0 1 1 8.2 18.6L4 20z"/><path d="M9 11h6M9 14h3.5"/>',truck:'<path d="M2 6h11v10H2zM13 9h4l4 4v3h-8"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/>',
  pin:'<path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',phone:'<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',cash:'<rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.8"/><path d="M6 12h.01M18 12h.01"/>',
  bag:'<path d="M5 8h14l-1 12H6L5 8z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',info:'<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8v.01"/>',image:'<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="1.8"/><path d="M4 18l5-5 4 4 3-3 4 4"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>',down:'<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>',play:'<path d="M8 5.5v13l11-6.5z"/>'};
function mountSprite(){if($('#sprite'))return;const d=document.createElement('div');d.id='sprite';
  d.innerHTML='<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false">'+Object.keys(ICONS).map(k=>'<symbol id="i-'+k+'" viewBox="0 0 24 24">'+ICONS[k]+'</symbol>').join('')+'</svg>';
  document.body.insertBefore(d,document.body.firstChild)}

/* ---------- aides d’interface ---------- */
let toastT;
function toast(m){let r=$('#toast-root');if(!r){r=document.createElement('div');r.id='toast-root';r.setAttribute('role','status');r.setAttribute('aria-live','polite');document.body.appendChild(r)}
  r.innerHTML='<div class="toast">'+esc(m)+'</div>';clearTimeout(toastT);toastT=setTimeout(()=>{r.innerHTML=''},4200)}
async function copyText(t){try{await navigator.clipboard.writeText(t);toast('Copié.');return}catch(e){}
  try{const a=document.createElement('textarea');a.value=t;a.style.cssText='position:fixed;opacity:0';document.body.appendChild(a);a.select();document.execCommand('copy');a.remove();toast('Copié.')}catch(e){toast('Copie impossible. Sélectionnez le texte à la main.')}}

/* ---------- navigation ---------- */
const HASH={'':'shop',livraison:'ship',paiement:'pay',merci:'done',vendeur:'orders',produits:'products',reglages:'settings',connexion:'login'};
const HOF={};Object.keys(HASH).forEach(k=>{HOF[HASH[k]]=k});
const ADMIN_VIEWS=['orders','products','settings'];
function guard(v){
  if(ADMIN_VIEWS.includes(v)&&!A.on)return 'login';
  if(v==='login'&&A.on)return 'orders';
  if(v==='ship'||v==='pay'){if(!cartItems().length)return 'shop';fixDraft();if(v==='pay'&&shipError())return 'ship'}
  if(v==='done'&&!S.sent)return 'shop';
  if(!HOF.hasOwnProperty(v))return 'shop';return v}
function go(v){v=guard(v);S.sheet=S.sheet&&A.on&&v!==S.view?null:S.sheet;S.dialog=null;
  if(v!==S.view){S.view=v;S.reset=true}
  try{const h='#'+HOF[v];if(location.hash!==h&&!(v==='shop'&&!location.hash))location.hash=HOF[v]}catch(e){}
  updateTitle();if(v==='done')track();render(true)}
function applyHash(){let h='';try{h=(location.hash||'').replace(/^#/,'')}catch(e){}
  const v=guard(HASH.hasOwnProperty(h)?HASH[h]:'shop');if(v!==S.view){S.view=v;S.reset=true;S.sheet=null;S.dialog=null;updateTitle();render(true)}}

/* ---------- rendu ---------- */
function viewHTML(){
  const v=S.view;let h;
  switch(v){case 'ship':h=viewShip();break;case 'pay':h=viewPay();break;case 'done':h=viewDone();break;case 'login':h=viewLogin();break;
    case 'orders':h=A.on?viewOrders():viewLogin();break;case 'products':h=A.on?viewProducts():viewLogin();break;case 'settings':h=A.on?viewSettings():viewLogin();break;default:h=viewShop()}
  let sh='';if(S.sheet&&A.on)sh=S.sheet.t==='order'?sheetOrder():S.sheet.t==='product'?sheetProduct():S.sheet.t==='video'?sheetVideo():'';
  return h+sh+dialogHTML()}
let rT=0;
function render(force){if(force)S.force=true;clearTimeout(rT);rT=setTimeout(doRender,0)}
const editing=()=>{const a=document.activeElement;return !!(a&&/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)&&a.closest('#root'))};
function doRender(){
  if(editing()&&!S.force){S.pending=true;return}
  S.force=false;S.pending=false;const R=$('#root');if(!R)return;
  const y=window.scrollY,sheet=$('.sheet'),sy=sheet?sheet.scrollTop:0,hadSheet=!!sheet,hadDlg=!!$('.dialog');
  const ae=document.activeElement,keep=ae&&ae.id&&ae.closest('#root')?ae.id:'';
  R.innerHTML=viewHTML();
  const ns=$('.sheet');if(ns&&hadSheet)ns.scrollTop=sy;
  if(S.reset){window.scrollTo(0,0);const h=$('h1[tabindex]');if(h)h.focus({preventScroll:true});S.reset=false}
  else{window.scrollTo(0,y);if(keep){const el=document.getElementById(keep);if(el&&el.tagName!=='BUTTON')el.focus({preventScroll:true})}}
  const dl=$('.dialog');if(dl&&!hadDlg){const b=dl.querySelector('button:last-child');if(b)b.focus()}
  document.body.style.overflow=(ns||dl||$('#vplay'))?'hidden':''}
document.addEventListener('focusout',()=>{if(S.pending)setTimeout(()=>{if(S.pending&&!editing())render(true)},80)});

/* ---------- actions ---------- */
const ACT={},INP={},CHG={};
const getPath=(o,p)=>p.split('.').reduce((t,k)=>t==null?t:t[k],o);
const setPath=(o,p,v)=>{const k=p.split('.');let t=o;for(let i=0;i<k.length-1;i++)t=t[k[i]];t[k[k.length-1]]=v};
ACT.go=el=>go(el.dataset.v);
ACT.reload=async()=>{S.loading=true;S.loadErr='';render(true);await loadAll()};
ACT.inc=el=>{const id=el.dataset.id,p=PR().find(x=>x.id===id);if(!p)return;const q=(S.cart[id]||0)+1;if(q>maxQty(p)){toast('Stock maximum atteint.');return}S.cart[id]=q;saveCart();refreshCart(id)};
ACT.dec=el=>{const id=el.dataset.id,q=(S.cart[id]||0)-1;if(q<=0)delete S.cart[id];else S.cart[id]=q;saveCart();refreshCart(id)};
ACT.toShip=()=>{const sh=SH();if(!cartItems().length)return;if(sh.minOrder&&cartSub()<sh.minOrder&&!S.take){toast('Commande minimum : '+money(sh.minOrder)+'.');return}go('ship')};
ACT.mode=el=>{S.C.mode=el.dataset.id;fixDraft();saveMe();render(true)};
ACT.zone=el=>{S.C.zone=el.dataset.id;fixDraft();saveMe();render(true)};
ACT.day=el=>{const c=S.C,d=daysAvail(S.take?{...SH(),lead:0}:SH(),shopNow()).find(x=>x.date===el.dataset.id);if(!d||!d.slots.length)return;
  c.date=d.date;if(!d.slots.some(s=>s.from+'-'+s.to===c.slot))c.slot=d.slots[0].from+'-'+d.slots[0].to;render(true)};
ACT.slot=el=>{S.C.slot=el.dataset.id;render(true)};
ACT.pay=el=>{const k=el.dataset.id;if(k==='online'&&onlineBlocked(S.C.mode,S.C.zone))return;if(S.C.pay!==k){S.C.paid=false;S.C.txn=''}S.C.pay=k;saveMe();render(true)};
ACT.paid=()=>{S.C.paid=!S.C.paid;render(true)};
ACT.consent=()=>{S.C.consent=!S.C.consent;saveMe();render(true)};
ACT.toPay=()=>{const err=shipError();if(err){toast(err);return}saveMe();go('pay')};
ACT.copy=el=>copyText(el.dataset.v);
ACT.copyTrack=()=>{if(S.sent&&S.sent.token)copyText(location.origin+'/?o='+S.sent.token+'#merci')};
/* champs « nom » et « téléphone » : empêche l’action et pointe le champ à corriger */
function blockInvalid(e){const err=payError();if(!err)return false;e.preventDefault();toast(err);
  const f=!S.C.name.trim()||S.C.name.trim().length<2?$('#nm'):!validPhone(S.C.phone)?$('#ph'):null;if(f){f.setAttribute('aria-invalid','true');f.focus()}return true}
const resetDraftAfterOrder=()=>{S.cart={};saveCart();S.C.paid=false;S.C.txn=''};
/* le serveur a refusé : on remet le catalogue à jour et on explique */
async function orderRefused(err){
  S.sending=false;
  const c=err.data&&err.data.code;
  if(c==='stock'||c==='gone'||c==='slot'){
    try{if(S.take&&A.on)await loadAdmin(true);else await loadShop()}catch(e){}
    for(const id of Object.keys(S.cart)){const p=PR().find(x=>x.id===id);if(!p||p.stock===0)delete S.cart[id];else if(p.stock!=null&&S.cart[id]>p.stock)S.cart[id]=p.stock}
    saveCart();fixDraft();
    S.dialog={t:'info',title:c==='slot'?'Ce créneau n’est plus disponible':'Votre panier a changé',text:err.message+(c==='slot'?' Choisissez-en un autre.':' Vérifiez vos quantités puis validez à nouveau.')};
    S.view=cartItems().length?(c==='slot'?'ship':'shop'):'shop';S.reset=true;try{location.hash=HOF[S.view]}catch(e){}
  }else if(c==='pay'){S.C.pay='';S.dialog={t:'info',title:'Paiement en ligne indisponible',text:err.message}}
  else if(c==='rate'){S.dialog={t:'info',title:'Un instant',text:err.message}}
  else{ if(err.status===0)toast(err.message);else S.dialog={t:'info',title:'Commande non envoyée',text:err.message} }
  render(true)}
ACT.send=async(el,e)=>{
  if(blockInvalid(e)||S.sending)return;
  const c=S.C;
  const body={items:cartItems().map(i=>({id:i.id,qty:i.qty})),mode:c.mode,zone:c.zone,addr:c.addr,date:c.date,slot:c.slot,name:c.name,phone:c.phone,pay:c.pay,paid:!!c.paid,txn:c.txn,consent:!!c.consent};
  S.sending=true;render(true);
  try{
    if(S.take){
      const j=await api('POST','/api/admin/orders',body),o=j.order;D.orders[o.id]=o;
      S.sent={admin:true,id:o.id,no:o.no,o,confirm:confirmMsg(o)};S.sending=false;resetDraftAfterOrder();go('done');loadAdmin(true).catch(()=>{});return}
    const j=await api('POST','/api/orders',body);
    store('zap.last',{token:j.token,ref:j.order.ref,at:Date.now()});saveMe();resetDraftAfterOrder();
    if(j.payUrl){S.redirecting=j.token;location.href=j.payUrl;return}   // « sending » reste vrai : pas de second clic pendant la redirection
    S.sent={o:j.order,token:j.token};S.sending=false;go('done');
  }catch(err){await orderRefused(err)}};
ACT.endTake=()=>{S.take=false;S.cart={};S.C={...S.C,ref:'',paid:false,txn:''};go('orders')};
ACT.takeOrder=()=>{S.take=true;S.cart={};S.sent=null;S.C={mode:'livraison',zone:'',addr:'',date:'',slot:'',name:'',phone:'',pay:'',paid:false,txn:'',ref:'',consent:true};go('shop')};
ACT.takeAgain=()=>ACT.takeOrder();
/* suivi côté client */
ACT.trackNow=()=>refreshSent(true);
ACT.retryPay=async()=>{const s=S.sent;if(!s)return;try{const j=await api('POST','/api/orders/'+s.token+'/pay',{});S.redirecting=s.token;location.href=j.payUrl}catch(e){toast(e.message)}};
ACT.payCash=async()=>{const s=S.sent;if(!s)return;try{const j=await api('POST','/api/orders/'+s.token+'/cash',{});S.sent={...s,o:j.order};render(true);toast('C’est noté : vous paierez à la '+(j.order.mode==='livraison'?'livraison':'remise')+'.')}catch(e){toast(e.message)}};
ACT.leaveDone=()=>{try{history.replaceState(null,'',location.pathname)}catch(e){}S.sent=null;go('shop')};
ACT.openLast=async()=>{const l=store('zap.last');if(!l)return;if(await openOrderToken(l.token))go('done');else{store('zap.last',null);toast('Cette commande est introuvable.');render(true)}};
/* vendeur */
ACT.ofilter=el=>{S.filter=el.dataset.id;render(true)};
ACT.openOrder=el=>{S.sheet={t:'order',id:el.dataset.id};render(true)};
ACT.openOrderId=el=>{S.take=false;S.sheet={t:'order',id:el.dataset.id};S.view='orders';try{location.hash='vendeur'}catch(e){}S.reset=true;render(true)};
ACT.closeSheet=()=>{S.sheet=null;render(true)};
ACT.status=el=>setStatus(el.dataset.id,el.dataset.v);
ACT.confirmWA=el=>{setStatus(el.dataset.id,'confirmee')};
ACT.togglePaid=el=>{const o=D.orders[el.dataset.id];if(!o)return;patchOrder(el.dataset.id,{pay:{paid:!o.pay.paid}})};
ACT.setFee=el=>{const o=D.orders[el.dataset.id],f=$('#fee'),v=f?num(f.value):0;if(!o)return;if(!(v>=0)||f.value.trim()===''){toast('Indiquez le montant des frais.');return}
  patchOrder(el.dataset.id,{fee:v})};
ACT.askCancel=el=>{const id=el.dataset.id;confirmDlg('Annuler cette commande ?','Le stock des produits sera remis à jour.','Annuler la commande',()=>setStatus(id,'annulee'))};
ACT.askDelete=el=>{const id=el.dataset.id;confirmDlg('Supprimer cette commande ?','Elle disparaît de la liste. Le stock n’est pas modifié.','Supprimer',()=>{S.sheet=null;delOrder(id)})};
ACT.closeDialog=(el,e)=>{if(el.classList.contains('scrim')&&e.target!==el)return;S.dialog=null;render(true)};
ACT.doConfirm=()=>{const f=S.dialog&&S.dialog.fn;S.dialog=null;if(f)f();render(true)};
ACT.newProduct=()=>{S.sheet={t:'product',id:null,d:{name:'',price:'',desc:'',stock:'',img:''}};render(true)};
ACT.editProduct=el=>{const p=D.products[el.dataset.id];if(!p)return;S.sheet={t:'product',id:el.dataset.id,d:{name:p.name||'',price:p.price==null?'':p.price,desc:p.desc||'',stock:p.stock==null?'':p.stock,img:p.img||''}};render(true)};
ACT.rmImg=()=>{S.sheet.d.img='';render(true)};
ACT.saveProduct=async()=>{const d=S.sheet.d,id=S.sheet.id;if(S.busy)return;if(String(d.name).trim().length<2){toast('Indiquez le nom du produit.');return}
  const old=id?D.products[id]:null;S.busy=true;render(true);
  try{await saveProd(id,{name:String(d.name).trim(),price:Math.max(0,num(d.price)),desc:String(d.desc).trim(),img:d.img||'',stock:String(d.stock).trim()===''?'':Math.max(0,num(d.stock)),on:old?old.on!==false:true});
    S.busy=false;S.sheet=null;toast('Produit enregistré.');render(true)}
  catch(e){S.busy=false;toast(e.message);render(true)}};
ACT.toggleProd=el=>toggleProd(el.dataset.id);
ACT.askDelProd=el=>{const id=el.dataset.id;confirmDlg('Supprimer ce produit ?','Il disparaît de la boutique tout de suite. Les commandes déjà passées gardent son nom.','Supprimer',()=>{S.sheet=null;delProd(id)})};
/* ---------- vidéos ---------- */
ACT.playVideo=el=>{const v=VIDS().find(x=>x.id===el.dataset.id);if(v)openVideo(v,el)};
ACT.closeVideo=(el,e)=>{if(el.id==='vplay'&&e&&e.target!==el)return;closeVideo()};
ACT.toVideos=()=>{const t=document.getElementById('videos');if(t)t.scrollIntoView({behavior:(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)?'auto':'smooth',block:'start'})};
ACT.newVideo=()=>{S.sheet={t:'video',id:null,d:{url:'',title:''}};render(true)};
ACT.editVideo=el=>{const v=(D.videos||[]).find(x=>x.id===el.dataset.id);if(!v)return;S.sheet={t:'video',id:v.id,d:{url:v.url||'',title:v.title||''}};render(true)};
ACT.previewVideo=()=>{const v=(D.videos||[]).find(x=>x.id===S.sheet.id);if(v)openVideo(v)};
ACT.saveVideo=async()=>{if(S.busy)return;const d=S.sheet.d,id=S.sheet.id;
  if(!id){const p=parseVideo(d.url);if(!p.ok){toast(p.error||'Collez le lien de la vidéo.');return}}
  S.busy=true;render(true);
  try{await saveVid(id,{url:d.url,title:d.title});S.busy=false;S.sheet=null;toast(id?'Vidéo enregistrée.':'Vidéo ajoutée à la boutique.');render(true)}
  catch(e){S.busy=false;toast(e.message);render(true)}};
ACT.toggleVideo=el=>toggleVid(el.dataset.id);
ACT.moveVideo=async el=>{if(S.busy||!S.sheet||!S.sheet.id)return;S.busy=true;
  try{await moveVid(S.sheet.id,el.dataset.d)}catch(e){toast(e.message)}S.busy=false;render(true)};
ACT.askDelVideo=el=>{const id=el.dataset.id;confirmDlg('Supprimer cette vidéo ?','Elle disparaît de la boutique tout de suite. La vidéo elle-même n’est pas supprimée de TikTok ou YouTube.','Supprimer',()=>{S.sheet=null;delVid(id)})};
INP.vf=el=>{const k=el.dataset.k;S.sheet.d[k]=el.value;if(k==='url')syncVideoDetect()};
ACT.swp=el=>{const p=el.dataset.p;editShop(s=>setPath(s,p,!getPath(s,p)))};
ACT.addClosed=()=>{const v=$('#cl-date').value;if(!isISO(v)){toast('Choisissez une date.');return}editShop(s=>{s.closed.push(v)})};
ACT.delClosed=el=>editShop(s=>{s.closed=s.closed.filter(x=>x!==el.dataset.id)});
ACT.addSlot=()=>{const a=$('#sl-from').value,b=$('#sl-to').value;if(!isTM(a)||!isTM(b)||mins(a)>=mins(b)){toast('La fin doit être après le début.');return}editShop(s=>{s.slots.push({from:a,to:b})})};
ACT.delSlot=el=>editShop(s=>{s.slots.splice(+el.dataset.n,1)});
ACT.addZone=()=>{const n=$('#z-name').value.trim(),f=num($('#z-fee').value);if(n.length<2){toast('Indiquez le nom du quartier.');return}editShop(s=>{s.zones.push({id:uid('z'),name:n,fee:f})})};
ACT.delZone=el=>editShop(s=>{s.zones.splice(+el.dataset.n,1)});
ACT.toggleSound=()=>{A.sound=!A.sound;store('zap.sound',A.sound?1:0);if(A.sound)beep();render(true)};
ACT.askNotif=async()=>{try{await Notification.requestPermission()}catch(e){}render(true)};
ACT.notifyTest=async()=>{try{const j=await api('POST','/api/admin/notify-test',{});const s=j.sent||{};
  const ok=[s.telegram&&'Telegram',s.ntfy&&'ntfy'].filter(Boolean);toast(ok.length?'Alerte de test envoyée ('+ok.join(', ')+').':'L’envoi a échoué : vérifiez la configuration (guide, étape « Alertes »).')}catch(e){toast(e.message)}};
ACT.logout=async()=>{try{await api('POST','/api/admin/logout',{})}catch(e){}adminLost('');S.view='shop';S.sheet=null;try{location.hash=''}catch(e){}updateTitle();render(true)};
async function doLogin(){
  if(S.busy)return;const pw=($('#pw')||{}).value||'';if(!pw){A.err='Entrez votre mot de passe.';render(true);return}
  S.busy=true;A.err='';render(true);
  try{unlockAudio();await api('POST','/api/admin/login',{password:pw});S.busy=false;await startAdmin();go('orders')}
  catch(e){S.busy=false;A.err=e.message;render(true);setTimeout(()=>{const f=$('#pw');if(f)f.focus()},50)}}
function unlockAudio(){try{const c=AC||(AC=new (window.AudioContext||window.webkitAudioContext)());if(c.state==='suspended')c.resume()}catch(e){}}
/* saisies (sans reconstruire la page) */
const syncShip=()=>{const b=$('#next2');if(b)b.setAttribute('aria-disabled',String(!!shipError()))};
INP.addr=el=>{S.C.addr=el.value;saveMe();syncShip()};
INP.name=el=>{S.C.name=el.value;el.removeAttribute('aria-invalid');saveMe();syncPay()};
INP.phone=el=>{S.C.phone=el.value;el.removeAttribute('aria-invalid');saveMe();syncPay()};
INP.txn=el=>{S.C.txn=el.value;syncPay()};
INP.pf=el=>{S.sheet.d[el.dataset.k]=el.value};
CHG.sp=el=>{const t=el.dataset.t,p=el.dataset.p;let v=el.value;
  if(t==='time'){if(!isTM(v)){render(true);return}}else if(t==='int')v=Math.max(0,num(v));else v=v.trim();
  editShop(s=>setPath(s,p,v))};
CHG.img=async el=>{const f=el.files&&el.files[0];if(!f)return;
  try{S.sheet.d.img=await resizeImage(f);render(true)}catch(e){toast('Cette image ne peut pas être lue.')}};
document.addEventListener('click',e=>{const t=e.target.closest('[data-a]');if(!t)return;
  if(t.classList.contains('scrim')&&e.target!==t)return;
  if(t.getAttribute('aria-disabled')==='true'&&t.dataset.a!=='send'&&t.dataset.a!=='toPay')return;
  const f=ACT[t.dataset.a];if(f)f(t,e)});
document.addEventListener('submit',e=>{if(e.target.id==='loginform'){e.preventDefault();doLogin()}});
document.addEventListener('input',e=>{const n=e.target.dataset&&e.target.dataset.i;if(n&&INP[n])INP[n](e.target)});
document.addEventListener('change',e=>{const n=e.target.dataset&&e.target.dataset.i;if(n&&CHG[n])CHG[n](e.target)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){if(closeVideo())return;if(S.dialog){S.dialog=null;render(true)}else if(S.sheet){S.sheet=null;render(true)}}});
window.addEventListener('hashchange',applyHash);
/* retour arrière depuis la page de paiement : on n’affiche pas un formulaire déjà envoyé (risque de commande en double) */
window.addEventListener('pageshow',e=>{if(e.persisted&&S.redirecting){location.replace('/?o='+S.redirecting+'#merci')}});

/* ---------- démarrage ---------- */
async function openOrderToken(tok){
  try{const j=await api('GET','/api/orders/'+encodeURIComponent(tok)+'?check=1');S.sent={o:j.order,token:tok};return true}catch(e){return false}}
async function loadAll(){
  try{await loadShop();S.loading=false;S.loadErr='';initDraft()}
  catch(e){S.loading=false;S.loadErr=e.message||'Impossible de charger la boutique.'}
  render(true)}
async function boot(){
  mountSprite();A.sound=store('zap.sound')!==0;
  const q=new URLSearchParams(location.search),tok=q.get('o');
  render(true);
  await loadAll();
  if(store('zap.admin')||/^#(vendeur|produits|reglages)$/.test(location.hash)){      // session vendeur éventuelle (cookie)
    try{await loadAdmin(true);A.on=true;store('zap.admin',1);schedulePoll()}catch(e){A.on=false}}
  if(tok&&/^#merci$/.test(location.hash)){if(await openOrderToken(tok)){/* page de suivi */}}
  applyHash();updateTitle();render(true);
  if(S.view==='done')track()}
boot();
