'use strict';
/* =========================================================
   État, accès au serveur, vitrine et parcours client
   (les fonctions du cœur : prix, dates, créneaux… viennent de core.js, partagé avec le serveur)
   ========================================================= */
let SHOP=canonShop({}),PRODUCTS=[];
const D={products:{},orders:{},settings:{}};
const A={on:false,ready:false,rev:0,srv:{online:{},channels:{}},seen:null,inflight:0,err:'',sound:true};
const S={view:'shop',cart:{},take:false,sent:null,sheet:null,dialog:null,filter:'open',busy:false,sending:false,loading:true,loadErr:'',
  C:{mode:'livraison',zone:'',addr:'',date:'',slot:'',name:'',phone:'',pay:'',paid:false,txn:'',ref:'',consent:false}};
const store=(k,v)=>{try{if(v===undefined)return JSON.parse(localStorage.getItem(k));if(v===null)localStorage.removeItem(k);else localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}};

/* ---------- accès au serveur ---------- */
async function api(method,path,body){
  const o={method,headers:{},credentials:'same-origin'};
  if(path.startsWith('/api/admin'))o.headers['x-zap']='1';
  if(body!==undefined){o.headers['content-type']='application/json';o.body=JSON.stringify(body)}
  let r;try{r=await fetch(path,o)}catch(e){const er=new Error('Pas de connexion. Vérifiez votre réseau puis réessayez.');er.status=0;er.data={};throw er}
  let j=null;try{j=await r.json()}catch(e){}
  if(!r.ok){const er=new Error((j&&j.error)||'Une erreur est survenue ('+r.status+').');er.status=r.status;er.data=j||{};
    if(r.status===401&&path.startsWith('/api/admin')&&!path.endsWith('/login'))adminLost();throw er}
  return j||{}}

async function loadShop(){
  const j=await api('GET','/api/shop');
  setClock(j.now);SHOP=canonShop(j.shop);PRODUCTS=canonProducts(j.products);
  try{document.title=SHOP.name+' · Commande en ligne'}catch(e){}}

const SH=()=>(S.take&&A.ready)?adminShop():SHOP;
const PR=()=>(S.take&&A.ready)?liveProducts():PRODUCTS;
const maxQty=p=>p.stock==null?99:Math.min(99,p.stock);
function cartItems(){return PR().filter(p=>(S.cart[p.id]||0)>0&&p.stock!==0).map(p=>({...p,qty:Math.min(S.cart[p.id],maxQty(p))}))}
const cartCount=()=>sum(cartItems(),i=>i.qty);
const cartSub=()=>sum(cartItems(),i=>i.price*i.qty);
function saveMe(){const c=S.C;store('zap.me',{name:c.name,phone:c.phone,zone:c.zone,addr:c.addr,mode:c.mode,pay:c.pay,consent:!!c.consent})}
function saveCart(){if(!S.take)store('zap.cart',S.cart)}
function initDraft(){
  const me=store('zap.me')||{};const c=S.C;
  if(!S.take){c.name=me.name||c.name;c.phone=me.phone||c.phone;c.zone=me.zone||c.zone;c.addr=me.addr||c.addr;c.mode=me.mode||c.mode;c.pay=me.pay||c.pay;c.consent=!!me.consent}
  const cart=store('zap.cart');if(cart&&typeof cart==='object'&&!S.take){PRODUCTS.forEach(p=>{if(cart[p.id]>0&&p.stock!==0)S.cart[p.id]=Math.min(cart[p.id],maxQty(p))})}}
