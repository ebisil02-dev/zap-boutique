/* =========================================================
   Cœur partagé : utilisé tel quel par le serveur (Worker) et par la boutique (navigateur).
   Règle d’or : aucune dépendance à l’heure ou au fuseau de l’appareil.
   Toutes les dates « boutique » sont l’heure du Cameroun (UTC+1) encodée comme si c’était de l’UTC :
   on lit donc toujours avec les méthodes getUTC… et on passe l’heure en argument (shopNow()).
   ========================================================= */
export const $=(s,r=document)=>r.querySelector(s);
export const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const NB=' ';
export const fmtN=n=>String(Math.round(+n||0)).replace(/\B(?=(\d{3})+(?!\d))/g,NB);
export const money=n=>fmtN(n)+NB+'FCFA';
export const num=v=>{const n=parseInt(String(v==null?'':v).replace(/[^\d-]/g,''),10);return isNaN(n)?0:n};
export const pad2=n=>String(n).padStart(2,'0');
export const sum=(a,f)=>a.reduce((t,x)=>t+(+f(x)||0),0);
export const uid=p=>p+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
export const digits=p=>String(p||'').replace(/\D/g,'');
export const norm=s=>String(s||'').replace(/[\s  ]+/g,' ').trim();
export const icon=(n,c='')=>'<svg class="i '+c+'" aria-hidden="true"><use href="#i-'+n+'"/></svg>';
/* photos : soit une image intégrée (cas du formulaire vendeur), soit l’adresse d’une photo du serveur */
export const safeImg=s=>(typeof s==='string'&&(/^data:image\/(webp|png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/.test(s)||/^\/api\/img\/[A-Za-z0-9_-]{1,40}(\?v=\d{1,15})?$/.test(s)))?s:'';
export const initials=n=>{const w=String(n||'?').trim().split(/\s+/).filter(Boolean);return ((w[0]||'?')[0]+((w.length>1&&w[1].length>1)?w[1][0]:'')).toUpperCase()};
export const cap=s=>String(s||'').charAt(0).toUpperCase()+String(s||'').slice(1);
export const first=n=>{const w=String(n||'').trim().split(/\s+/).filter(Boolean);return w.length?w[0]:''};

/* ---------- téléphone ---------- */
export function waNum(p){let d=digits(p);if(d.startsWith('00'))d=d.slice(2);if(d.length===9&&/^[26]/.test(d))d='237'+d;return d.length>=10?d:''}
export const waLink=(p,t)=>{const n=waNum(p);return n?'https://wa.me/'+n+'?text='+encodeURIComponent(t||''):''};
export const validPhone=p=>{const d=digits(p);return (d.length===9&&/^[26]/.test(d))||(d.startsWith('237')&&d.length===12)||(d.length>=10&&d.length<=15&&!d.startsWith('237'))};
export function prettyPhone(p){const d=waNum(p);if(!d)return String(p||'').trim();
  if(d.startsWith('237')&&d.length===12){const l=d.slice(3);return '+237 '+l[0]+' '+l.slice(1,3)+' '+l.slice(3,5)+' '+l.slice(5,7)+' '+l.slice(7,9)}
  return '+'+d}

/* ---------- horloge et dates (heure du Cameroun, indépendante de l’appareil) ---------- */
export const SHOP_TZ_OFFSET_MS=3600e3;
let skew=0;
/* le navigateur règle son horloge sur celle du serveur (téléphone mal réglé, client à l’étranger) */
export const setClock=serverMs=>{skew=(+serverMs||Date.now())-Date.now()};
export const shopNow=()=>Date.now()+skew+SHOP_TZ_OFFSET_MS;
/* un instant réel (ms) vu à l’heure du Cameroun */
export const shopDate=ms=>new Date(ms+SHOP_TZ_OFFSET_MS);
export const iso=d=>d.getUTCFullYear()+'-'+pad2(d.getUTCMonth()+1)+'-'+pad2(d.getUTCDate());
export const isISO=s=>/^\d{4}-\d{2}-\d{2}$/.test(s||'');
export const fromISO=s=>{const a=String(s).split('-').map(Number);return new Date(Date.UTC(a[0],a[1]-1,a[2]))};
export const isTM=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s||'');
export const mins=s=>{const a=s.split(':').map(Number);return a[0]*60+a[1]};
export const fmtT=s=>{const a=s.split(':').map(Number);return a[0]+NB+'h'+(a[1]?NB+pad2(a[1]):'')};
export const slotLabel=(a,b)=>fmtT(a)+' – '+fmtT(b);
const dtf=o=>new Intl.DateTimeFormat('fr-FR',{...o,timeZone:'UTC'});
export const DF_LONG=dtf({weekday:'long',day:'numeric',month:'long'});
export const DF_WD=dtf({weekday:'long'});
export const DF_WDS=dtf({weekday:'short'});
export const DF_MON=dtf({month:'short'});
export const DF_DM=dtf({day:'numeric',month:'short'});
export const DF_HM=dtf({hour:'2-digit',minute:'2-digit'});
export const addDays=(d,n)=>new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate()+n));
export const shopToday=()=>iso(new Date(shopNow()));
export function dayName(key){const t=shopToday();if(key===t)return 'aujourd’hui';if(key===iso(addDays(new Date(shopNow()),1)))return 'demain';return DF_LONG.format(fromISO(key))}
export function dayShort(key){const t=shopToday();if(key===t)return 'Aujourd’hui';if(key===iso(addDays(new Date(shopNow()),1)))return 'Demain';return cap(DF_WD.format(fromISO(key))+' '+DF_DM.format(fromISO(key)))}
export const WEEK_DISPLAY=[1,2,3,4,5,6,0];
export const WEEK_NAMES=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
export const PAYN={online:'Paiement en ligne',momo:'MTN MoMo',om:'Orange Money',cash:'Espèces'};
/* libellés des deux choix qui ne sont pas un quartier de la liste */
export const baseLabel=sh=>'Autre quartier'+(sh.city?' de '+sh.city:'');
export const otherLabel=sh=>sh.base.on?('Hors '+(sh.city?'de '+sh.city:'zone')):'Autre quartier';

