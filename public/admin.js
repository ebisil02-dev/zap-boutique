'use strict';
/* =========================================================
   Espace vendeur : connexion, commandes, produits, réglages, alertes
   Les données viennent du serveur (/api/admin/…) ; l’écran se met à jour tout seul.
   ========================================================= */
const OST={nouvelle:['Nouvelle','info'],confirmee:['Confirmée','signal'],livree:['Livrée','brand'],annulee:['Annulée','danger']};
const pill=(k,l,plain)=>'<span class="pill '+k+(plain?' plain':'')+'">'+esc(l)+'</span>';
const adminShop=()=>canonShop(D.settings.main);
const liveProducts=()=>canonProducts(Object.values(D.products).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)));
const orders=()=>Object.values(D.orders);
const clone=o=>JSON.parse(JSON.stringify(o));
/* une commande « en ligne » dont le paiement n’est pas encore confirmé n’est pas à traiter : le client est encore chez Notch Pay */
const payPending=o=>!!(o.pay&&o.pay.method==='online'&&!o.pay.paid&&['pending','failed','mismatch'].includes(o.pay.state));
const isOpen=o=>(o.status==='nouvelle'||o.status==='confirmee')&&!payPending(o);
const isNew=o=>o.status==='nouvelle'&&!payPending(o);

/* ---------- écritures (envoyées dans l’ordre, par élément) ---------- */
const Q={};
function enq(key,fn){A.inflight++;
  const p=(Q[key]||Promise.resolve()).then(fn).catch(e=>{console.error(e);toast(e&&e.status?e.message:'Enregistrement impossible. Réessayez.');return loadAdmin(true).catch(()=>{})}).finally(()=>{A.inflight--});
  Q[key]=p;return p}
function saveShop(s){const sh=clone(s);D.settings.main=sh;render();
  return enq('settings',async()=>{const j=await api('PUT','/api/admin/settings',sh);if(A.inflight<=1)D.settings.main=j.settings;render()})}
const editShop=fn=>{const s=clone(adminShop());fn(s);saveShop(s)};
async function saveProd(id,payload){const j=id?await api('PUT','/api/admin/products/'+id,payload):await api('POST','/api/admin/products',payload);D.products[j.product.id]=j.product;return j.product}
function toggleProd(id){const p=D.products[id];if(!p)return;const on=!p.on;D.products[id]={...p,on};render();
  return enq('p:'+id,()=>api('PUT','/api/admin/products/'+id,{name:p.name,price:p.price,desc:p.desc,stock:p.stock,img:p.img||'keep',on}))}
function delProd(id){delete D.products[id];render();return enq('p:'+id,()=>api('DELETE','/api/admin/products/'+id))}
function patchOrder(id,patch){const o=D.orders[id];if(!o)return Promise.resolve();
  const loc={...o};if(patch.status)loc.status=patch.status;if(patch.pay)loc.pay={...o.pay,...patch.pay};
  if(patch.fee!==undefined){loc.fee=+patch.fee;loc.total=o.subtotal+(+patch.fee);loc.feeNote=''}if(patch.note!==undefined)loc.note=patch.note;
  D.orders[id]=loc;render();
  return enq('o:'+id,async()=>{const j=await api('PATCH','/api/admin/orders/'+id,patch);D.orders[id]=j.order;if(A.inflight<=1)await loadAdmin(true);render()})}
const setStatus=(id,st)=>{const o=D.orders[id];if(o&&o.status!==st)patchOrder(id,{status:st})};
function delOrder(id){delete D.orders[id];render();return enq('o:'+id,()=>api('DELETE','/api/admin/orders/'+id))}

/* ---------- chargement, rafraîchissement automatique, alertes ---------- */
let pollT=0,AC=null;
function beep(){try{const c=AC||(AC=new (window.AudioContext||window.webkitAudioContext)());if(c.state==='suspended')c.resume();const t=c.currentTime;
  [880,1175,880].forEach((f,i)=>{const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.value=f;const s=t+i*.2;
    g.gain.setValueAtTime(.0001,s);g.gain.exponentialRampToValueAtTime(.3,s+.02);g.gain.exponentialRampToValueAtTime(.0001,s+.17);o.connect(g);g.connect(c.destination);o.start(s);o.stop(s+.2)})}catch(e){}}
function alertOrders(list){const o=list[0];
  toast(list.length===1?'Nouvelle commande '+o.ref+' · '+money(o.total):list.length+' nouvelles commandes');
  if(A.sound)beep();
  try{if(navigator.vibrate)navigator.vibrate([200,100,200])}catch(e){}
  try{if(document.visibilityState!=='visible'&&'Notification' in window&&Notification.permission==='granted')new Notification('Nouvelle commande '+o.ref,{body:money(o.total)+' · '+SHOP.name,tag:'zap-order'})}catch(e){}}
function updateTitle(){const n=A.on?orders().filter(isNew).length:0;
  try{document.title=(n?'('+n+') ':'')+(A.on&&['orders','products','settings'].includes(S.view)?'Espace vendeur · ':'')+SHOP.name+(A.on&&['orders','products','settings'].includes(S.view)?'':' · Commande en ligne')}catch(e){}}
async function loadAdmin(force){
  const j=await api('GET','/api/admin/state');
  if(A.inflight&&!force)return;
  D.products=Object.fromEntries(j.products.map(p=>[p.id,p]));D.orders=Object.fromEntries(j.orders.map(o=>[o.id,o]));D.settings={main:j.settings};D.videos=j.videos||[];syncPublicVideos();
  A.rev=j.rev;A.srv=j.server;
  const now=orders().filter(isNew),fresh=now.filter(o=>!(A.seen&&A.seen.has(o.id)));
  if(A.seen&&fresh.length)alertOrders(fresh);      // au premier chargement on mémorise sans alerter
  A.seen=new Set([...(A.seen||[]),...now.map(o=>o.id)]);
  A.ready=true;updateTitle();render()}
function schedulePoll(delay){clearTimeout(pollT);if(!A.on)return;
  pollT=setTimeout(async()=>{
    try{const j=await api('GET','/api/admin/poll');if(A.on&&j.rev!==A.rev&&!A.inflight)await loadAdmin()}catch(e){}
    schedulePoll()},delay!=null?delay:(document.visibilityState==='visible'?6000:20000))}