/* moyens de paiement proposés : « en ligne » seulement aux clients (jamais pour une commande saisie par le vendeur) */
const payMethodsUI=sh=>payMethods(sh,!S.take);
/* garde le brouillon valide par rapport aux réglages actuels (mode, zone, jour, créneau, paiement) */
function fixDraft(){
  const sh=SH(),c=S.C,shop2=S.take?{...sh,lead:0}:sh;
  if(c.mode==='livraison'&&!sh.delivery)c.mode='retrait';
  if(c.mode==='retrait'&&!sh.pickup&&sh.delivery)c.mode='livraison';
  const zo=zoneOptions(sh);if(!zo.includes(c.zone))c.zone=zo.length===1?zo[0]:'';
  const days=daysAvail(shop2,shopNow()),d=days.find(x=>x.date===c.date);
  if(!d||!d.slots.some(s=>s.from+'-'+s.to===c.slot)){const f=firstSlot(shop2,shopNow());c.date=f?f.date:'';c.slot=f?f.slot:''}
  const pm=payMethodsUI(sh).filter(k=>!(k==='online'&&onlineBlocked(c.mode,c.zone)));if(!pm.includes(c.pay))c.pay=pm.length===1?pm[0]:'';
  if(!c.ref)c.ref='x'}
function shipError(){const sh=SH(),c=S.C;
  if(!cartItems().length)return 'Ajoutez au moins un produit.';
  if(sh.minOrder&&cartSub()<sh.minOrder&&!S.take)return 'Commande minimum : '+money(sh.minOrder)+'.';
  if(c.mode==='livraison'){if(needZone(sh)&&!c.zone)return 'Choisissez votre quartier.';if(c.addr.trim().length<3)return 'Indiquez un repère pour le livreur.'}
  if(!c.date||!c.slot)return 'Choisissez un jour et un créneau.';return ''}
function payError(){const c=S.C;
  if(c.name.trim().length<2)return 'Indiquez votre nom.';
  if(!validPhone(c.phone))return 'Vérifiez votre numéro de téléphone.';
  if(!c.pay)return 'Choisissez comment payer.';
  if(!S.take&&!c.consent)return 'Cochez la case pour valider votre commande.';return ''}

/* ---------- vitrine ---------- */
function pctl(p){const q=S.cart[p.id]||0,id=esc(p.id);
  if(p.stock===0)return '<button class="btn sm soft" disabled>Épuisé</button>';
  if(!q)return '<button class="btn sm" data-a="inc" data-id="'+id+'">'+icon('plus','sm')+'Ajouter</button>';
  return '<div class="qty"><button data-a="dec" data-id="'+id+'" aria-label="Retirer un '+esc(p.name)+'">'+icon('minus')+'</button><b aria-live="polite">'+q+'</b><button data-a="inc" data-id="'+id+'" aria-label="Ajouter un '+esc(p.name)+'"'+(q>=maxQty(p)?' disabled':'')+'>'+icon('plus')+'</button></div>'}
function pcard(p){const im=safeImg(p.img);
  return '<article class="pcard"><div class="pimg">'+(im?'<img src="'+im+'" alt="" loading="lazy">':esc(initials(p.name)))+'</div><div class="pbody"><b>'+esc(p.name)+'</b>'+(p.desc?'<p class="d">'+esc(p.desc)+'</p>':'')+
    '<div class="pr num">'+money(p.price)+'</div>'+(p.stock!=null&&p.stock>0&&p.stock<=5?'<span class="pill signal">Plus que '+p.stock+'</span>':'')+'<div class="pctl" data-pid="'+esc(p.id)+'">'+pctl(p)+'</div></div></article>'}
function cartbar(){const n=cartCount(),sh=SH();if(!n)return '';const low=sh.minOrder&&cartSub()<sh.minOrder&&!S.take;
  return '<div class="cartbar"><div><div class="tot"><span>'+n+(n>1?' articles':' article')+'</span><b class="num">'+money(cartSub())+'</b></div>'+
    '<button class="btn" data-a="toShip"'+(low?' disabled aria-disabled="true"':'')+'>'+(low?'Min. '+money(sh.minOrder):'Choisir la livraison')+(low?'':icon('next','sm'))+'</button></div></div>'}
function vbar(){
  if(S.take)return '<div class="vbar has"><div><span>Saisie d’une commande client</span><button data-a="endTake">Annuler</button></div></div>';
  if(!A.on)return '';
  return '<div class="vbar has"><div><span>Vous êtes connecté en vendeur</span><button data-a="go" data-v="orders">Espace vendeur</button></div></div>'}
