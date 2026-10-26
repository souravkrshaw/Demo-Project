// Connects the UI to server.js (loaded after the main page script).
window.API=true;
const OK=()=>localStorage.getItem('ownerKey')||'',HJ=()=>({'Content-Type':'application/json','x-owner-key':OK()});
const _af=addFiles;addFiles=async l=>{window._fl=[...(window._fl||[]),...l];return _af(l)};
newOrder=async function(pay){const c=calc(),fd=new FormData(),names=files.map(f=>f.name);
 fd.append('pay',pay);fd.append('amt',c.total);fd.append('pages',c.pg);fd.append('opt',JSON.stringify({...O}));fd.append('doc',names.join(', '));
 for(const f of files)if(!f.img)fd.append('files',f.file);
 if(files.some(f=>f.img)){const l=O.ori=='landscape',cs=await compose(l?1754:1240,l?1240:1754,O.col),{jsPDF}=window.jspdf,pdf=new jsPDF({orientation:l?'l':'p',unit:'mm',format:'a4'});cs.forEach((c,i)=>{if(i)pdf.addPage();pdf.addImage(c.toDataURL('image/jpeg',.92),'JPEG',0,0,l?297:210,l?210:297)});fd.append('files',pdf.output('blob'),'photos.pdf')}
 try{const r=await fetch('/api/orders',{method:'POST',body:fd});if(r.status==503){toast('Shop printer is offline — try again shortly');return}if(!r.ok)throw 0;const o=await r.json();
  files=[];window._fl=[];O.copies=1;E('modal').innerHTML='';draw();
  if(pay=='Cash')E('modal').innerHTML=`<div class="bd"><div class="md"><button class="ib x" id="mx">✕</button><div class="mono" style="color:var(--mut)">Cash at counter</div><h2>Token #${o.tok}</h2><p>The owner has been notified on WhatsApp. Show this token at the counter — printing starts once it’s confirmed.</p></div></div>`,E('mx').onclick=()=>E('modal').innerHTML='';
  else toast('Order '+o.id+' sent for shop approval')}catch(e){toast('Could not reach the server')}};
async function decide(id,a){const r=await fetch(`/api/orders/${id}/${a}`,{method:'POST',headers:HJ()});toast(r.ok?(a=='confirm'?'Confirmed — printing now':'Order declined'):'Already handled or not authorised');sync()}
confirmOrder=id=>decide(id,'confirm');
const apiDel=id=>fetch('/api/orders/'+id,{method:'DELETE',headers:HJ()});
let last='';
async function cfg(){try{const c=await(await fetch('/api/settings')).json();if(c.pr){S.pr=c.pr;S.set={...S.set,upi:c.upi||'',qr:c.qr||''};last=JSON.stringify(c);if(V=='order')draw()}}catch(e){}}
async function push(){const c={pr:S.pr,upi:S.set.upi,qr:S.set.qr},j=JSON.stringify(c);if(j==last)return;const r=await fetch('/api/settings',{method:'PUT',headers:HJ(),body:j});if(r.ok)last=j}
async function sync(){if(!unlocked)return cfg();let k=OK();if(!k){k=prompt('Owner key (OWNER_KEY from your .env)')||'';localStorage.setItem('ownerKey',k)}
 try{const r=await fetch('/api/orders',{headers:HJ()});if(r.status==401){localStorage.removeItem('ownerKey');return}S.orders=await r.json();await push();
  if((V=='dash'||V=='queue')&&document.activeElement.id!='sq')draw()}catch(e){}}
cfg();setInterval(sync,3000);
// ---- demo lock screen + "days left" badge
function lockUI(l){let o=E('lockov'),b=E('demob');
 if(l.ok){if(o)o.remove();if(l.days!=null&&!l.full){if(!b){b=document.createElement('div');b.id='demob';b.style.cssText='position:fixed;left:16px;bottom:16px;background:#e8a23a;color:#3a2800;padding:8px 14px;font:600 13px Space Grotesk,sans-serif;z-index:55';document.body.appendChild(b)}b.textContent='DEMO · '+l.days+' day'+(l.days==1?'':'s')+' left'}else if(b)b.remove();return}
 if(!o){o=document.createElement('div');o.id='lockov';o.style.cssText='position:fixed;inset:0;z-index:99;background:#0c1426;color:#fff;display:grid;place-items:center;text-align:center;padding:24px;font-family:Space Grotesk,sans-serif';document.body.appendChild(o)}
 o.innerHTML=`<div><div style="font-size:48px">🔒</div><h1 style="font-size:34px;margin:12px 0">${l.why}</h1><p style="color:#8b97b3">Please contact your developer to continue with the full version.</p></div>`}