document.addEventListener('visibilitychange',()=>{if(A.on&&document.visibilityState==='visible')schedulePoll(100)});
async function startAdmin(){A.on=true;A.err='';store('zap.admin',1);try{await loadAdmin(true)}catch(e){if(!A.on)return;console.error(e)}schedulePoll()}
function adminLost(msg){const was=A.on;A.on=false;A.ready=false;A.seen=null;clearTimeout(pollT);store('zap.admin',null);
  if(was){A.err=msg===undefined?'Votre session a expiré. Reconnectez-vous.':msg;if(['orders','products','settings'].includes(S.view)){S.view='login';S.sheet=null}render(true)}}

/* ---------- gabarit ---------- */
function head(title,o={}){return '<header class="top">'+(o.back?'<button class="iconbtn plain" data-a="'+(o.backA||'closeSheet')+'" aria-label="Retour">'+icon('back')+'</button>':'')+
  '<h1 tabindex="-1">'+esc(title)+(o.sub?'<span class="sub">'+esc(o.sub)+'</span>':'')+'</h1>'+(o.actions||'')+'</header>'}
function tabbar(){
  const n=orders().filter(isNew).length;
  const T=[['orders','Commandes','receipt'],['products','Produits','box'],['settings','Réglages','sliders'],['shop','Boutique','store']];
  return '<div class="tabbar"><nav aria-label="Espace vendeur">'+T.map(t=>'<button class="tab" data-a="go" data-v="'+t[0]+'"'+(S.view===t[0]?' aria-current="page"':'')+'>'+icon(t[2])+t[1]+(t[0]==='orders'&&n?'<span class="badge" aria-label="'+n+' nouvelles">'+n+'</span>':'')+'</button>').join('')+'</nav></div>'}
function adminShell(inner){return '<div class="app">'+inner+'</div>'+tabbar()}
function loadingOr(inner){
  if(A.ready)return inner;
  return '<div class="stack" aria-busy="true"><div class="sk" style="height:34px;width:60%;margin-top:20px"></div><div class="sk" style="height:76px"></div><div class="sk" style="height:76px"></div></div>'}
const empty=(ic,t,p,btn)=>'<div class="empty">'+icon(ic)+'<h3>'+esc(t)+'</h3><p>'+esc(p)+'</p>'+(btn||'')+'</div>'

/* ---------- connexion ---------- */
function viewLogin(){
  return '<div class="login"><div><h1 tabindex="-1">Espace vendeur</h1><p class="muted" style="margin-top:6px">Connectez-vous pour gérer vos commandes, vos produits et vos réglages.</p></div>'+
    '<form id="loginform" class="stack" autocomplete="on"><input type="text" name="username" value="vendeur" autocomplete="username" hidden>'+
    '<div class="field"><label for="pw">Mot de passe</label><input id="pw" name="password" type="password" autocomplete="current-password" required></div>'+
    (A.err?'<div class="note bad" role="alert">'+icon('info','sm')+'<span>'+esc(A.err)+'</span></div>':'')+
    '<button class="btn" type="submit"'+(S.busy?' disabled aria-disabled="true"':'')+'>'+(S.busy?'<span class="spin"></span>Connexion…':'Se connecter')+'</button></form>'+
    '<button class="btn line" data-a="go" data-v="shop">Retour à la boutique</button></div>'}

/* ---------- commandes ---------- */
const slotStart=o=>(o.date||'')+' '+(o.from||'');
function payPill(o){
  if(o.status==='annulee')return '';
  const p=o.pay||{};
  if(p.paid)return pill('brand','Payée');
  if(p.method==='online'){
    if(p.state==='pending')return pill('signal','Paiement en cours');
    if(p.state==='failed')return pill('danger','Paiement échoué');
    if(p.state==='mismatch')return pill('danger','Montant à vérifier')}
  if(p.claimed)return pill('signal','Paiement à vérifier');
  return pill('plain',p.method==='cash'?'À encaisser':'À payer',false)}
function orderRow(o){
  const where=o.mode==='livraison'?(o.zoneName||'Livraison')+(o.address?' · '+o.address:''):'Retrait en boutique';
  return '<button class="row" data-a="openOrder" data-id="'+esc(o.id)+'"><div class="grow"><div class="t">'+esc(o.name||'Client')+'<span class="no">'+esc(o.ref||'#'+o.no)+'</span></div>'+
    '<div class="sub2">'+esc(dayShort(o.date)+' · '+slotLabel(o.from,o.to))+'</div><div class="sub2">'+esc(where)+'</div>'+
    '<div class="pills">'+pill(OST[o.status][1],OST[o.status][0])+payPill(o)+(o.mode==='retrait'?pill('plain','Retrait',true):'')+'</div></div>'+
    '<div class="amt"><b>'+money(o.total)+'</b><span>'+sum(o.items||[],i=>i.qty)+' art.</span></div></button>'}
function viewOrders(){
  const all=orders(),open=all.filter(isOpen),wait=all.filter(o=>o.status==='nouvelle'&&payPending(o)),f=S.filter;
  const shown=f==='open'?open:f==='wait'?wait:f==='done'?all.filter(o=>o.status==='livree'):f==='cancel'?all.filter(o=>o.status==='annulee'):all;
  shown.sort(f==='open'?(a,b)=>slotStart(a).localeCompare(slotStart(b))||a.no-b.no:(a,b)=>b.createdAt-a.createdAt);
  const chips=[['open','À traiter',open.length],...(wait.length||f==='wait'?[['wait','Paiement en attente',wait.length]]:[]),['done','Livrées',all.filter(o=>o.status==='livree').length],['cancel','Annulées',all.filter(o=>o.status==='annulee').length],['all','Toutes',all.length]];
  let list='';
  if(!shown.length)list=all.length?empty('check','Rien à afficher','Aucune commande dans cette liste.'):empty('receipt','Pas encore de commande','Les commandes de vos clients apparaissent ici dès qu’elles sont envoyées, et vous recevez une alerte.');
  else if(f==='open'){let day='';list='<div class="stack t">';shown.forEach(o=>{if(o.date!==day){if(day)list+='</div>';day=o.date;list+='<h2 class="lbl" style="margin-top:6px">'+esc(cap(dayName(o.date)))+'</h2><div class="group">'}list+=orderRow(o)});list+='</div></div>'}
  else list='<div class="group">'+shown.map(orderRow).join('')+'</div>';
  return adminShell(head('Commandes',{actions:'<button class="iconbtn" data-a="takeOrder" aria-label="Saisir une commande reçue par téléphone">'+icon('plus')+'</button>'})+
    loadingOr('<div class="stack t">'+'<div class="chips" role="group" aria-label="Filtrer">'+chips.map(c=>'<button class="chip" data-a="ofilter" data-id="'+c[0]+'" aria-pressed="'+(f===c[0])+'">'+c[1]+' <small>'+c[2]+'</small></button>').join('')+'</div>'+list+'</div>'))}