function lastOrderNote(){const l=store('zap.last');if(S.take||!l||!l.token||Date.now()-l.at>3*864e5)return '';
  return '<button class="note info" style="margin-top:12px" data-a="openLast">'+icon('receipt','sm')+'<span style="flex:1">Suivre ma commande <b>'+esc(l.ref)+'</b></span>'+icon('next','sm')+'</button>'}
function viewShop(){
  if(S.loading&&!S.take)return '<div class="app"><div class="stack" aria-busy="true" style="padding-top:28px"><div class="sk" style="height:30px;width:55%"></div><div class="sk" style="height:18px;width:80%"></div><div class="sk" style="height:150px"></div><div class="sk" style="height:150px"></div></div></div>';
  if(S.loadErr&&!S.take)return '<div class="app"><div class="empty" style="padding-top:60px">'+icon('info')+'<h3>La boutique ne répond pas</h3><p>'+esc(S.loadErr)+'</p><button class="btn" data-a="reload">Réessayer</button></div></div>';
  const sh=SH(),st=openStatus(sh,shopNow()),ps=PR();
  const facts=[];
  if(sh.delivery)facts.push('<span>'+icon('truck','sm')+'Livraison'+(sh.city?' à '+esc(sh.city):'')+'</span>');
  if(sh.pickup)facts.push('<span>'+icon('store','sm')+'Retrait possible</span>');
  if(sh.freeFrom)facts.push('<span>'+icon('check','sm')+'Livraison offerte dès '+money(sh.freeFrom)+'</span>');
  if(sh.minOrder)facts.push('<span>'+icon('bag','sm')+'Minimum '+money(sh.minOrder)+'</span>');
  return vbar()+'<div class="app" style="padding-bottom:'+(cartCount()?'132px':'40px')+'"><header class="shop-h"><span class="kick">Commande en ligne</span><h1 tabindex="-1">'+esc(sh.name)+'</h1>'+
    (sh.about?'<p>'+esc(sh.about)+'</p>':'')+'<div><span class="pill '+(st.open?'brand':'plain')+'">'+esc(st.text)+'</span></div>'+(facts.length?'<div class="facts">'+facts.join('')+'</div>':'')+lastOrderNote()+'</header>'+
    (ps.length?'<section aria-label="Produits"><div class="pgrid">'+ps.map(pcard).join('')+'</div></section>':'<div class="empty">'+icon('bag')+'<h3>La boutique prépare ses produits</h3><p>Revenez dans un instant.</p></div>')+
    (S.take?'':'<div class="legal"><a href="/confidentialite.html" target="_blank" rel="noopener">Confidentialité</a><a href="#vendeur">Espace vendeur</a></div>')+
    '</div><div id="cartbar">'+cartbar()+'</div>'}
function refreshCart(id){
  const p=PR().find(x=>x.id===id),el=p&&document.querySelector('.pctl[data-pid="'+(window.CSS&&CSS.escape?CSS.escape(id):id)+'"]');
  if(el){const had=el.contains(document.activeElement)&&document.activeElement.dataset.a;el.innerHTML=pctl(p);
    if(had){const b=el.querySelector('[data-a="'+had+'"]:not([disabled])')||el.querySelector('button');if(b)b.focus({preventScroll:true})}}
  const cb=$('#cartbar');if(cb)cb.innerHTML=cartbar();
  const ap=$('.app');if(ap)ap.style.paddingBottom=cartCount()?'132px':'40px'}

/* ---------- étapes ---------- */
const prog=n=>'<ol class="prog" aria-label="Étapes de commande">'+['Produits','Livraison','Paiement'].map((t,i)=>'<li class="'+(i+1<n?'done':i+1===n?'now':'')+'"'+(i+1===n?' aria-current="step"':'')+'>'+(i+1)+'. '+t+'</li>').join('')+'</ol>';
function stepHead(title,backV,n,sub){return '<header class="top"><button class="iconbtn plain" data-a="go" data-v="'+backV+'" aria-label="Retour">'+icon('back')+'</button><h1 tabindex="-1">'+esc(title)+(sub?'<span class="sub">'+esc(sub)+'</span>':'')+'</h1></header>'}
function totalsFoot(btn){const c=S.C,pr=priceCart(SH(),cartItems(),c.mode,c.zone);
  return '<div class="foot"><div><div class="tot"><span>Total'+(pr.feeNote==='À confirmer'?' (+ livraison)':'')+'</span><b class="num" id="ftot">'+money(pr.total)+'</b></div>'+btn+'</div></div>'}
