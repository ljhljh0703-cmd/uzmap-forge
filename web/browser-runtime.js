/** View-only browser coordination; never reads or changes Sim/VM state. */
export function createFrameTask(task,{requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id)}={}){
 let frame=null,args=null,destroyed=false;
 function queue(...input){if(destroyed)return;args=input;if(frame!==null)return;frame=requestFrame(()=>{frame=null;const input=args;args=null;if(!destroyed)task(...(input??[]));});}
 queue.cancel=()=>{if(frame!==null)cancelFrame(frame);frame=null;args=null;};
 queue.destroy=()=>{destroyed=true;queue.cancel();};
 return queue;
}
export function resizeCanvasToHost(canvas,rect){
 if(!rect||!Number.isFinite(rect.width)||!Number.isFinite(rect.height)||rect.width<=0||rect.height<=0)return false;
 const width=Math.max(1,Math.floor(rect.width)),height=Math.max(1,Math.floor(rect.height));let changed=false;
 if(canvas.width!==width){canvas.width=width;changed=true;}if(canvas.height!==height){canvas.height=height;changed=true;}
 return changed;
}

/** Loading presentation only. Source readers, SHA checks, VM and saves remain callers' authority. */
export function mountLoadingScreen(doc,{tips=[]}={}){
 const byId=id=>doc.getElementById(id),app=byId('gameApp'),screen=byId('loadingScreen'),stage=byId('loadingStage'),bytes=byId('loadingBytes'),bar=byId('loadingProgress'),tip=byId('loadingTip'),recovery=byId('loadingRecovery'),failure=byId('loadingError');
 const messages=tips.filter(text=>typeof text==='string'&&text.trim()).map(text=>text.trim().replace(/\s*\n+\s*/g,' · ')),received=new Map(),completed=new Set(),portals=new Map();
 const win=doc.defaultView??globalThis,raf=typeof win.requestAnimationFrame==='function'?win.requestAnimationFrame.bind(win):null;
 let state='idle',tipIndex=0,readingPromise=null,lock=null;
 const setState=value=>{state=value;doc.documentElement.dataset.loadState=value;};
 const showTip=()=>{tip.textContent=messages.length?messages[tipIndex%messages.length]:'';tip.hidden=!messages.length;};
 const changeTip=()=>{tipIndex++;showTip();};
 const indeterminate=()=>{bar.removeAttribute('value');bar.setAttribute('max','1');};
 const format=n=>n<1000?n+' B':n<1000000?(n/1000).toFixed(1)+' KB':(n/1000000).toFixed(1)+' MB';
 function refreshBytes(){
  const rows=[...received.values()],loaded=rows.reduce((sum,row)=>sum+row.loaded,0),known=rows.length>0&&rows.every(row=>row.total!==null),total=known?rows.reduce((sum,row)=>sum+row.total,0):null;
  bytes.dataset.loaded=String(loaded);bytes.dataset.total=total===null?'':String(total);bytes.textContent=total===null?format(loaded)+' 받음':format(loaded)+' / '+format(total);
  if(state==='receiving'&&total>0&&loaded<=total){bar.setAttribute('max',String(total));bar.setAttribute('value',String(loaded));}else indeterminate();
 }
 function claimInert(){
  if(lock||!app)return;lock={prior:Boolean(app.inert),wrote:!app.inert,external:false,observer:null};if(!lock.wrote)return;
  app.inert=true;const Observer=win.MutationObserver??globalThis.MutationObserver;
  if(typeof Observer==='function')try{const owned=lock;owned.observer=new Observer(records=>{if(records.length)owned.external=true;});owned.observer.observe(app,{attributes:true,attributeFilter:['inert']});}catch{/* Boolean ownership still protects pre-existing locks without this optional observer. */}
 }
 function releaseInert(){
  if(!lock)return;const owned=lock;lock=null;if(owned.observer){if(owned.observer.takeRecords().length)owned.external=true;owned.observer.disconnect();}
  if(owned.wrote&&!owned.external&&app.inert===true)app.inert=owned.prior;
 }
 function restorePortals(){
  for(const [node,place]of portals){if(node.parentNode===recovery&&place.parent)place.parent.insertBefore(node,place.next?.parentNode===place.parent?place.next:null);}portals.clear();
 }
 function portal(node){
  if(!node||!recovery)return;if(node.parentNode!==recovery){if(!portals.has(node))portals.set(node,{parent:node.parentNode,next:node.nextSibling});recovery.append(node);}
 }
 return {
  begin(){restorePortals();claimInert();received.clear();completed.clear();readingPromise=null;tipIndex=0;setState('receiving');screen.hidden=false;screen.setAttribute('aria-busy','true');bar.hidden=false;failure.hidden=true;failure.textContent='';stage.textContent='받는 중';showTip();refreshBytes();},
  receive(id,loaded,total=null){
   if(!['receiving','reading'].includes(state)||typeof id!=='string'||!Number.isSafeInteger(loaded)||loaded<0)return;
   total=Number.isSafeInteger(total)&&total>=loaded?total:null;received.set(id,{loaded,total});
   if(state==='receiving'&&total>0&&loaded===total&&!completed.has(id)){completed.add(id);changeTip();}refreshBytes();
  },
  reading(){
   if(state==='reading')return readingPromise??Promise.resolve();if(state!=='receiving')return Promise.resolve();setState('reading');stage.textContent='맵 읽는 중';indeterminate();changeTip();
   readingPromise=raf?new Promise(resolve=>raf(()=>raf(resolve))):Promise.resolve();return readingPromise;
  },
  finish(){restorePortals();setState('ready');screen.hidden=true;screen.setAttribute('aria-busy','false');releaseInert();},
  intake(existingForm){restorePortals();claimInert();setState('intake');screen.hidden=false;screen.setAttribute('aria-busy','false');bar.hidden=true;tip.hidden=true;failure.hidden=true;stage.textContent='게임 자료 선택';portal(existingForm);if(existingForm)existingForm.hidden=false;},
  error(message){restorePortals();claimInert();setState('error');screen.hidden=false;screen.setAttribute('aria-busy','false');bar.hidden=true;tip.hidden=true;stage.textContent='게임을 열지 못했습니다';failure.textContent=String(message??'자료를 확인한 뒤 다시 열어 주세요');failure.hidden=false;portal(byId('msg'));}
 };
}

