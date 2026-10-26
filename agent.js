// Run on the counter PC that has the printer attached (Windows, macOS or Linux).
// It (1) reports which printers are connected, (2) prints approved orders, (3) prints test pages.
require('dotenv').config();
const {execFile}=require('child_process'),fs=require('fs'),os=require('os'),path=require('path');
const B=process.env.SERVER_URL,H={'x-agent-key':process.env.AGENT_KEY,'Content-Type':'application/json'},win=process.platform=='win32';
let SEL={};
const sh=(c,a)=>new Promise((ok,no)=>execFile(c,a,(e,o)=>e?no(e):ok(o)));
const VIRTUAL=/pdf|xps|onenote|fax|virtual/i;
async function listPrinters(){try{
 if(win){const a=[].concat(JSON.parse(await sh('powershell',['-NoProfile','-Command','Get-Printer | Select-Object Name,PrinterStatus,WorkOffline | ConvertTo-Json'])));
  return a.filter(p=>!VIRTUAL.test(p.Name)).map(p=>({name:p.Name,ok:!p.WorkOffline&&!/offline|^7$/i.test(String(p.PrinterStatus))}))}
 return(await sh('lpstat',['-p'])).split('\n').filter(l=>l.startsWith('printer ')).map(l=>({name:l.split(' ')[1],ok:!/disabled|offline/i.test(l)}))}catch{return[]}}
const pick=o=>(o.col=='bw'?SEL.bw:SEL.color)||SEL.bw||SEL.color||undefined;
async function printFile(p,o){const pr=pick(o);
 if(win)return require('pdf-to-printer').print(p,{printer:pr,copies:o.copies||1,monochrome:o.col=='bw',side:o.sides=='double'?'duplexlong':'simplex',paperSize:o.size||'A4',orientation:o.ori=='landscape'?'landscape':'portrait'});
 const a=[...(pr?['-d',pr]:[]),'-n',String(o.copies||1),'-o','media='+(o.size||'A4'),'-o','sides='+(o.sides=='double'?'two-sided-long-edge':'one-sided'),'-o','print-color-mode='+(o.col=='bw'?'monochrome':'color')];
 if(o.ori=='landscape')a.push('-o','orientation-requested=4');return sh('lp',[...a,p])}
async function testPrint(){const pr=SEL.bw||SEL.color,msg='Smart QR Print - test page OK';
 if(win)return sh('powershell',['-NoProfile','-Command',`"${msg}" | Out-Printer ${pr?`-Name '${pr.replace(/'/g,"''")}'`:''}`]);
 const t=path.join(os.tmpdir(),'sqp-test.txt');fs.writeFileSync(t,msg+'\n');return sh('lp',[...(pr?['-d',pr]:[]),t])}
async function job(j){for(const f of j.files){
 const r=await fetch(`${B}/api/agent/file/${j.id}/${f.i}`,{headers:H}),p=path.join(os.tmpdir(),`${j.id}-${f.i}-${f.name}`);
 fs.writeFileSync(p,Buffer.from(await r.arrayBuffer()));await printFile(p,j.opt||{});console.log('printed',j.id,f.name)}
 await fetch(`${B}/api/agent/done/${j.id}`,{method:'POST',headers:H})}
async function beat(){try{const r=await(await fetch(B+'/api/agent/heartbeat',{method:'POST',headers:H,body:JSON.stringify({printers:await listPrinters()})})).json();SEL=r.sel||{};if(r.test)await testPrint()}catch(e){console.error('heartbeat:',e.message)}}
(async function loop(){await beat();try{const j=await(await fetch(B+'/api/agent/next',{headers:H})).json();if(j)await job(j)}catch(e){console.error(e.message)}setTimeout(loop,5000)})();