/* ---------- réglages de la boutique (forme canonique) ---------- */
export const clampInt=(v,a,b,d)=>{const n=parseInt(v,10);return isNaN(n)?d:Math.min(b,Math.max(a,n))};
export const str=(v,d,max)=>(v==null?d:String(v)).slice(0,max);
const DEF_WEEK=i=>({on:i>=1&&i<=6,from:'08:00',to:'18:00'});
const DEF_SLOTS=[{from:'09:00',to:'12:00'},{from:'12:00',to:'15:00'},{from:'15:00',to:'18:00'}];
export function canonShop(s){
  s=s||{};const pay=s.pay||{};
  const w=Array.from({length:7},(_,i)=>{const x=(s.week&&s.week[i])||DEF_WEEK(i);
    return {on:!!x.on,from:isTM(x.from)?x.from:'08:00',to:isTM(x.to)?x.to:'18:00'}});
  const slotsIn=Array.isArray(s.slots)?s.slots:DEF_SLOTS;
  const seen={};const slots=slotsIn.filter(x=>x&&isTM(x.from)&&isTM(x.to)&&mins(x.from)<mins(x.to)).map(x=>({from:x.from,to:x.to}))
    .filter(x=>{const k=x.from+x.to;if(seen[k])return false;seen[k]=1;return true}).sort((a,b)=>mins(a.from)-mins(b.from)||mins(a.to)-mins(b.to));
  const zid=new Set();
  const zones=(Array.isArray(s.zones)?s.zones:[]).map(z=>{let id=str(z&&z.id,'',24).replace(/[^A-Za-z0-9_-]/g,'');if(!id||id==='base'||id==='autre'||zid.has(id))id=uid('z').slice(0,24);zid.add(id);
    return {id,name:str(z&&z.name,'',40).trim(),fee:Math.max(0,num(z&&z.fee))}}).filter(z=>z.name);
  const mp=(k)=>({on:!!(pay[k]?pay[k].on:k!=='cash'?false:true),num:str(pay[k]&&pay[k].num,'',24),name:str(pay[k]&&pay[k].name,'',40)});
  return {name:str(s.name,'Ma boutique',60).trim()||'Ma boutique',about:str(s.about,'',300),phone:str(s.phone,'',24),city:str(s.city,'',40),
    week:w,closed:(Array.isArray(s.closed)?s.closed:[]).filter(isISO).sort().filter((x,i,a)=>a.indexOf(x)===i),
    slots,lead:clampInt(s.lead,0,72,2),ahead:clampInt(s.ahead,1,30,6),
    delivery:s.delivery!==false,pickup:s.pickup!==false,pickupAddr:str(s.pickupAddr,'',160),
    zones,zoneOther:s.zoneOther!==false,base:{on:!!(s.base&&s.base.on),fee:Math.max(0,num(s.base&&s.base.fee))},freeFrom:Math.max(0,num(s.freeFrom)),minOrder:Math.max(0,num(s.minOrder)),
    pay:{momo:mp('momo'),om:mp('om'),cash:{on:pay.cash?!!pay.cash.on:true}},payNote:str(s.payNote,'',200),
    online:{on:!!(s.online&&s.online.on)}}}
