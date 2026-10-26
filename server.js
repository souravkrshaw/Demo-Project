require('dotenv').config();
const express=require('express'),multer=require('multer'),crypto=require('crypto'),fs=require('fs'),path=require('path');
const {PORT=3000,OWNER_KEY,AGENT_KEY,WA_TOKEN,WA_PHONE_ID,OWNER_WA='',WA_VERIFY_TOKEN,WA_APP_SECRET,WA_TEMPLATE}=process.env;
const DB='orders.json',SF='settings.json';
const load=()=>{try{return JSON.parse(fs.readFileSync(DB))}catch{return[]}},save=d=>fs.writeFileSync(DB,JSON.stringify(d,null,1));
const gs=()=>{try{return JSON.parse(fs.readFileSync(SF))}catch{return{}}};
const pub=({files=[],claimed,...o})=>({...o,nf:files.length});
const app=express(),up=multer({dest:'uploads/',limits:{fileSize:25e6}});
app.use(express.json({limit:'3mb',verify:(q,s,b)=>{q.raw=b}}));app.use(express.static('public'));
const owner=(q,s,n)=>OWNER_KEY&&q.get('x-owner-key')===OWNER_KEY?n():s.sendStatus(401);
const agent=(q,s,n)=>AGENT_KEY&&q.get('x-agent-key')===AGENT_KEY?n():s.sendStatus(401);
const wa=body=>fetch(`https://graph.facebook.com/v21.0/${WA_PHONE_ID}/messages`,{method:'POST',headers:{Authorization:'Bearer '+WA_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({messaging_product:'whatsapp',to:OWNER_WA.replace(/\D/g,''),...body})}).then(r=>r.json()).catch(e=>({error:{message:e.message}}));
async function notify(o){const op=o.opt||{},txt=`New cash order — Token #${o.tok}\n${o.doc}\n${o.pages} pg x ${op.copies||1} · ${op.col=='bw'?'B&W':'Colour'} · ${op.sides} · ${op.size}\nCollect ₹${o.amt}`;
 const r=WA_TEMPLATE
  ?await wa({type:'template',template:{name:WA_TEMPLATE,language:{code:'en'},components:[{type:'body',parameters:[o.tok,o.doc,String(o.amt)].map(text=>({type:'text',text}))},...['CONFIRM','DECLINE'].map((a,i)=>({type:'button',sub_type:'quick_reply',index:String(i),parameters:[{type:'payload',payload:a+':'+o.id}]}))]}})
  :await wa({type:'interactive',interactive:{type:'button',body:{text:txt},action:{buttons:[['CONFIRM','Confirm'],['DECLINE','Decline']].map(([a,t])=>({type:'reply',reply:{id:a+':'+o.id,title:t}}))}}});
 if(r.error)console.error('WhatsApp send failed:',r.error.message)}
function decide(id,a){const d=load(),o=d.find(x=>x.id==id);if(!o||!['Awaiting cash','Pending review'].includes(o.st))return null;o.st=a=='confirm'?'Printing':'Declined';save(d);return o}
// ---- demo / license control (server-side, so the client can't bypass it from the browser)
const LIC='license.json',DEV_KEY=process.env.DEV_KEY,DEMO_DAYS=(process.env.DEMO_DAYS===undefined||process.env.DEMO_DAYS==='')?14:+process.env.DEMO_DAYS,LICENSE_URL=process.env.LICENSE_URL;
const rl=()=>{try{return JSON.parse(fs.readFileSync(LIC))}catch{return null}};
const PUB=fs.readFileSync(path.join(__dirname,'license-public.pem'));
function check(k){try{const [p,g]=String(k).trim().replace(/^SQP-/,'').split('.');if(!crypto.verify(null,Buffer.from(p),PUB,Buffer.from(g,'base64url')))return null;const d=JSON.parse(Buffer.from(p,'base64url'));return d.exp&&Date.now()>d.exp?null:d}catch{return null}}
if(DEMO_DAYS&&!rl())fs.writeFileSync(LIC,JSON.stringify({mode:'demo',start:Date.now(),expires:Date.now()+DEMO_DAYS*864e5,locked:false}));
let remote=null,remoteOk=Date.now();
async function poll(){if(!LICENSE_URL)return;try{remote=await(await fetch(LICENSE_URL,{cache:'no-store'})).json();remoteOk=Date.now()}catch{}}
poll();setInterval(poll,36e5);
// ---- DukaanPass subscription link (optional; active only when SUB_* env vars are set)
// Reads the shop owner's plan from the subscription app's Supabase, using the owner's own login (RLS: own rows only).
const {SUB_SUPABASE_URL,SUB_SUPABASE_KEY,SUB_EMAIL,SUB_PASSWORD,SUB_SITE_URL}=process.env,SUB_ON=!!(SUB_SUPABASE_URL&&SUB_SUPABASE_KEY&&SUB_EMAIL&&SUB_PASSWORD);
let sub=null,subOk=0,subErr='';
async function subPoll(){if(!SUB_ON)return;try{const U=SUB_SUPABASE_URL.replace(/\/+$/,''),K={apikey:SUB_SUPABASE_KEY,'Content-Type':'application/json'};
 const a=await fetch(U+'/auth/v1/token?grant_type=password',{method:'POST',headers:K,body:JSON.stringify({email:SUB_EMAIL,password:SUB_PASSWORD})}).then(r=>r.json());
 if(!a.access_token)throw new Error(a.error_description||a.msg||'login failed');
 const rows=await fetch(U+'/rest/v1/subscriptions?select=plan,status,starts_at,expires_at&user_id=eq.'+a.user.id+'&status=eq.active',{headers:{...K,Authorization:'Bearer '+a.access_token}}).then(r=>r.json());
 if(!Array.isArray(rows))throw new Error(rows.message||'bad response');
 sub=rows;subOk=Date.now();subErr=''}catch(e){subErr=e.message;console.error('Subscription check failed:',e.message)}}
subPoll();setInterval(subPoll,6e5);
function subState(){const now=Date.now(),live=(sub||[]).filter(x=>+new Date(x.starts_at)<=now&&+new Date(x.expires_at)>now).sort((a,b)=>+new Date(b.expires_at)-+new Date(a.expires_at))[0];
 if(!live)return null;const until=Math.max(...(sub||[]).filter(x=>+new Date(x.expires_at)>now).map(x=>+new Date(x.expires_at)));
 return{plan:live.plan,days:Math.ceil((until-now)/864e5)}}
function lic(){const L=rl(),r=remote||{};
  if(SUB_ON){const k=L&&L.key&&check(L.key);if(k&&!(r.revoked||[]).includes(k.id))return{ok:true,full:true,licensee:k.name};
  if(L&&L.locked)return{ok:false,why:'This software has been locked by the developer'};
  if(!subOk)return{ok:false,why:subErr?'Could not verify subscription — check SUB_* settings':'Checking subscription…'};
  if(Date.now()-subOk>72*36e5)return{ok:false,why:'Subscription could not be verified'};
  const x=subState();if(!x)return{ok:false,why:'Subscription not active — renew at '+(SUB_SITE_URL||'/subscription.html')+' to continue'};
  return x.plan=='premium'?{ok:true,full:true,days:x.days}:{ok:true,days:x.days}}
 if(!L&&!LICENSE_URL)return{ok:true,full:true};
 if(LICENSE_URL&&Date.now()-remoteOk>72*36e5)return{ok:false,why:'License could not be verified'};
 if(r.active===false||(L&&L.locked))return{ok:false,why:'This software has been locked by the developer'};
 if(L&&L.key){const d=check(L.key);if(d&&!(r.revoked||[]).includes(d.id))return{ok:true,full:true,licensee:d.name}}
 const mode=r.mode||(L&&L.mode)||'demo',exp=r.expires?+new Date(r.expires):(L?L.expires:0);
 if(mode=='full')return{ok:true,full:true};
 if(exp&&Date.now()>exp)return{ok:false,why:'Trial ended — enter your license key to continue'};
 return{ok:true,days:exp?Math.ceil((exp-Date.now())/864e5):null}}
app.use(['/api','/webhook'],(q,s,n)=>{const l=lic();if(l.ok||(q.baseUrl=='/api'&&q.path.startsWith('/license')))return n();s.status(402).json({locked:true,why:l.why})});
app.get('/api/license',(q,s)=>s.json(lic()));
// ---- built-in subscription page (public/subscription.html) support; kept outside /api so it works while locked
const SUB_DEF={url:'https://c--63cc4909-f638-4119-907e-65f8540ab381-prod.lovable.cloud',key:'sb_publishable_MjFkjcE_c_Vje9GX0i9OZw_32jnY6B5'};
app.get('/subscription',(q,s)=>s.redirect('/subscription.html'));
app.get('/sub-config.json',(q,s)=>s.json({url:SUB_SUPABASE_URL||SUB_DEF.url,key:SUB_SUPABASE_KEY||SUB_DEF.key}));
let subAsk=0;app.post('/sub-refresh',async(q,s)=>{if(SUB_ON&&Date.now()-subAsk>2e4){subAsk=Date.now();await subPoll()}s.json(lic())});
app.post('/api/license/activate',owner,(q,s)=>{const k=String(q.body.key||'').trim();if(!check(k))return s.status(400).json({ok:false,why:'Invalid or expired license key'});wl({key:k,locked:false});s.json(lic())});
const dev=(q,s,n)=>DEV_KEY&&q.get('x-dev-key')===DEV_KEY?n():s.sendStatus(401);
const wl=p=>fs.writeFileSync(LIC,JSON.stringify({...(rl()||{mode:'demo',start:Date.now(),expires:Date.now()+14*864e5}),...p}));
app.get('/admin/status',dev,(q,s)=>s.json({license:rl(),state:lic()}));
app.post('/admin/lock',dev,(q,s)=>{wl({locked:true});s.json(lic())});
app.post('/admin/unlock',dev,(q,s)=>{wl({locked:false});s.json(lic())});
app.post('/admin/extend/:days',dev,(q,s)=>{wl({locked:false,mode:'demo',expires:Math.max(Date.now(),(rl()||{}).expires||0)+(+q.params.days||0)*864e5});s.json(lic())});
app.post('/admin/activate',dev,(q,s)=>{wl({mode:'full',locked:false});s.json(lic())});
// ---- customer + owner API
app.get('/api/settings',(q,s)=>s.json(gs()));
app.put('/api/settings',owner,(q,s)=>{fs.writeFileSync(SF,JSON.stringify(q.body));s.sendStatus(200)});
app.post('/api/orders',up.array('files'),(q,s)=>{if(!online())return s.status(503).json({why:'Printer offline'});const b=q.body,d=load();if(!['Cash','UPI'].includes(b.pay))return s.sendStatus(400);
 const n=Math.max(2400,...d.map(o=>+o.id.slice(4)))+1;
 const o={id:'APX-'+n,tok:String(1000+crypto.randomInt(9000)),doc:b.doc,pages:+b.pages,amt:+b.amt,pay:b.pay,opt:JSON.parse(b.opt||'{}'),files:(q.files||[]).map(f=>({path:f.path,name:f.originalname})),st:b.pay=='Cash'?'Awaiting cash':'Pending review',p:0,t:'Today, '+new Date().toTimeString().slice(0,5)};
 d.unshift(o);save(d);if(o.pay=='Cash')notify(o);s.json(pub(o))});
app.get('/api/orders',owner,(q,s)=>s.json(load().map(pub)));
app.post('/api/orders/:id/:a(confirm|decline)',owner,(q,s)=>{const o=decide(q.params.id,q.params.a);o?s.json(pub(o)):s.sendStatus(409)});
const del=(q,s)=>{const id=q.params.id,d=load(),gone=d.filter(o=>!id||o.id==id);gone.forEach(o=>o.files.forEach(f=>fs.rm(f.path,{force:true},()=>{})));save(id?d.filter(o=>o.id!=id):[]);s.sendStatus(200)};
app.delete('/api/orders/:id',owner,del);app.delete('/api/orders',owner,del);
// ---- WhatsApp webhook: owner taps Confirm/Decline (or types "CONFIRM 1234")
app.get('/webhook',(q,s)=>q.query['hub.verify_token']==WA_VERIFY_TOKEN?s.send(q.query['hub.challenge']):s.sendStatus(403));
app.post('/webhook',(q,s)=>{const sig=q.get('x-hub-signature-256')||'',ok='sha256='+crypto.createHmac('sha256',WA_APP_SECRET||'').update(q.raw||'').digest('hex');
 if(!WA_APP_SECRET||sig.length!=ok.length||!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(ok)))return s.sendStatus(401);
 s.sendStatus(200);
 const m=q.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];if(!m||m.from!==OWNER_WA.replace(/\D/g,''))return;
 let a,id;const raw=m.interactive?.button_reply?.id||m.button?.payload;
 if(raw){const x=raw.split(':');a=x[0];id=x[1]}
 else if(m.text){const x=m.text.body.trim().match(/^(confirm|decline)\s+(\d{4})$/i);if(x){a=x[1].toUpperCase();id=(load().find(o=>o.tok==x[2])||{}).id}}
 if(!a||!id)return;const o=decide(id,a=='CONFIRM'?'confirm':'decline');
 wa({type:'text',text:{body:o?`Order ${o.id} (#${o.tok}) ${o.st=='Printing'?'confirmed — printing now':'declined'}.`:'That order was already handled, or was not found.'}})});