function viewShip(){
  const sh=SH(),c=S.C,shop2=S.take?{...sh,lead:0}:sh,days=daysAvail(shop2,shopNow()),cur=days.find(d=>d.date===c.date),pr=priceCart(sh,cartItems(),c.mode,c.zone);
  const both=sh.delivery&&sh.pickup;
  let where='';
  if(c.mode==='livraison'){
    const feeS=f=>sh.freeFrom&&pr.sub>=sh.freeFrom&&f?'offerte':f?money(f):'gratuit';
    const zs=(sh.base.on?'<button class="chip" data-a="zone" data-id="base" aria-pressed="'+(c.zone==='base')+'">'+esc(baseLabel(sh))+' <small>'+feeS(sh.base.fee)+'</small></button>':'')+
      sh.zones.map(z=>'<button class="chip" data-a="zone" data-id="'+esc(z.id)+'" aria-pressed="'+(c.zone===z.id)+'">'+esc(z.name)+' <small>'+feeS(z.fee)+'</small></button>').join('')+
      (sh.zoneOther?'<button class="chip" data-a="zone" data-id="autre" aria-pressed="'+(c.zone==='autre')+'">'+esc(otherLabel(sh))+' <small>à confirmer</small></button>':'');
    where=(needZone(sh)?'<div class="field"><span class="lbl" id="lz">Votre quartier</span><div class="chips wrap" role="group" aria-labelledby="lz">'+zs+'</div></div>':'')+
      '<div class="field"><label for="addr">Repère pour le livreur</label><input id="addr" data-i="addr" value="'+esc(c.addr)+'" placeholder="Ex. : derrière la pharmacie, portail bleu" autocomplete="street-address" enterkeyhint="done" maxlength="160"></div>'+
      (c.zone==='autre'?'<div class="note">'+icon('info','sm')+'<span>Nous confirmerons les frais de livraison par WhatsApp avant la livraison.</span></div>':'');
  }else{
    where='<div class="panel"><h2>Retrait</h2><div class="muted">'+(sh.pickupAddr?esc(sh.pickupAddr):'Le vendeur vous indiquera l’adresse de retrait sur WhatsApp.')+'</div></div>'}
  const dayBtns=days.map(d=>{const dt=fromISO(d.date),dis=!d.slots.length;
    return '<button class="day" data-a="day" data-id="'+d.date+'" aria-pressed="'+(c.date===d.date)+'"'+(dis?' disabled':'')+' aria-label="'+esc(DF_LONG.format(dt)+(dis?', indisponible':''))+'"><small>'+esc(d.date===shopToday()?'Auj.':DF_WDS.format(dt).replace('.',''))+'</small><b>'+dt.getUTCDate()+'</b><small>'+esc(DF_MON.format(dt).replace('.',''))+'</small></button>'}).join('');
  const any=days.some(d=>d.slots.length);
  const slots=cur&&cur.slots.length?'<div class="slots" role="group" aria-label="Créneaux">'+cur.slots.map(s=>{const k=s.from+'-'+s.to;return '<button class="chip" data-a="slot" data-id="'+k+'" aria-pressed="'+(c.slot===k)+'">'+esc(slotLabel(s.from,s.to))+'</button>'}).join('')+'</div>':'';
  const err=shipError();
  return '<div class="app">'+stepHead('Livraison','shop',2)+'<div class="stack">'+prog(2)+
    (both?'<div class="seg" role="group" aria-label="Mode"><button data-a="mode" data-id="livraison" aria-pressed="'+(c.mode==='livraison')+'">'+icon('truck','sm')+'Livraison</button><button data-a="mode" data-id="retrait" aria-pressed="'+(c.mode==='retrait')+'">'+icon('store','sm')+'Retrait</button></div>':'')+
    where+
    '<div class="field"><span class="lbl">'+(c.mode==='livraison'?'Quand voulez-vous être livré ?':'Quand passer chercher ?')+'</span>'+(any?'<div class="days" role="group" aria-label="Jour">'+dayBtns+'</div>'+slots:
      '<div class="note bad">'+icon('info','sm')+'<span>Aucun créneau n’est disponible pour le moment. Écrivez-nous sur WhatsApp.</span></div>')+'</div>'+
    '</div></div>'+totalsFoot('<button class="btn" data-a="toPay" id="next2" aria-disabled="'+(!!err)+'">Continuer'+icon('next','sm')+'</button>')}