export function canonProducts(list){
  return (list||[]).filter(p=>p&&p.on!==false&&String(p.name||'').trim()).map(p=>({id:String(p.id),name:str(p.name,'',80).trim(),price:Math.max(0,num(p.price)),
    desc:str(p.desc,'',200),img:safeImg(p.img),stock:(p.stock===''||p.stock==null||isNaN(+p.stock))?null:Math.max(0,Math.floor(+p.stock))}))}

/* ---------- ouverture, jours et créneaux ---------- */
export function openStatus(shop,nowMs){
  const n=new Date(nowMs),nm=n.getUTCHours()*60+n.getUTCMinutes();
  for(let i=0;i<=14;i++){
    const d=addDays(n,i),w=shop.week[d.getUTCDay()];
    if(!w.on||shop.closed.includes(iso(d)))continue;
    const a=mins(w.from),b=mins(w.to);
    if(i===0&&nm>=a&&nm<b)return {open:true,text:'Ouvert jusqu’à '+fmtT(w.to)};
    if(i===0&&nm>=b)continue;
    return {open:false,text:'Fermé · rouvre '+(i===0?'aujourd’hui':i===1?'demain':DF_WD.format(d))+' à '+fmtT(w.from)}}
  return {open:false,text:'Fermé pour le moment'}}
export function daysAvail(shop,nowMs){
  const out=[],base=new Date(nowMs);
  for(let i=0;i<=shop.ahead;i++){
    const d=addDays(base,i),key=iso(d),w=shop.week[d.getUTCDay()];let slots=[];
    if(w.on&&!shop.closed.includes(key)){
      slots=shop.slots.filter(s=>mins(s.from)>=mins(w.from)&&mins(s.to)<=mins(w.to))
        .filter(s=>d.getTime()+mins(s.from)*6e4>=nowMs+shop.lead*36e5)}
    out.push({date:key,slots})}
  return out}
export function firstSlot(shop,nowMs){for(const d of daysAvail(shop,nowMs)){if(d.slots.length)return {date:d.date,slot:d.slots[0].from+'-'+d.slots[0].to}}return null}