// ---- printer detection (reported by agent.js running on the counter PC)
let AG={last:0,printers:[]},PSEL=(()=>{try{return JSON.parse(fs.readFileSync('printers.json'))}catch{return{}}})(),testQ=false;
const online=()=>Date.now()-AG.last<20000&&AG.printers.some(p=>p.ok);
app.get('/api/printer/status',(q,s)=>s.json({connected:online()}));
app.get('/api/printers',owner,(q,s)=>s.json({connected:online(),printers:AG.printers,sel:PSEL}));
app.put('/api/printers',owner,(q,s)=>{PSEL={bw:q.body.bw||'',color:q.body.color||''};fs.writeFileSync('printers.json',JSON.stringify(PSEL));s.sendStatus(200)});
app.post('/api/printers/test',owner,(q,s)=>{testQ=true;s.sendStatus(200)});
app.post('/api/agent/heartbeat',agent,(q,s)=>{AG={last:Date.now(),printers:(q.body.printers||[]).slice(0,20)};const t=testQ;testQ=false;s.json({sel:PSEL,test:t})});
// ---- print agent endpoints
app.get('/api/agent/next',agent,(q,s)=>{const d=load(),o=d.find(x=>x.st=='Printing'&&!x.claimed);if(!o)return s.json(null);o.claimed=true;o.p=50;save(d);s.json({id:o.id,opt:o.opt,files:o.files.map((f,i)=>({i,name:f.name}))})});
app.get('/api/agent/file/:id/:i',agent,(q,s)=>{const f=(load().find(o=>o.id==q.params.id)||{files:[]}).files[+q.params.i];f?s.download(path.resolve(f.path),f.name):s.sendStatus(404)});
app.post('/api/agent/done/:id',agent,(q,s)=>{const d=load(),o=d.find(x=>x.id==q.params.id);if(o){o.st='Completed';o.p=100;save(d)}s.sendStatus(200)});
app.listen(PORT,()=>console.log('Smart QR Print on :'+PORT));