/* aperçu de la commande, calculé comme le fera le serveur (le serveur recalcule de toute façon) */
const draftOrder=()=>buildOrder(SH(),cartItems(),{...S.C,ref:'····'});
function recapHTML(o){
  const L=o.items.map(i=>'<div class="l"><span>'+i.qty+' × '+esc(i.name)+'</span><span>'+money(i.price*i.qty)+'</span></div>').join('');
  return '<div class="recap">'+L+(o.mode==='livraison'?'<div class="l"><span>Livraison'+(o.zoneName?' · '+esc(o.zoneName):'')+'</span><span>'+(o.feeNote==='À confirmer'?'à confirmer':o.fee?money(o.fee):'offerte')+'</span></div>':'')+
    '<div class="sep"></div><div class="l tt"><span>Total</span><span>'+money(o.total)+'</span></div><div class="sep"></div>'+
    '<div class="m">'+icon(o.mode==='livraison'?'truck':'store','sm')+' '+esc(DF_LONG.format(fromISO(o.date)))+', '+esc(slotLabel(o.from,o.to))+'</div>'+(o.mode==='livraison'?'<div class="m">'+icon('pin','sm')+' '+esc((o.zoneName?o.zoneName+' · ':'')+o.address)+'</div>':'')+'</div>'}
function payBox(sh,o){const c=S.C,m=c.pay;if(!m)return '';
  if(m==='online')return '<div class="note ok">'+icon('lock','sm')+'<span>Vous réglez <b class="num">'+money(o.total)+'</b> sur la page de paiement sécurisée de Notch Pay (MTN MoMo ou Orange Money). À la fin, vous revenez ici et votre commande est confirmée automatiquement.</span></div>';
  if(m==='cash')return '<div class="note ok">'+icon('cash','sm')+'<span>Vous réglez '+money(o.total)+' en espèces à la '+(c.mode==='livraison'?'livraison':'remise de la commande')+'.</span></div>';
  const p=sh.pay[m],n=p.num?prettyPhone(p.num):'';
  return '<div class="paybox"><div>Envoyez <b class="num">'+money(o.total)+'</b> par '+esc(PAYN[m])+(n?' au :':'.')+'</div>'+
    (n?'<div class="line1"><span class="big">'+esc(n)+'</span><button class="btn sm soft" data-a="copy" data-v="'+esc(p.num)+'">'+icon('copy','sm')+'Copier</button></div>'+(p.name?'<div class="muted small">Au nom de '+esc(p.name)+'</div>':''):'<div class="muted">Le vendeur vous donnera son numéro '+esc(PAYN[m])+' sur WhatsApp.</div>')+
    (sh.payNote?'<div class="muted small">'+esc(sh.payNote)+'</div>':'')+
    '<button class="check" role="checkbox" aria-checked="'+c.paid+'" data-a="paid"><i>'+icon('check')+'</i><span><b>J’ai déjà envoyé l’argent</b><br><span class="muted small">Sinon, vous pourrez payer à la livraison.</span></span></button>'+
    (c.paid?'<div class="field"><label for="txn">Référence de la transaction (facultatif)</label><input id="txn" data-i="txn" value="'+esc(c.txn)+'" placeholder="Ex. : 1234567890" autocomplete="off" maxlength="40"></div>':'')+'</div>'}