/* ---------- messages au client (WhatsApp : c’est vous qui écrivez, depuis votre téléphone) ---------- */
function confirmMsg(o){const sh=adminShop(),due=o.pay&&o.pay.paid?0:o.total;
  return 'Bonjour '+first(o.name)+', votre commande '+o.ref+' est confirmée ✅\n'+(o.mode==='livraison'?'Livraison':'Retrait')+' : '+DF_LONG.format(fromISO(o.date))+', '+slotLabel(o.from,o.to)+
    (o.mode==='livraison'&&o.address?'\nLieu : '+(o.zoneName?o.zoneName+', ':'')+o.address:'')+(o.mode==='retrait'&&sh.pickupAddr?'\nAdresse : '+sh.pickupAddr:'')+'\nTotal : '+money(o.total)+
    (due?'\nÀ régler : '+money(due)+(o.pay&&o.pay.method==='cash'?' en espèces':''):'\nPaiement reçu, merci !')+'\nMerci de votre confiance ! '+sh.name}
const doneMsg=o=>'Bonjour '+first(o.name)+', votre commande '+o.ref+' est livrée. Merci pour votre confiance ! '+adminShop().name;
const cancelMsg=o=>'Bonjour '+first(o.name)+', nous devons annuler votre commande '+o.ref+'. Écrivez-nous pour la reprogrammer. '+adminShop().name;

/* ---------- feuille « commande » ---------- */
function payNote(o){const p=o.pay||{};
  if(p.method!=='online'||p.verified&&p.paid)return p.verified&&p.paid?'<div class="note ok">'+icon('check','sm')+'<span>Paiement confirmé automatiquement par Notch Pay'+(p.txn?' (réf. '+esc(p.txn)+')':'')+'.</span></div>':'';
  if(p.paid)return '<div class="note">'+icon('info','sm')+'<span>Marqué payé à la main. Vérifiez-le dans votre tableau de bord Notch Pay.</span></div>';
  if(p.state==='pending')return '<div class="note">'+icon('info','sm')+'<span>Le client est en train de payer. Vous serez alerté dès la confirmation. Sans paiement, la commande est annulée automatiquement après 45 minutes et le stock est remis.</span></div>';
  if(p.state==='failed')return '<div class="note bad">'+icon('info','sm')+'<span>Le paiement du client n’a pas abouti. Il peut réessayer ou choisir de payer à la livraison ; sinon la commande sera annulée automatiquement.</span></div>';
  if(p.state==='mismatch')return '<div class="note bad">'+icon('info','sm')+'<span>Le montant reçu ne correspond pas au total de la commande. Vérifiez dans Notch Pay avant de la valider.</span></div>';
  return ''}