async function chk(){try{lockUI(await(await fetch('/api/license')).json())}catch(e){}}
chk();setInterval(chk,60000);

// ---- printer status polling + settings hooks
async function pst(){const first=!window.PRN;try{window.PSTAT=await(await fetch('/api/printer/status')).json()}catch(e){}
 if(unlocked&&OK()){try{const r=await fetch('/api/printers',{headers:HJ()});if(r.ok)window.PRN=await r.json()}catch(e){}}
 const c=window.PSTAT&&window.PSTAT.connected,ch=window._pc!==c;window._pc=c;if(ch||(V=='settings'&&first&&window.PRN))draw()}
pst();setInterval(pst,5000);
window.bindPrn=()=>{const g=E('psv');if(!g)return;g.onclick=async()=>{const r=await fetch('/api/printers',{method:'PUT',headers:HJ(),body:JSON.stringify({bw:E('pbw').value,color:E('pco').value})});toast(r.ok?'Printers saved':'Not authorised')};E('pts').onclick=async()=>{const r=await fetch('/api/printers/test',{method:'POST',headers:HJ()});toast(r.ok?'Test page sent to printer':'Not authorised')}};
// ---- license key entry (lock screen + trial badge)
function actKey(){let k=OK();if(!k){k=prompt('Owner key (OWNER_KEY from your .env)')||'';localStorage.setItem('ownerKey',k)}
 return fetch('/api/license/activate',{method:'POST',headers:HJ(),body:JSON.stringify({key:(E('lk2')||{}).value||''})}).then(r=>{if(r.ok){const m=E('lockov');if(m)m.remove();E('modal').innerHTML='';chk();toast('License activated')}else toast(r.status==401?'Wrong owner key':'Invalid or expired license key')})}
const keyBox='<input id="lk2" placeholder="Paste license key" style="width:min(520px,88vw);padding:14px;margin-top:18px;color:#0f172a;border:1px solid #cbd5e1"><br><button class="btn" style="max-width:320px;margin-top:10px" onclick="actKey()">Activate license</button>';
function lockUI(l){let o=E('lockov'),b=E('demob');
 if(l.ok){if(o)o.remove();if(l.days!=null&&!l.full){if(!b){b=document.createElement('button');b.id='demob';b.style.cssText='position:fixed;left:16px;bottom:16px;background:#e8a23a;color:#3a2800;padding:8px 14px;font:600 13px Space Grotesk,sans-serif;z-index:55;border:0;cursor:pointer';b.onclick=()=>{E('modal').innerHTML='<div class="bd"><div class="md"><button class="ib x" onclick="E(\'modal\').innerHTML=\'\'">✕</button><div class="mono" style="color:var(--mut)">License</div><h2>Enter license key</h2>'+keyBox+'</div></div>'};document.body.appendChild(b)}b.textContent='TRIAL · '+l.days+' day'+(l.days==1?'':'s')+' left · enter license key'}else if(b)b.remove();return}
 if(!o){o=document.createElement('div');o.id='lockov';o.style.cssText='position:fixed;inset:0;z-index:99;background:#0c1426;color:#fff;display:grid;place-items:center;text-align:center;padding:24px;font-family:Space Grotesk,sans-serif';o.innerHTML='<div><div style="font-size:48px">🔒</div><h1 id="lkw" style="font-size:34px;margin:12px 0"></h1><p style="color:#8b97b3">Enter your license key to unlock, or contact your developer.</p>'+keyBox+'</div>';document.body.appendChild(o)}
 E('lkw').textContent=l.why;if(/ubscription/.test(l.why)&&!E('lksub')){const a=document.createElement('a');a.id='lksub';a.href='subscription.html';a.textContent='Open Subscription page →';a.style.cssText='display:inline-block;margin-top:22px;color:#e8a23a;font-weight:600;font-size:18px';E('lkw').parentNode.appendChild(a)}}