function consentBox(sh){
  if(S.take)return '';
  return '<div class="consent"><button class="check" role="checkbox" aria-checked="'+!!S.C.consent+'" data-a="consent"><i>'+icon('check')+'</i><span class="small">J’accepte que <b>'+esc(sh.name)+'</b> utilise mon nom, mon téléphone et mon adresse pour préparer et livrer ma commande, et me contacter à ce sujet (WhatsApp ou appel). <a href="/confidentialite.html" target="_blank" rel="noopener">En savoir plus</a></span></button></div>'}
function sendBtn(o){
  const err=payError(),online=S.C.pay==='online';
  const label=S.sending?(online?'Redirection vers le paiement…':'Envoi en cours…'):S.take?'Enregistrer la commande':online?'Payer '+money(o.total):'Envoyer ma commande';
  return '<button class="btn" id="send" data-a="send" aria-disabled="'+(!!err||S.sending)+'">'+(S.sending?'<span class="spin"></span>':online?icon('lock','sm'):'')+label+'</button>'}
function viewPay(){
  const sh=SH(),c=S.C,o=draftOrder(),pm=payMethodsUI(sh);
  const opts=pm.map(k=>{const off=k==='online'&&onlineBlocked(c.mode,c.zone);
    return '<button class="opt" data-a="pay" data-id="'+k+'" aria-pressed="'+(c.pay===k)+'"'+(off?' disabled aria-disabled="true"':'')+'>'+icon(k==='cash'?'cash':k==='online'?'lock':'phone')+'<span class="grow">'+esc(PAYN[k])+'<small>'+
      (k==='cash'?(c.mode==='livraison'?'À la livraison':'Au retrait'):k==='online'?(off?'Indisponible : les frais de livraison restent à confirmer':'MTN MoMo ou Orange Money, tout de suite'):'Payez maintenant ou à la livraison')+'</small></span></button>'}).join('');
  return '<div class="app">'+stepHead('Paiement','ship',3)+'<div class="stack">'+prog(3)+
    '<div class="panel"><h2>Vos coordonnées</h2><div class="field"><label for="nm">Nom</label><input id="nm" data-i="name" value="'+esc(c.name)+'" autocomplete="name" placeholder="Ex. : Nathalie Mballa" maxlength="60"></div>'+
    '<div class="field"><label for="ph">Téléphone (WhatsApp)</label><input id="ph" data-i="phone" type="tel" inputmode="tel" value="'+esc(c.phone)+'" autocomplete="tel" placeholder="Ex. : 6 99 00 00 00" maxlength="24"></div></div>'+
    '<div class="field"><span class="lbl">Comment payer ?</span><div class="optlist" role="group" aria-label="Moyen de paiement">'+opts+'</div></div>'+
    '<div id="paybox">'+payBox(sh,o)+'</div>'+
    '<div class="field"><span class="lbl">Récapitulatif</span><div id="recap">'+recapHTML(o)+'</div></div>'+
    '<div id="consentwrap">'+consentBox(sh)+'</div>'+
    '</div></div>'+totalsFoot('<span id="sendwrap" style="display:contents">'+sendBtn(o)+'</span>')}
/* met à jour le bouton d’envoi et le récapitulatif sans reconstruire la page (garde le focus du clavier) */
function syncPay(){const o=draftOrder(),w=$('#sendwrap');if(w)w.innerHTML=sendBtn(o);const r=$('#recap');if(r)r.innerHTML=recapHTML(o)}