function sheetOrder(){
  const o0=D.orders[S.sheet.id];if(!o0)return '';const o=o0;const p=o.pay||{};
  const tel=digits(o.phone)?'<a class="btn sm soft" href="tel:+'+esc(waNum(o.phone)||digits(o.phone))+'">'+icon('phone','sm')+'Appeler</a>':'';
  const wa=waNum(o.phone)?'<a class="btn sm soft" target="_blank" rel="noopener" href="'+esc(waLink(o.phone,''))+'">'+icon('chat','sm')+'WhatsApp</a>':'';
  let foot='';
  if(o.status==='nouvelle'&&!payPending(o))foot=waNum(o.phone)?'<a class="btn" data-a="confirmWA" data-id="'+esc(o.id)+'" target="_blank" rel="noopener" href="'+esc(waLink(o.phone,confirmMsg(o)))+'">'+icon('chat','sm')+'Confirmer et prévenir</a>':'<button class="btn" data-a="status" data-id="'+esc(o.id)+'" data-v="confirmee">Confirmer</button>';
  else if(o.status==='confirmee')foot='<button class="btn" data-a="status" data-id="'+esc(o.id)+'" data-v="livree">'+icon('check','sm')+'Marquer livrée</button>';
  else if(o.status==='livree'&&waNum(o.phone))foot='<a class="btn soft" target="_blank" rel="noopener" href="'+esc(waLink(o.phone,doneMsg(o)))+'">'+icon('chat','sm')+'Envoyer un merci</a>';
  else if(o.status==='annulee'&&waNum(o.phone))foot='<a class="btn soft" target="_blank" rel="noopener" href="'+esc(waLink(o.phone,cancelMsg(o)))+'">'+icon('chat','sm')+'Prévenir le client</a>';
  const toConfirm=o.feeNote==='À confirmer',lockFee=p.method==='online'&&p.paid;
  const feeFix=o.mode==='livraison'&&!lockFee&&(toConfirm||o.status==='nouvelle'||o.status==='confirmee')?'<div class="field"><label for="fee">'+(toConfirm?'Frais de livraison à confirmer':'Frais de livraison (à corriger si besoin)')+'</label><div class="addrow"><input id="fee" inputmode="numeric" placeholder="Ex. : 1500" value="'+(toConfirm?'':esc(o.fee))+'"><button class="btn sm" data-a="setFee" data-id="'+esc(o.id)+'">Appliquer</button></div></div>':'';
  return '<div class="sheet" role="dialog" aria-modal="true" aria-label="Commande"><div class="sheet-in">'+head('Commande '+(o.ref||'#'+o.no),{back:true,sub:'#'+o.no+' · reçue le '+DF_DM.format(shopDate(o.createdAt))+' à '+DF_HM.format(shopDate(o.createdAt))})+
    '<div class="stack"><div class="pills" style="margin:0">'+pill(OST[o.status][1],OST[o.status][0])+payPill(o)+(o.source==='saisie'?pill('plain','Saisie vendeur',true):'')+'</div>'+
    '<div class="panel"><h2>'+esc(o.name||'Client')+'</h2><div class="kvl"><div><span>Téléphone</span><span>'+esc(prettyPhone(o.phone))+'</span></div></div><div class="addrow">'+tel+wa+'</div></div>'+
    '<div class="panel"><h2>'+(o.mode==='livraison'?'Livraison':'Retrait')+'</h2><div class="kvl"><div><span>Jour</span><span>'+esc(cap(dayName(o.date)))+'</span></div><div><span>Créneau</span><span>'+esc(slotLabel(o.from,o.to))+'</span></div>'+
    (o.mode==='livraison'?'<div><span>Quartier</span><span>'+esc(o.zoneName||'—')+'</span></div><div><span>Repère</span><span>'+esc(o.address||'—')+'</span></div>':'')+'</div>'+feeFix+'</div>'+
    '<div class="panel"><h2>Articles</h2><div class="kvl">'+(o.items||[]).map(i=>'<div><span>'+i.qty+' × '+esc(i.name)+'</span><span class="num">'+money(i.price*i.qty)+'</span></div>').join('')+
    (o.mode==='livraison'?'<div><span>Livraison</span><span class="num">'+(o.feeNote==='À confirmer'?'à confirmer':o.fee?money(o.fee):'offerte')+'</span></div>':'')+'<div><span><b>Total</b></span><span class="num"><b>'+money(o.total)+'</b></span></div></div></div>'+
    '<div class="panel"><h2>Paiement</h2><div class="kvl"><div><span>Moyen</span><span>'+esc(PAYN[p.method]||'—')+'</span></div>'+(p.claimed&&!p.paid?'<div><span>Le client dit avoir payé</span><span>'+esc(p.txn?'réf. '+p.txn:'sans référence')+'</span></div>':'')+(p.paid&&p.txn&&p.method!=='online'?'<div><span>Référence</span><span>'+esc(p.txn)+'</span></div>':'')+'</div>'+
    payNote(o)+(o.note?'<div class="muted small">Note : '+esc(o.note)+'</div>':'')+
    (o.status!=='annulee'&&!(p.verified&&p.paid)?'<button class="btn '+(p.paid?'line':'soft')+'" data-a="togglePaid" data-id="'+esc(o.id)+'">'+(p.paid?'Marquer comme non payée':'Marquer comme payée')+'</button>':'')+'</div>'+
    '<div class="addrow" style="flex-wrap:wrap">'+(o.status!=='annulee'&&o.status!=='livree'?'<button class="btn danger sm" data-a="askCancel" data-id="'+esc(o.id)+'">Annuler la commande</button>':'')+'<button class="btn line sm" data-a="askDelete" data-id="'+esc(o.id)+'">Supprimer</button></div></div></div>'+
    (foot?'<div class="foot"><div>'+foot+'</div></div>':'')+'</div>'}

/* ---------- produits ---------- */
/* ---------- vidéos (liens TikTok, YouTube, etc.) ---------- */
const syncPublicVideos=()=>{VIDEOS=canonVideos((D.videos||[]).filter(v=>v.on!==false))};
async function saveVid(id,payload){
  if(id){await api('PATCH','/api/admin/videos/'+id,{title:payload.title})}
  else{await api('POST','/api/admin/videos',{url:payload.url,title:payload.title})}
  await loadAdmin(true)}
function toggleVid(id){const v=(D.videos||[]).find(x=>x.id===id);if(!v)return;const on=!(v.on!==false);v.on=on;syncPublicVideos();render();
  return enq('v:'+id,()=>api('PATCH','/api/admin/videos/'+id,{on}))}
async function moveVid(id,dir){await api('PATCH','/api/admin/videos/'+id,{move:dir});await loadAdmin(true)}
function delVid(id){D.videos=(D.videos||[]).filter(v=>v.id!==id);syncPublicVideos();render();return enq('v:'+id,()=>api('DELETE','/api/admin/videos/'+id))}
/* ligne sous le champ « lien » : dit tout de suite si le lien est reconnu */
function vidDetect(url){
  const v=String(url||'').trim();if(!v)return '';
  const p=parseVideo(v);
  if(!p.ok)return '<div class="note bad" role="status">'+icon('info','sm')+'<span>'+esc(p.error)+'</span></div>';
  if(p.resolve)return '<div class="note" role="status">'+icon('info','sm')+'<span>Lien court TikTok : il sera lu quand vous ajouterez la vidéo.</span></div>';
  return '<div class="note ok" role="status">'+icon('check','sm')+'<span>Vidéo <b>'+esc(VIDEO_KINDS[p.kind])+'</b> reconnue.</span></div>'}
function syncVideoDetect(){const el=document.getElementById('vdet');if(el&&S.sheet&&S.sheet.t==='video')el.innerHTML=vidDetect(S.sheet.d.url)}