/** Fetch body bytes only. HTTP-encoded Content-Length is not a decoded-byte total. */
export async function readResponseBytes(response,id,callback=()=>{}){
 const encoding=response.headers?.get?.('content-encoding'),length=response.headers?.get?.('content-length'),number=length!==null&&length!==undefined&&/^\d+$/.test(length)?Number(length):NaN;
 const total=!encoding&&Number.isSafeInteger(number)&&number>=0?number:null;let loaded=0;callback(id,loaded,total);
 if(!response.body?.getReader){const result=await response.arrayBuffer();callback(id,result.byteLength,total);return result;}
 const reader=response.body.getReader(),chunks=[];
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;const chunk=value instanceof Uint8Array?value.slice():new Uint8Array(value);chunks.push(chunk);loaded+=chunk.byteLength;callback(id,loaded,total);}
 }finally{reader.releaseLock?.();}
 const joined=new Uint8Array(loaded);let offset=0;for(const chunk of chunks){joined.set(chunk,offset);offset+=chunk.byteLength;}callback(id,loaded,total);return joined.buffer;
}

/** View-only device policy; explicit physical portrait prevents keyboard resize false positives. */
export function isShortTouchLandscape(input={}){
 const {touch,width,height,orientation,editing=false}=input??{};
 if(touch!==true||![width,height].every(value=>Number.isFinite(value)&&value>0)||height>=500)return false;
 const direction=typeof orientation==='string'?orientation.toLowerCase():'';
 if(/^portrait(?:-|$)/.test(direction))return false;
 if(/^landscape(?:-|$)/.test(direction))return true;
 return editing!==true&&width>height;
}
/** A wide desktop or a roomy landscape tablet shares the existing side controls. */
export function isDesktopPlayLayout(input={}){
 const {width,height}=input??{};
 return Boolean([width,height].every(value=>Number.isFinite(value)&&value>0)&&(width>900||width>=700&&height>=500&&width>height));
}
/** Preserve manual precision confirmation; automatic assistance is touch-only below16 CSS px. */
export function smallCellNeedsConfirmation(input={}){
 const {pointerType,cellCssPx,precise=false}=input??{};
 return precise===true||pointerType==='touch'&&Number.isFinite(cellCssPx)&&cellCssPx>0&&cellCssPx<16;
}