/* ---------- page « merci » et suivi de commande ---------- */
const STLAB={nouvelle:['Reçue','info'],confirmee:['Confirmée','signal'],livree:['Livrée','brand'],annulee:['Annulée','danger']};
function viewDone(){
  const s=S.sent;if(!s)return viewShop();const sh=SH();
  if(s.admin)return '<div class="app">'+'<div class="stack" style="padding-top:28px"><div class="ctr"><div class="done-ic">'+icon('check')+'</div><h1 tabindex="-1">Commande #'+s.no+' enregistrée</h1></div>'+
    recapHTML(s.o)+'<div class="optlist">'+(waNum(s.o.phone)?'<a class="btn block" target="_blank" rel="noopener" href="'+esc(waLink(s.o.phone,s.confirm))+'">'+icon('chat','sm')+'Prévenir le client sur WhatsApp</a>':'')+
    '<button class="btn soft block" data-a="openOrderId" data-id="'+esc(s.id)+'">Voir la commande</button><button class="btn line block" data-a="takeAgain">Saisir une autre commande</button></div></div></div>';
  const o=s.o,p=o.pay,online=p.method==='online',waiting=online&&!p.paid&&(p.state==='pending'||p.state==='mismatch'),failed=online&&!p.paid&&(p.state==='failed'||p.state==='unpaid');
  const cancelled=o.status==='annulee';
  const title=cancelled?'Commande annulée':online&&p.paid?'Paiement reçu, merci !':waiting?'Vérification du paiement…':failed?'Le paiement n’a pas abouti':'Commande enregistrée';
  const ic=failed||cancelled?'info':waiting?'receipt':'check';
  const msg=cancelled?'Cette commande a été annulée. Écrivez à '+esc(sh.name)+' si vous avez une question.'
    :waiting?'Validez la demande sur votre téléphone si ce n’est pas fait. La confirmation peut prendre une minute : cette page se met à jour toute seule.'
    :failed?'Aucun montant n’a été prélevé. Vous pouvez réessayer, ou payer à la '+(o.mode==='livraison'?'livraison':'remise')+'.'
    :esc(sh.name)+' a bien reçu votre commande et vous confirmera la '+(o.mode==='livraison'?'livraison':'préparation')+' sur WhatsApp au '+esc(prettyPhone(o.phone))+'.';
  const st=STLAB[o.status]||STLAB.nouvelle;
  return '<div class="app"><div class="stack" style="padding-top:28px"><div class="ctr"><div class="done-ic"'+(failed||cancelled?' style="background:var(--signal)"':'')+'>'+icon(ic)+'</div><h1 tabindex="-1">'+esc(title)+'</h1>'+
    '<p class="muted" style="margin-top:8px;text-wrap:pretty">'+msg+'</p></div>'+
    (waiting?'<div class="live" role="status"><span class="spin"></span><span>En attente de la confirmation de Notch Pay…</span></div>':'')+
    '<div class="status-line"><span class="pill '+st[1]+'">'+esc(st[0])+'</span><span class="muted">Référence <b>'+esc(o.ref)+'</b></span></div>'+
    recapHTML(o)+
    '<div class="optlist">'+
    (failed?'<button class="btn block" data-a="retryPay">'+icon('lock','sm')+'Réessayer le paiement</button><button class="btn soft block" data-a="payCash">Payer à la '+(o.mode==='livraison'?'livraison':'remise')+'</button>':'')+
    (waiting?'<button class="btn soft block" data-a="trackNow">Vérifier maintenant</button>':'')+
    (waNum(sh.phone)?'<a class="btn '+(failed||waiting?'line':'soft')+' block" target="_blank" rel="noopener" href="'+esc(waLink(sh.phone,'Bonjour, je viens de passer la commande '+o.ref+' sur votre boutique.'))+'">'+icon('chat','sm')+'Écrire à la boutique</a>':'')+
    '<button class="btn line block" data-a="copyTrack">'+icon('copy','sm')+'Copier le lien de suivi</button><button class="btn line block" data-a="leaveDone">Retour à la boutique</button></div></div></div>'}
let trackT=0;
function track(){clearTimeout(trackT);const s=S.sent;if(!s||s.admin||S.view!=='done')return;const p=s.o.pay;
  if(!(p.method==='online'&&!p.paid&&p.state==='pending'))return;
  s.polls=(s.polls||0)+1;if(s.polls>80)return;
  trackT=setTimeout(async()=>{await refreshSent(s.polls%3===0);track()},3000)}
async function refreshSent(check){const s=S.sent;if(!s||s.admin||!s.token)return;
  try{const j=await api('GET','/api/orders/'+s.token+(check?'?check=1':''));if(S.sent&&S.sent.token===s.token){S.sent={...S.sent,o:j.order};render(true)}}catch(e){}}