function viewProducts(){
  const ps=Object.values(D.products).sort((a,b)=>(a.createdAt||0)-(b.createdAt||0)||String(a.name).localeCompare(b.name,'fr'));
  const rows=ps.map(p=>{const im=safeImg(p.img),low=p.stock!=null&&+p.stock<=5;
    return '<div class="row"><button class="rowmain" data-a="editProduct" data-id="'+esc(p.id)+'"><div class="thumb">'+(im?'<img src="'+im+'" alt="">':esc(initials(p.name)))+'</div><div class="grow"><div class="t">'+esc(p.name)+'</div><div class="sub2 num">'+money(p.price)+'</div>'+
      '<div class="sub2">'+(p.stock==null?'Stock illimité':esc(p.stock)+' en stock')+'</div>'+(p.stock!=null&&+p.stock<=0?'<div class="pills">'+pill('danger','Épuisé')+'</div>':low?'<div class="pills">'+pill('signal','Stock bas')+'</div>':'')+'</div></button>'+
      '<button class="sw" role="switch" aria-checked="'+(p.on!==false)+'" aria-label="Visible dans la boutique : '+esc(p.name)+'" data-a="toggleProd" data-id="'+esc(p.id)+'"></button></div>'}).join('');
  return adminShell(head('Produits',{actions:'<button class="iconbtn" data-a="newProduct" aria-label="Ajouter un produit">'+icon('plus')+'</button>'})+
    loadingOr('<div class="stack tt">'+(ps.length?'<div class="group">'+rows+'</div><p class="muted small">L’interrupteur masque un produit de la boutique sans le supprimer. Le stock diminue tout seul à chaque commande et remonte si elle est annulée.</p>':empty('box','Aucun produit','Ajoutez votre premier produit avec son prix et une photo.','<button class="btn" data-a="newProduct">'+icon('plus','sm')+'Ajouter un produit</button>'))+videosPanel()+'</div>'))}
function sheetProduct(){
  const d=S.sheet.d,im=safeImg(d.img),id=S.sheet.id;
  return '<div class="sheet" role="dialog" aria-modal="true" aria-label="Produit"><div class="sheet-in">'+head(id?'Modifier le produit':'Nouveau produit',{back:true})+
    '<div class="stack"><div class="field"><span class="lbl">Photo</span><div class="addrow"><div class="thumb" style="width:72px;height:72px">'+(im?'<img src="'+im+'" alt="">':icon('image'))+'</div>'+
    '<label class="btn sm soft" style="cursor:pointer">'+icon('image','sm')+(im?'Changer':'Ajouter')+'<input type="file" accept="image/*" data-i="img" style="position:absolute;width:1px;height:1px;opacity:0"></label>'+(im?'<button class="btn sm line" data-a="rmImg">Retirer</button>':'')+'</div></div>'+
    '<div class="field"><label for="pn">Nom</label><input id="pn" data-i="pf" data-k="name" value="'+esc(d.name)+'" placeholder="Ex. : Grand Ma 780 g" maxlength="80"></div>'+
    '<div class="two"><div class="field"><label for="pp">Prix (FCFA)</label><input id="pp" data-i="pf" data-k="price" inputmode="numeric" value="'+esc(d.price)+'" placeholder="3000"></div>'+
    '<div class="field"><label for="ps">Stock</label><input id="ps" data-i="pf" data-k="stock" inputmode="numeric" value="'+esc(d.stock)+'" placeholder="Illimité"></div></div>'+
    '<div class="field"><label for="pd">Description courte</label><textarea id="pd" data-i="pf" data-k="desc" rows="3" maxlength="200" placeholder="Une ou deux phrases pour donner envie">'+esc(d.desc)+'</textarea></div>'+
    (id?'<button class="btn danger" data-a="askDelProd" data-id="'+esc(id)+'">Supprimer ce produit</button>':'')+'</div></div>'+
    '<div class="foot"><div><button class="btn" data-a="saveProduct"'+(S.busy?' disabled aria-disabled="true"':'')+'>'+(S.busy?'<span class="spin"></span>Enregistrement…':'Enregistrer')+'</button></div></div></div>'}
function videosPanel(){
  const vs=D.videos||[];
  const rows=vs.map((v,i)=>{const k=VIDEO_KINDS[v.kind]||'Vidéo',on=v.on!==false;
    return '<div class="row"><button class="rowmain" data-a="editVideo" data-id="'+esc(v.id)+'"><div class="thumb vth">'+icon('play')+'</div><div class="grow"><div class="t">'+esc(v.title||('Vidéo '+k))+'</div><div class="sub2">'+esc(k)+(on?'':' · masquée')+'</div></div></button>'+
      '<button class="sw" role="switch" aria-checked="'+on+'" aria-label="Visible dans la boutique : '+esc(v.title||('Vidéo '+k))+'" data-a="toggleVideo" data-id="'+esc(v.id)+'"></button></div>'}).join('');
  return '<div class="panel"><h2>Vidéos</h2><div class="muted">Vos clients les regardent depuis la boutique, sans la quitter. Collez le lien d’une vidéo TikTok, YouTube, Facebook, Instagram, Vimeo, Google Drive, ou l’adresse d’un fichier .mp4.</div>'+
    (vs.length?'<div class="group">'+rows+'</div>':'')+
    '<button class="btn soft" data-a="newVideo">'+icon('plus','sm')+'Ajouter une vidéo</button></div>'}
function sheetVideo(){
  const d=S.sheet.d,id=S.sheet.id,v=id?(D.videos||[]).find(x=>x.id===id):null,k=v?(VIDEO_KINDS[v.kind]||'Vidéo'):'';
  const idx=v?(D.videos||[]).findIndex(x=>x.id===id):-1,last=(D.videos||[]).length-1;
  return '<div class="sheet" role="dialog" aria-modal="true" aria-label="Vidéo"><div class="sheet-in">'+head(id?'Modifier la vidéo':'Nouvelle vidéo',{back:true})+
    '<div class="stack">'+
    (id?'<div class="field"><span class="lbl">Source</span><div class="copyline"><span class="pill brand plain">'+esc(k)+'</span><code>'+esc(v&&v.url||'')+'</code></div></div>'+
        '<button class="btn soft" data-a="previewVideo">'+icon('play','sm')+'Voir la vidéo</button>'
      :'<div class="field"><label for="vu">Lien de la vidéo</label><input id="vu" data-i="vf" data-k="url" value="'+esc(d.url)+'" placeholder="Collez ici le lien (TikTok, YouTube, Facebook…)" inputmode="url" autocapitalize="off" autocomplete="off" autocorrect="off" spellcheck="false">'+
        '<span class="hint">Dans TikTok : ouvrez la vidéo, touchez « Partager », puis « Copier le lien ».</span></div><div id="vdet">'+vidDetect(d.url)+'</div>')+
    '<div class="field"><label for="vt">Titre (facultatif)</label><input id="vt" data-i="vf" data-k="title" value="'+esc(d.title)+'" placeholder="Ex. : Comment préparer Grand Ma en 5 minutes" maxlength="80"></div>'+
    (id?'<div class="two"><button class="btn line sm" data-a="moveVideo" data-d="up"'+(idx<=0||S.busy?' disabled aria-disabled="true"':'')+'>↑ Monter</button><button class="btn line sm" data-a="moveVideo" data-d="down"'+(idx<0||idx>=last||S.busy?' disabled aria-disabled="true"':'')+'>↓ Descendre</button></div>'+
        '<button class="btn danger" data-a="askDelVideo" data-id="'+esc(id)+'">Supprimer cette vidéo</button>':'')+'</div></div>'+
    '<div class="foot"><div><button class="btn" data-a="saveVideo"'+(S.busy?' disabled aria-disabled="true"':'')+'>'+(S.busy?'<span class="spin"></span>Enregistrement…':id?'Enregistrer':'Ajouter la vidéo')+'</button></div></div></div>'}
