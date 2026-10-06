// Manual hardware-test UI. Uses the existing recorder; never changes game rules or scheduling.
export const SHAS={baseline:'1c6d2269d40f5e0524de13c6c5c5b1e2e4e56c0c',candidate:'08bf5cbb4bcd7b93f1b466ee88db79f1b347ee24'};
export const ORDER=['baseline','candidate','candidate','baseline','baseline','candidate'];
export function stats(values){
 const a=values.filter(Number.isFinite).filter(x=>x>=0).sort((a,b)=>a-b);
 const q=p=>a.length?a[Math.max(0,Math.ceil(a.length*p)-1)]:null;
 return {samples:a.length,p95Ms:q(.95),p99Ms:q(.99),maxMs:q(1),over33:a.filter(x=>x>33).length,over50:a.filter(x=>x>50).length};
}
const STAGES=new Set(['terrain.build.next','environment.build.next','batchStatic','grass.bake.next','gpu.readback.sync','city.preload-assembly','city.postload-assembly','town-kit.postload-assembly','shader.compile.sync']);
export function summarize(p){
 const frames=p.frames||[],groups={};
 for(const e of p.events||[])if(STAGES.has(e.name)&&Number.isFinite(e.durationMs)){
  const g=groups[e.name]||={name:e.name,count:0,totalMs:0,maxMs:0,slowestAt:null,phase:null,world:null};
  g.count++;g.totalMs+=e.durationMs;
  if(e.durationMs>=g.maxMs){g.maxMs=e.durationMs;g.slowestAt=e.start;g.phase=e.phase;g.world=e.world;}
 }
 const ready=(p.regions||[]).map(r=>({id:r.id,world:r.world,status:r.status,staticReadyMs:r.staticReadyMs,importedReadyMs:r.importedReadyMs}));
 return {...stats(frames.filter(f=>!f.hidden).map(f=>f.intervalMs).filter(v=>v!==null)),
  hiddenFrames:frames.filter(f=>f.hidden).length,stages:Object.values(groups).sort((a,b)=>b.maxMs-a.maxMs),regions:ready,
  // A start-to-start stall belongs to the preceding interval, not just this frame's CPU work.
  worstIntervals:frames.filter(f=>Number.isFinite(f.intervalMs)).sort((a,b)=>b.intervalMs-a.intervalMs).slice(0,20).map(f=>({from:f.at-f.intervalMs,to:f.at,ms:f.intervalMs,phase:f.phase,hidden:f.hidden})),
  dropped:p.dropped||0,errors:p.errors||[],protocolComplete:false};
}
export function testURL(variant,index,quality,device,group){
 if(!SHAS[variant]||!Number.isInteger(index)||index<1||index>6||!['low','medium','high'].includes(quality))throw Error('Invalid test selection');
 const q=new URLSearchParams({fresh:'1',profile:'1',deviceTest:'1',seed:'4',quality,dynres:'0',streamBudget:'6',variant,run:String(index),device:device.slice(0,80),group:group.slice(0,80)});
 return `./${variant}/?${q}`;
}
const n=(v,d=1)=>Number.isFinite(v)?v.toFixed(d):'—';
const css=`:host{all:initial;font:14px/1.55 system-ui,sans-serif;color:#eaf0ff}*{box-sizing:border-box}button,a,select,input{font:inherit}button,.action{min-height:44px;border:1px solid #536580;border-radius:10px;background:#17283d;color:#eff6ff;padding:8px 12px;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:6px}button:disabled{opacity:.45;cursor:not-allowed}.primary{background:#215bd4;border-color:#729dff}.bar{display:flex;align-items:center;gap:10px;padding:5px 9px;border-radius:14px;background:#0b1426ed;border:1px solid #455777;box-shadow:0 4px 20px #0006}.tiny{font-size:12px;color:#bfd0eb}.status{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.good{color:#8ceacb}.bad{color:#ffc68b}dialog{margin:auto;width:min(680px,94vw);max-height:85dvh;overflow:auto;background:#0e1b2c;color:#edf4ff;border:1px solid #58718e;border-radius:16px;padding:22px;font:14px/1.55 system-ui,sans-serif}dialog::backdrop{background:#0009}h2{font-size:21px;margin:0 0 12px}h3{font-size:16px;margin:20px 0 8px}p{margin:8px 0}.row{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}select,input,textarea{max-width:100%;padding:10px;border:1px solid #4b6480;border-radius:8px;background:#0a1423;color:#edf4ff}textarea{width:100%;height:150px}pre{white-space:pre-wrap;font:12px/1.5 ui-monospace,monospace;overflow-wrap:anywhere}table{width:100%;font-size:12px;border-collapse:collapse}td,th{text-align:left;border-bottom:1px solid #304359;padding:7px 4px}img{max-width:100%;border-radius:9px}summary{cursor:pointer} .grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.metric{background:#172a41;padding:10px;border-radius:9px}.metric strong{display:block;font-size:22px} @media(max-width:500px){.status{max-width:150px}.grid{grid-template-columns:repeat(2,1fr)}dialog{padding:14px}}`;
const make=(tag,text,parent)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;parent?.append(e);return e;};
function download(text,name,type='application/json'){
 const blob=text instanceof Blob?text:new Blob([text],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
}
async function launcher(){
 const form=document.querySelector('#config'),buttons=document.querySelector('#runs'),storage='pr80-device-settings-v1';
 let saved={};try{saved=JSON.parse(localStorage.getItem(storage)||'{}');}catch{}
 form.device.value=saved.device||'';form.quality.value=saved.quality||'medium';
 form.group.value=saved.group||`device-${Date.now().toString(36)}`;
 ORDER.forEach((v,i)=>{const b=make('button',`${i+1}. ${v==='baseline'?'A · ก่อนแก้':'B · PR80'}`,buttons);b.type='button';
  b.onclick=()=>{if(!form.reportValidity())return;const s={device:form.device.value,quality:form.quality.value,group:form.group.value};
   try{localStorage.setItem(storage,JSON.stringify(s));}catch{}
   location.href=testURL(v,i+1,s.quality,s.device,s.group);};});
 if(location.protocol==='file:'){document.querySelector('#notice').textContent='ต้องเปิดผ่าน HTTP/HTTPS ไม่ใช่แตะไฟล์ HTML: ใช้ serve.py บน PC หรือวางชุดนี้บนเว็บทดสอบคนละ origin กับเกมหลัก';buttons.querySelectorAll('button').forEach(b=>b.disabled=true);}
 document.querySelector('#results').onchange=async e=>{
  const body=document.querySelector('#comparison');body.replaceChildren();
  for(const file of e.target.files){const tr=make('tr',undefined,body);
   try{if(file.size>60*1024*1024)throw Error('ไฟล์เกิน 60 MB');const r=JSON.parse(await file.text());
    if(r.schema!=='pr80-device-v1'||r.source?.source!==SHAS[r.variant])throw Error('ไม่ใช่ผลจากชุดนี้');
    const s=r.summary;[`${r.variant==='baseline'?'A':'B'} / ${r.run}`,r.device,`${s.samples}`,n(s.p95Ms),n(s.p99Ms),n(s.maxMs),`${s.over33} / ${s.over50}`,r.validation.issues.length?r.validation.issues.join('; '):'ข้อมูลครบเบื้องต้น ไม่ใช่การรับรองเส้นทาง'].forEach(v=>make('td',v,tr));
   }catch(err){make('td',`${file.name}: ${err.message}`,tr).colSpan=8;}
  }
 };
}
async function panel(){
 const params=new URLSearchParams(location.search);if(params.get('deviceTest')!=='1')return;
 const variant=params.get('variant');if(!SHAS[variant])return;
 const host=document.createElement('aside');host.style.cssText='position:fixed;top:max(8px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:2147483646;max-width:96vw';document.body.append(host);
 const root=host.attachShadow({mode:'open'});root.innerHTML=`<style>${css}</style><div class="bar"><button id="open">${variant==='baseline'?'A':'B'} · วัดผล</button><span id="live" class="tiny status">กำลังเปิดเกม…</span></div><dialog id="dialog"><h2>${variant==='baseline'?'A · Baseline':'B · PR80'} <small class="tiny">${SHAS[variant].slice(0,7)} · งบ 6 ms</small></h2><p id="state">กำลังอ่านสถานะ</p><p class="tiny">เล่นด้วยการควบคุมเดิม ไม่มีการวาร์ป ลบมอนสเตอร์ หรือบันทึกเซฟหลัก ตัววัดเริ่มตั้งแต่เปิดหน้า</p><div class="row"><button id="close">กลับไปเล่น</button><a class="action" id="home" href="../">กลับหน้าเลือก A/B</a></div><h3>กำกับช่วงทดสอบ</h3><div class="row"><select id="phase"><option value="cold-open">เปิดเกมครั้งแรก</option><option value="first-neighbour-load">เดินเข้าหาขอบแมพ</option><option value="six-roundtrips">ข้ามไปกลับ 6 รอบ</option><option value="evict-return">ออกห่างแล้วกลับแมพเดิม</option><option value="cancel-preparation">กลับตัวขณะกำลังโหลด</option><option value="quiet-after-load">ยืนนิ่งหลังโหลด</option></select><button id="mark">เริ่มช่วงนี้</button><button id="sample">เก็บตัวอย่างทรัพยากร</button></div><p class="tiny">เริ่มช่วงก่อนเดิน อย่าเปิดเมนูวัดผลค้างระหว่างเดิน เมนูนี้ไม่หยุดเกม; เวลาที่เปิดเมนูและเวลาจับภาพจะกำกับไว้ในผลดิบ</p><div class="row"><button id="capture" disabled>จับภาพฉากหลัง imported-ready</button><button class="primary" id="finish">จบรอบและสรุปผล</button></div><p id="message" role="status"></p><section id="result" hidden><h3>ผลรอบนี้</h3><div id="metrics" class="grid"></div><p id="validity" class="bad"></p><pre id="stages"></pre><div class="row"><button id="download">บันทึก JSON</button><button id="share">แชร์ไฟล์</button><button id="show">แสดง JSON สำหรับคัดลอก</button></div><textarea id="raw" hidden readonly aria-label="ผล JSON"></textarea><p class="tiny">ไม่มีการส่งข้อมูลขึ้นเซิร์ฟเวอร์อัตโนมัติ จำนวน geometry/texture เป็นจำนวน ไม่ใช่ GPU MB; Safari ที่ไม่เปิดเผย JS heap จะแสดง null</p></section><section id="picture" hidden><h3>ภาพเฉพาะ canvas เกม</h3><img id="preview" alt="ฉากหลังโหลดโมเดลครบ"><div class="row"><a id="png" class="action">บันทึก PNG</a><button id="sharePng">แชร์ PNG</button></div></section><details><summary>วิธีเดินทดสอบ / ข้อมูลอุปกรณ์</summary><p>เปิดหน้าใหม่แต่ละรอบ → รอโมเดลครบ → เดินตามถนนตะวันตกไปขอบแมพ → ไปกลับ 6 รอบ → เดินออกห่างจนฉากข้างเคียงหายจากรายการ → กลับมารอโหลด → เดินออกแล้วกลับตัวขณะกำลังสร้าง → ยืนนิ่ง 10 วินาที แล้วจบรอบ</p><p>ใช้คุณภาพ ทิศทางจอ ระดับซูม และเส้นทางเดียวกันทั้ง A/B อย่าเปิดสองเวอร์ชันพร้อมกัน แต่ละรอบใช้ตัวละครใหม่ บราวเซอร์/ระบบปฏิบัติการอาจเก็บ cache จึงไม่เรียกทุกรอบว่า cold cache</p><pre id="device"></pre></details></dialog>`;
 const $=id=>root.getElementById(id),dialog=$('dialog');
 for(const type of ['pointerdown','pointerup','touchstart','touchend','keydown','keyup'])host.addEventListener(type,e=>e.stopPropagation());
 let manifest=null,kit=null,finished=false,payload=null,json=null,capturePending=false,pngFile=null,lastWorld=null;
 const annotations=[],observed=new WeakMap(),started=performance.now();let initial=null,initialFrame=null,initialRegions=null;
 const record=(type,detail={})=>annotations.push({at:performance.now(),type,...detail});
 const message=t=>$('message').textContent=t;
 $('open').onclick=()=>{dialog.showModal();record('panel-open');};$('close').onclick=()=>{record('panel-close');dialog.close();};dialog.addEventListener('cancel',()=>record('panel-close'));
 $('home').onclick=e=>{if(!finished&&!confirm('ออกจากรอบนี้โดยยังไม่บันทึก JSON?'))e.preventDefault();};
 async function loadIdentity(){const a=await fetch('./profile-source.json'),b=await fetch('../kit.json');if(!a.ok||!b.ok)throw Error('อ่าน manifest ไม่สำเร็จ');manifest=await a.json();kit=await b.json();if(manifest.source!==SHAS[variant]||kit.sources[variant]!==manifest.source)throw Error('SHA ไม่ตรง ห้ามใช้ผลนี้เปรียบเทียบ');}
 let identityError=null;try{await loadIdentity();}catch(e){identityError=String(e);message(identityError);}
 function environment(){const f=window.__frontier;if(!f?.view)return null;const r=f.view.renderer,gl=r.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
  return {ua:navigator.userAgent,webdriver:navigator.webdriver,devicePixelRatio,viewport:[innerWidth,innerHeight],drawingBuffer:[r.domElement.width,r.domElement.height],pixelRatio:r.getPixelRatio(),quality:f.view.quality,streamBudget:f.view.streamBudgetMs,post:!!f.view.post,zoom:f.view.zoom,gpu:ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):null};}
 function readiness(){const f=window.__frontier,p=window.__streamProfile;if(!f?.view||!p)return {ready:false,text:'รอเกมและตัววัด',regions:[]};
  const ns=[...f.view.neighbours.values()],regs=[f.view.region,...ns.map(n=>n.region)].filter(Boolean);
  for(const r of regs)if(!observed.has(r)){const entry={id:r.world?.data?.id||r.data?.id||'region',done:false,error:null};observed.set(r,entry);
   if(r.ready?.then)r.ready.then(()=>{entry.done=true;record('imported-ready-observed',{world:entry.id,disposed:!!r.disposed});},e=>entry.error=String(e));else entry.error='missing-ready';}
  const list=regs.map(r=>({...observed.get(r),disposed:!!r.disposed})),building=ns.filter(n=>n.steps).length,pending=list.filter(r=>!r.done).length;
  const ready=!!f.modelsReady&&!!f.game&&!!f.view.region&&!building&&!pending&&p.activeLoads===0&&!list.some(r=>r.error||r.disposed);
  return {ready,building,pending,activeLoads:p.activeLoads,regions:list,text:ready?'โมเดลครบ · imported-ready':`สร้างฉาก ${building} / รอโมเดล ${pending} / โหลดไฟล์ ${p.activeLoads}`};
 }
 let hooked=null;
 function tick(){const f=window.__frontier,p=window.__streamProfile,state=readiness();
  $('state').textContent=state.text; $('live').textContent=`${Number.isFinite(f?.fps)?Math.round(f.fps)+' FPS · ':''}${state.text}`;
  $('live').className='tiny status '+(state.ready?'good':'bad');$('capture').disabled=!state.ready||!!identityError||finished;
  if(f?.view&&!hooked){hooked=f.view;const original=hooked.render;hooked.render=function(...args){const v=original.apply(this,args);
   if(capturePending){capturePending=false;const s=readiness();if(!s.ready){message('สถานะเปลี่ยน ยังไม่จับภาพ');return v;}record('canvas-capture',{world:f.world.data.id,position:[f.game.player.x,f.game.player.z],readiness:s});
    try{this.renderer.domElement.toBlob(blob=>{if(!blob){message('เบราว์เซอร์ไม่คืนภาพ canvas');return;}pngFile=new File([blob],`pr80-${variant}-${Date.now()}.png`,{type:'image/png'});const url=URL.createObjectURL(blob);$('preview').src=url;$('png').href=url;$('png').download=pngFile.name;$('picture').hidden=false;dialog.showModal();message('จับภาพหลัง imported-ready แล้ว (ไม่มี HUD ใน PNG)');},'image/png');}catch(e){message(String(e));}}
   return v;};}
  if(f?.game&&p){if(!initial){initial=environment();initialFrame=performance.now();initialRegions=state; $('device').textContent=JSON.stringify(initial,null,2);}
   const w=f.world.data.id;if(w!==lastWorld){record('map-observed',{from:lastWorld,to:w,position:[f.game.player.x,f.game.player.z]});lastWorld=w;}
  }
 }
 const timer=setInterval(tick,1000);tick();
 document.addEventListener('visibilitychange',()=>record('visibility',{hidden:document.hidden}));window.addEventListener('resize',()=>record('viewport-change',{size:[innerWidth,innerHeight],dpr:devicePixelRatio}));
 $('mark').onclick=()=>{if(finished)return;const p=window.__streamProfile;if(!p)return message('ตัววัดยังไม่พร้อม');p.phase($('phase').value);record('phase-mark',{phase:$('phase').value});message('เริ่มช่วง: '+$('phase').selectedOptions[0].textContent);dialog.close();};
 $('sample').onclick=()=>{if(finished)return;const f=window.__frontier,p=window.__streamProfile;if(!f?.view||!p)return;record('manual-resource-sample');const s=p.sample(f.view,'manual-'+Date.now());message(`Geometry ${s.geometries} · Texture ${s.textures} · JS heap ${s.jsHeapBytesApprox===null?'ไม่มี API':n(s.jsHeapBytesApprox/1048576)+' MiB'}`);};
 $('capture').onclick=()=>{if(finished)return;capturePending=true;dialog.close();};
 $('finish').onclick=()=>{if(finished)return;const f=window.__frontier,p=window.__streamProfile;if(!p||!manifest||identityError)return message(identityError||'ตัววัด/manifest ยังไม่พร้อม');
  record('manual-finish');const at=performance.now();const snap=p.snapshot(),s=summarize(snap),final=environment(),issues=[];
  if(s.samples<100)issues.push('น้อยกว่า 100 frame samples');if(s.dropped||snap.resource?.dropped)issues.push('ตัววัดเก็บข้อมูลเต็ม/ถูกตัด');if(s.errors.length)issues.push('มี runtime errors');if(s.hiddenFrames)issues.push('มีช่วงออกจากหน้า');
  if(final?.streamBudget!==6)issues.push('งบ streaming ไม่ตรง 6 ms');if(final?.quality!==params.get('quality'))issues.push('คุณภาพถูกเปลี่ยน');
  if(initial&&JSON.stringify(initial)!==JSON.stringify(final))issues.push('การตั้งค่า/ขนาดจอ/ซูมเปลี่ยนระหว่างรอบ');if(!readiness().ready)issues.push('จบขณะยังโหลดฉาก/โมเดล (เก็บเป็น partial)');
  if(snap.unfinishedSpans?.length)issues.push('มีงานวัดยังไม่จบ');
  payload={schema:'pr80-device-v1',variant,run:Number(params.get('run')),group:params.get('group'),device:params.get('device'),capturedAt:new Date().toISOString(),source:manifest,kit,requested:{seed:4,quality:params.get('quality'),streamBudget:6,dynres:0},initial,final,
   measurement:{start:snap.startedAt,end:at,uiStarted:started,gameFirstObserved:initialFrame,initialRegions,readiness:readiness(),manual:true,coldCacheVerified:false},
   validation:{issues,protocolComplete:false,note:'Manual traversal is not automatically certified; examine marks, raw frames and region lifecycle.'},annotations,summary:s,profile:snap};
  // Freeze before any UI/report rendering; later frames cannot mutate the exported file.
  json=JSON.stringify(payload);finished=true;clearInterval(timer);$('live').textContent='จบรอบแล้ว · บันทึก JSON';$('capture').disabled=true;$('finish').disabled=true;$('mark').disabled=true;$('sample').disabled=true;
  $('result').hidden=false;$('metrics').replaceChildren();for(const [label,value] of [['p95 ms',n(s.p95Ms)],['p99 ms',n(s.p99Ms)],['สูงสุด ms',n(s.maxMs)],['เฟรม >33 / >50',`${s.over33} / ${s.over50}`],['Frame samples',String(s.samples)],['ข้อมูลถูกตัด',String(s.dropped)]]){const d=make('div',undefined,$('metrics'));d.className='metric';make('span',label,d);make('strong',value,d);}
  $('validity').textContent=issues.length?issues.join(' · '):'ยังไม่รับรองครบเส้นทางอัตโนมัติ ต้องตรวจผลดิบและเทียบรอบบนเครื่องเดียวกัน';
  $('stages').textContent=s.stages.slice(0,6).map(x=>`${x.name}: สูงสุด ${n(x.maxMs)} ms (${x.count} ครั้ง)`).join('\n')+'\nช่วงซ้อนกันได้ ห้ามบวกข้ามหมวด';message('ผลถูกตรึงไว้แล้ว กดบันทึก JSON หรือแชร์ไฟล์');
 };
 const filename=()=>`PR80-${variant}-r${params.get('run')}-${Date.now()}.json`;
 $('download').onclick=()=>{if(json)download(json,filename());};$('show').onclick=()=>{$('raw').hidden=false;$('raw').value=json||'';$('raw').focus();$('raw').select();};
 async function share(file){if(!navigator.canShare?.({files:[file]}))return message('เครื่องนี้ไม่รองรับแชร์ไฟล์จากหน้านี้ ใช้ปุ่มบันทึกไฟล์แทน');try{await navigator.share({files:[file]});}catch(e){message(e.name==='AbortError'?'ยกเลิกแชร์แล้ว':String(e));}}
 $('share').onclick=()=>{if(json)share(new File([json],filename(),{type:'application/json'}));};$('sharePng').onclick=()=>{if(pngFile)share(pngFile);};
}
if(typeof document!=='undefined'){if(document.getElementById('device-launcher'))launcher().catch(e=>document.getElementById('notice').textContent=String(e));else panel().catch(e=>console.error('Device test UI:',e));}