/* ---------- quartiers, moyens de paiement ---------- */
/* choix de quartier offerts au client : tarif standard, quartiers à tarif différent, hors zone (frais à confirmer) */
export const zoneOptions=sh=>[...(sh.base.on?['base']:[]),...sh.zones.map(z=>z.id),...(sh.zoneOther?['autre']:[])];
export const needZone=sh=>zoneOptions(sh).length>0;
/* « online » n’est proposé que si le vendeur l’a activé ET que le serveur a une clé de paiement (déjà reflété dans sh.online.on côté public) */
export const payMethods=(sh,allowOnline=true)=>['online','momo','om','cash'].filter(k=>k==='online'?(allowOnline&&sh.online.on):sh.pay[k].on);
export const onlineBlocked=(mode,zone)=>mode==='livraison'&&zone==='autre';

/* ---------- panier, prix, commande ---------- */
export function priceCart(shop,items,mode,zoneId){
  const sub=sum(items,i=>i.price*i.qty);let fee=0,feeNote='',zone=null;
  if(mode==='livraison'){
    if(zoneId==='autre'){feeNote='À confirmer'}
    else{zone=zoneId==='base'&&shop.base.on?{id:'base',name:baseLabel(shop),fee:shop.base.fee}:shop.zones.find(z=>z.id===zoneId)||null;fee=zone?zone.fee:0;
      if(shop.freeFrom>0&&sub>=shop.freeFrom&&fee>0){fee=0;feeNote='Offerte'}}}
  return {sub,fee,feeNote,total:sub+fee,zone}}
export const makeRef=()=>{const A='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let r='';for(let i=0;i<4;i++)r+=A[Math.floor(Math.random()*A.length)];return r};
export function buildOrder(shop,items,c){
  const pr=priceCart(shop,items,c.mode,c.zone),sl=String(c.slot).split('-');
  return {ref:c.ref,mode:c.mode,zoneId:c.mode==='livraison'?(c.zone||''):'',zoneName:c.mode==='livraison'?(c.zone==='autre'?otherLabel(shop):(pr.zone?pr.zone.name:'')):'',
    address:c.mode==='livraison'?c.addr.trim():'',date:c.date,from:sl[0],to:sl[1],name:c.name.trim(),phone:c.phone.trim(),
    items:items.map(i=>({pid:i.id,name:i.name,price:i.price,qty:i.qty})),subtotal:pr.sub,fee:pr.fee,feeNote:pr.feeNote,total:pr.total,
    pay:{method:c.pay,paid:false,claimed:c.pay!=='cash'&&c.pay!=='online'&&!!c.paid,txn:c.pay!=='cash'&&c.pay!=='online'&&c.paid?String(c.txn||'').trim():''}}}

/* message WhatsApp (facultatif) : résumé de commande que le client peut envoyer lui-même au vendeur */
export function orderMessage(shop,o){
  const L=['*Commande '+shop.name+'*'];
  o.items.forEach(i=>L.push(i.qty+' × '+i.name+' · '+money(i.price*i.qty)));
  L.push('Sous-total : '+money(o.subtotal));
  if(o.mode==='livraison')L.push('Frais de livraison'+(o.zoneName?' ('+o.zoneName+')':'')+' : '+(o.feeNote==='À confirmer'?'à confirmer':o.fee?money(o.fee):'offerts'));
  L.push('*Total : '+money(o.total)+'*','');
  L.push((o.mode==='livraison'?'Livraison prévue':'Retrait prévu')+' : '+DF_LONG.format(fromISO(o.date))+', '+slotLabel(o.from,o.to));
  if(o.mode==='livraison')L.push('Lieu : '+o.address);
  L.push('Client : '+o.name+' · '+prettyPhone(o.phone));
  const p=o.pay;
  L.push('Paiement : '+PAYN[p.method]+(p.method==='cash'?' à la '+(o.mode==='livraison'?'livraison':'remise'):p.method==='online'?(p.paid?', payé':', en cours'):(p.claimed||p.paid)?', déjà envoyé'+(p.txn?' (réf. '+p.txn+')':''):', à régler'));
  L.push('','Réf. '+o.ref);
  return L.join('\n')}