async function resizeImage(file,max=640){
  const url=URL.createObjectURL(file);
  try{const img=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=url});
    let s=Math.min(1,max/Math.max(img.width,img.height)),q=.82,out='';
    for(let k=0;k<6;k++){const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*s));c.height=Math.max(1,Math.round(img.height*s));c.getContext('2d').drawImage(img,0,0,c.width,c.height);
      out=c.toDataURL('image/webp',q);if(out.indexOf('data:image/webp')!==0)out=c.toDataURL('image/jpeg',q);if(out.length<190000)break;s*=.8;q=Math.max(.6,q-.05)}
    return out}finally{URL.revokeObjectURL(url)}}

/* ---------- réglages ---------- */
const TIMES=[];for(let m=300;m<=1410;m+=30)TIMES.push(pad2(Math.floor(m/60))+':'+pad2(m%60));
const timeSel=(attrs,val,label)=>{const l=TIMES.includes(val)?TIMES:TIMES.concat([val]).sort();return '<select '+attrs+' aria-label="'+esc(label)+'">'+l.map(t=>'<option value="'+t+'"'+(t===val?' selected':'')+'>'+esc(fmtT(t))+'</option>').join('')+'</select>'};
const sw=(p,on,label)=>'<button class="sw" role="switch" aria-checked="'+(!!on)+'" aria-label="'+esc(label)+'" data-a="swp" data-p="'+p+'"></button>';
const inp=(p,v,o={})=>'<input data-i="sp" data-p="'+p+'" data-t="'+(o.t||'text')+'" value="'+esc(v)+'"'+(o.type?' type="'+o.type+'"':'')+(o.ph?' placeholder="'+esc(o.ph)+'"':'')+(o.im?' inputmode="'+o.im+'"':'')+(o.label?' aria-label="'+esc(o.label)+'"':'')+(o.id?' id="'+o.id+'"':'')+(o.max?' maxlength="'+o.max+'"':'')+'>';
const fld=(id,label,inner,hint)=>'<div class="field"><label for="'+id+'">'+esc(label)+'</label>'+inner+(hint?'<span class="hint">'+esc(hint)+'</span>':'')+'</div>';
const swrow=(p,on,title,sub)=>'<div class="row" style="padding:10px 0;min-height:52px"><div class="grow"><div class="t" style="white-space:normal">'+esc(title)+'</div>'+(sub?'<div class="sub2" style="white-space:normal">'+esc(sub)+'</div>':'')+'</div>'+sw(p,on,title)+'</div>';
/* ce qu’il reste à régler avant d’ouvrir la boutique aux clients */
function shopWarnings(){const sh=adminShop(),pb=[],ch=A.srv.channels||{},on=A.srv.online||{};
  if(!waNum(sh.phone))pb.push('Ajoutez votre numéro WhatsApp (Réglages › Ma boutique) : il sert aux boutons « Écrire à la boutique » et à prévenir vos clients.');
  if(!Object.values(D.products).some(p=>p.on!==false))pb.push('Ajoutez au moins un produit visible dans la boutique.');
  if(sh.pay.momo.on&&!digits(sh.pay.momo.num))pb.push('Ajoutez votre numéro MTN MoMo, ou désactivez ce moyen de paiement.');
  if(sh.pay.om.on&&!digits(sh.pay.om.num))pb.push('Ajoutez votre numéro Orange Money, ou désactivez ce moyen de paiement.');
  if(!sh.delivery&&!sh.pickup)pb.push('Activez la livraison ou le retrait.');
  if(!firstSlot({...sh,lead:0},shopNow()))pb.push('Aucun créneau ne tient dans vos horaires d’ouverture : ouvrez un jour et ajoutez une plage de livraison.');
  if(sh.online.on&&!on.configured)pb.push('Le paiement en ligne est activé mais la clé Notch Pay est absente du serveur : il reste caché aux clients (voir le guide).');
  if(!ch.telegram&&!ch.ntfy)pb.push('Aucune alerte sur téléphone n’est configurée : vous ne serez prévenu que lorsque cette page est ouverte (voir le guide, étape « Alertes »).');
  return pb}
function alertsPanel(){const ch=A.srv.channels||{},none=!ch.telegram&&!ch.ntfy,perm='Notification' in window?Notification.permission:'unsupported';
  const line=(n,ok)=>'<div class="live">'+icon(ok?'check':'x','sm')+'<span>'+n+' : '+(ok?'configuré':'non configuré')+'</span></div>';
  return '<div class="panel"><h2>Alertes de commande</h2><div class="muted">À chaque nouvelle commande (ou paiement confirmé), un message part sur votre téléphone, même application fermée. Il ne contient ni nom ni adresse de client.</div>'+
    line('Telegram',ch.telegram)+line('ntfy',ch.ntfy)+
    (none?'<div class="note">'+icon('info','sm')+'<span>Pour recevoir les alertes application fermée, configurez Telegram ou ntfy (guide, étape « Alertes »). En attendant, cette page vous alerte par un son et une vibration tant qu’elle reste ouverte.</span></div>':'<button class="btn soft" data-a="notifyTest">Envoyer une alerte de test</button>')+
    '<div class="row" style="padding:6px 0;min-height:48px"><div class="grow"><div class="t" style="white-space:normal">Son quand cette page est ouverte</div></div><button class="sw" role="switch" aria-checked="'+A.sound+'" aria-label="Son des alertes" data-a="toggleSound"></button></div>'+
    (perm==='default'?'<button class="btn line sm" data-a="askNotif">Activer les notifications du navigateur</button>':perm==='granted'?'<div class="muted small">Notifications du navigateur activées (elles fonctionnent tant que la page reste ouverte en arrière-plan).</div>':'')+'</div>'}
function onlineRow(s){const o=A.srv.online||{};
  return '<div class="panel" style="border-style:dashed">'+swrow('online.on',s.online.on,'Paiement en ligne','Le client règle depuis son téléphone (MTN MoMo, Orange Money) ; la commande est validée automatiquement, sans que vous ayez à vérifier.')+
    (s.online.on?(o.configured?'<div class="note ok">'+icon('check','sm')+'<span>Clé Notch Pay détectée'+(o.test?' : <b>mode essai</b>, aucun argent réel ne circule.':' : <b>mode réel</b>.')+'</span></div>'+
      '<div class="field"><span class="lbl">Adresse de notification (webhook) à donner à Notch Pay</span><div class="copyline"><code>'+esc(o.webhookUrl||'')+'</code><button class="btn sm soft" data-a="copy" data-v="'+esc(o.webhookUrl||'')+'">'+icon('copy','sm')+'Copier</button></div>'+
      '<span class="hint">'+(o.webhookSigned?'Clé de signature enregistrée : les notifications de paiement sont vérifiées.':'Sans clé de signature (NOTCHPAY_HASH), les paiements sont tout de même vérifiés à la fin du paiement du client, mais pas si le client ferme la page trop tôt.')+'</span></div>'
      :'<div class="note bad">'+icon('info','sm')+'<span>La clé Notch Pay n’est pas encore enregistrée sur le serveur : ce moyen de paiement reste caché aux clients (guide, étape « Paiement en ligne »).</span></div>'):'')+'</div>'}
function viewSettings(){
  const s=adminShop(),pb=A.ready?shopWarnings():[];
  const wk=WEEK_DISPLAY.map(i=>{const w=s.week[i];return '<div class="wk'+(w.on?'':' off')+'"><div class="dn">'+sw('week.'+i+'.on',w.on,WEEK_NAMES[i]+' : ouvert')+'<span>'+WEEK_NAMES[i].slice(0,3)+'.</span></div>'+
    timeSel('data-i="sp" data-t="time" data-p="week.'+i+'.from"',w.from,'Ouverture '+WEEK_NAMES[i])+timeSel('data-i="sp" data-t="time" data-p="week.'+i+'.to"',w.to,'Fermeture '+WEEK_NAMES[i])+'</div>'}).join('');
  const closed=s.closed.length?'<div class="chips wrap">'+s.closed.map(d=>'<button class="chip" data-a="delClosed" data-id="'+d+'" aria-label="Retirer le '+esc(DF_LONG.format(fromISO(d)))+'">'+esc(DF_DM.format(fromISO(d)))+icon('x','sm')+'</button>').join('')+'</div>':'';
  const slots=s.slots.length?'<div class="group">'+s.slots.map((x,i)=>'<div class="li"><div class="grow t">'+esc(slotLabel(x.from,x.to))+'</div><button class="iconbtn plain" data-a="delSlot" data-n="'+i+'" aria-label="Supprimer '+esc(slotLabel(x.from,x.to))+'">'+icon('trash')+'</button></div>').join('')+'</div>':'<div class="note">'+icon('info','sm')+'<span>Aucune plage : les clients ne pourront pas choisir de créneau.</span></div>';
  const zones=s.zones.length?'<div class="group">'+s.zones.map((z,i)=>'<div class="li"><div class="grow">'+inp('zones.'+i+'.name',z.name,{label:'Nom du quartier',max:40})+'</div><div style="width:112px">'+inp('zones.'+i+'.fee',z.fee,{t:'int',im:'numeric',label:'Frais en FCFA'})+'</div><button class="iconbtn plain" data-a="delZone" data-n="'+i+'" aria-label="Supprimer '+esc(z.name)+'">'+icon('trash')+'</button></div>').join('')+'</div>':'';
  const payRow=(k,t)=>'<div class="panel" style="border-style:dashed">'+swrow('pay.'+k+'.on',s.pay[k].on,t)+(s.pay[k].on?fld('pn-'+k,'Numéro '+t,inp('pay.'+k+'.num',s.pay[k].num,{type:'tel',im:'tel',id:'pn-'+k,ph:'Ex. : 6 70 00 00 00'}))+fld('pt-'+k,'Nom du titulaire',inp('pay.'+k+'.name',s.pay[k].name,{id:'pt-'+k,max:40})):'')+'</div>';
  return adminShell(head('Réglages')+loadingOr('<div class="stack">'+
    (pb.length?'<div class="panel"><h2>À compléter</h2>'+pb.map(x=>'<div class="note">'+icon('info','sm')+'<span>'+esc(x)+'</span></div>').join('')+'</div>':'<div class="note ok">'+icon('check','sm')+'<span>Tout est prêt : vos modifications sont visibles par vos clients immédiatement, sans rien publier.</span></div>')+
    alertsPanel()+
    '<div class="panel"><h2>Ma boutique</h2>'+fld('s-name','Nom',inp('name',s.name,{id:'s-name',max:60}))+fld('s-about','Présentation',inp('about',s.about,{id:'s-about',max:300,ph:'Une phrase pour vos clients'}))+
      fld('s-phone','Votre numéro WhatsApp',inp('phone',s.phone,{type:'tel',im:'tel',id:'s-phone',ph:'Ex. : 6 99 00 00 00'}),'Affiché aux clients pour vous écrire.')+fld('s-city','Ville de livraison',inp('city',s.city,{id:'s-city',max:40}))+'</div>'+
    '<div class="panel" style="padding:14px 0"><h2 style="padding:0 14px">Horaires d’ouverture</h2><div class="muted" style="padding:0 14px;margin-top:-6px">Jours et heures où vous livrez ou recevez les clients (heure du Cameroun).</div><div>'+wk+'</div></div>'+
    '<div class="panel"><h2>Jours fermés</h2><div class="muted">Fêtes, congés : la boutique propose ces jours en indisponible.</div>'+closed+'<div class="addrow"><input type="date" id="cl-date" aria-label="Date de fermeture"><button class="btn sm soft" data-a="addClosed">Ajouter</button></div></div>'+
    '<div class="panel"><h2>Plages de livraison</h2><div class="muted">Une plage est proposée les jours où elle tient dans vos horaires.</div>'+slots+
      '<div class="addrow">'+timeSel('id="sl-from"','09:00','Début de plage')+timeSel('id="sl-to"','12:00','Fin de plage')+'<button class="btn sm soft" data-a="addSlot">Ajouter</button></div>'+
      '<div class="two">'+fld('s-lead','Délai de préparation','<select id="s-lead" data-i="sp" data-t="int" data-p="lead">'+[0,1,2,3,4,6,12,24,48,72].map(h=>'<option value="'+h+'"'+(s.lead===h?' selected':'')+'>'+(h===0?'Aucun':h===24?'1 jour':h===48?'2 jours':h===72?'3 jours':h+' h')+'</option>').join('')+'</select>')+
      fld('s-ahead','Réservation jusqu’à','<select id="s-ahead" data-i="sp" data-t="int" data-p="ahead">'+[1,2,3,4,5,6,7,10,14,21,30].map(n=>'<option value="'+n+'"'+(s.ahead===n?' selected':'')+'>'+(n===1?'demain':n+' jours')+'</option>').join('')+'</select>')+'</div></div>'+
    '<div class="panel"><h2>Livraison et retrait</h2>'+swrow('delivery',s.delivery,'Livraison à domicile')+swrow('pickup',s.pickup,'Retrait en boutique')+
      (s.pickup?fld('s-pa','Adresse de retrait',inp('pickupAddr',s.pickupAddr,{id:'s-pa',max:160,ph:'Ex. : Carrefour Mvog-Mbi, derrière la station'})):'')+
      (s.delivery?'<div class="lbl" style="margin-top:4px">Frais de livraison</div>'+
        swrow('base.on',s.base.on,'Même tarif dans toute la ville'+(s.city?' de '+s.city:''),'Le client n’a à choisir son quartier que s’il a un tarif différent.')+
        (s.base.on?fld('s-base','Tarif standard (FCFA)',inp('base.fee',s.base.fee||'',{t:'int',im:'numeric',id:'s-base',ph:'Ex. : 1000'})):'')+
        '<div class="lbl" style="margin-top:4px">'+(s.base.on?'Quartiers à tarif différent':'Quartiers desservis et frais')+'</div>'+
        '<div class="muted small">'+(s.base.on?'Un quartier de cette liste remplace le tarif standard. Exemple : un quartier éloigné facturé plus cher.':'Ajoutez chaque quartier desservi avec son tarif.')+'</div>'+zones+
        '<div class="addrow"><input id="z-name" placeholder="Quartier" aria-label="Nom du quartier" maxlength="40"><input id="z-fee" inputmode="numeric" placeholder="Tarif" aria-label="Tarif en FCFA" style="max-width:96px"><button class="btn sm soft" data-a="addZone">Ajouter</button></div>'+
        swrow('zoneOther',s.zoneOther,'Proposer « '+otherLabel(s)+' »','Le client l’indique si son quartier n’est pas desservi. Vous confirmez les frais ensuite, depuis la commande.')+
        '<div class="two">'+fld('s-free','Livraison offerte dès',inp('freeFrom',s.freeFrom||'',{t:'int',im:'numeric',id:'s-free',ph:'Désactivé'}))+fld('s-min','Commande minimum',inp('minOrder',s.minOrder||'',{t:'int',im:'numeric',id:'s-min',ph:'Aucun'}))+'</div>':'')+'</div>'+
    '<div class="panel"><h2>Paiement</h2><div class="muted">Le client choisit parmi les moyens activés ci-dessous.</div>'+onlineRow(s)+payRow('momo','MTN MoMo')+payRow('om','Orange Money')+
      '<div class="panel" style="border-style:dashed">'+swrow('pay.cash.on',s.pay.cash.on,'Espèces à la livraison ou au retrait')+'</div>'+
      fld('s-pnote','Consigne de paiement (facultatif)',inp('payNote',s.payNote,{id:'s-pnote',max:200,ph:'Ex. : indiquez la référence de commande en motif'}))+'</div>'+
    '<div class="panel"><h2>Compte</h2><div class="muted">Pour installer l’espace vendeur sur votre téléphone : ouvrez ce site dans Chrome ou Safari, puis « Ajouter à l’écran d’accueil ».</div>'+
      '<button class="btn soft" data-a="go" data-v="shop">Voir ce que voient les clients</button><button class="btn line" data-a="logout">Se déconnecter</button></div>'+
    '</div>'))}

/* ---------- fenêtres ---------- */
function dialogHTML(){const d=S.dialog;if(!d)return '';
  if(d.t==='info')return '<div class="scrim" data-a="closeDialog"><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" data-stop="1"><h2 id="dlg-t">'+esc(d.title)+'</h2>'+(d.text?'<p class="muted">'+esc(d.text)+'</p>':'')+(d.list?'<div class="stack t">'+d.list.map(x=>'<div class="note">'+icon('info','sm')+'<span>'+esc(x)+'</span></div>').join('')+'</div>':'')+'<div class="acts"><button class="btn" data-a="closeDialog">Compris</button></div></div></div>';
  if(d.t==='confirm')return '<div class="scrim" data-a="closeDialog"><div class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dlg-t" data-stop="1"><h2 id="dlg-t">'+esc(d.title)+'</h2><p class="muted">'+esc(d.text)+'</p><div class="acts"><button class="btn line" data-a="closeDialog">Non</button><button class="btn danger" data-a="doConfirm">'+esc(d.ok)+'</button></div></div></div>';
  return ''}
function confirmDlg(title,text,ok,fn){S.dialog={t:'confirm',title,text,ok,fn};render(true)}
