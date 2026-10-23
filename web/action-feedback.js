/** Presentation-only source-success responses and reused prototype sounds. */
export function createActionFeedback({now=()=>performance.now(),play=()=>false,document:doc=null,reducedMotion=()=>false}={}){
 const seen=new Set(),targets=new Map();let active=[],last=null,total=0;
 const remove=node=>{const entry=targets.get(node);try{entry?.animation?.cancel();}catch{}node.classList.remove('action-success');delete node.dataset.feedbackKind;targets.delete(node);};
 return{
  confirm(event={}){
   if(event.suppressed||!['place','combine','upgrade'].includes(event.kind)||typeof event.key!=='string'||!event.key||!Number.isSafeInteger(event.unitId)||event.unitId<1||typeof event.name!=='string'||!event.name.trim()||seen.has(event.key))return null;
   seen.add(event.key);if(seen.size>128)seen.delete(seen.values().next().value);
   last={key:event.key,kind:event.kind,unitId:event.unitId,name:event.name,until:now()+520};active=[...active.filter(item=>item.until>now()),last].slice(-6);total++;
   try{play(event.kind);}catch{/* Sound failure must never block a successful game action. */}return{...last};
  },
  snapshot(){active=active.filter(item=>item.until>now());return{active:active.map(item=>({...item})),last:last?{...last}:null,total};},
  render(selectedId){
   const state=this.snapshot();if(!doc)return;const desired=new Map();
   for(const item of state.active){for(const node of doc.querySelectorAll(`.round-slot[data-unit-id="${item.unitId}"]`))desired.set(node,item);if(item.unitId===selectedId)for(const id of ['gemName','selectedGemPortrait']){const node=doc.getElementById(id);if(node)desired.set(node,item);}}
   for(const node of targets.keys())if(!desired.has(node))remove(node);
   for(const[node,item]of desired){if(targets.get(node)?.key===item.key)continue;remove(node);node.classList.add('action-success');node.dataset.feedbackKind=item.kind;let animation=null;
    if(!reducedMotion()&&typeof node.animate==='function')try{animation=node.animate([{filter:'brightness(1.24)'},{filter:'brightness(1)'}],{duration:360,easing:'ease-out'});}catch{}
    targets.set(node,{key:item.key,animation});
   }
   const panel=doc.getElementById('bottomPanel');if(panel){panel.dataset.confirmedActions=String(state.total);panel.dataset.lastSuccess=state.last?.kind??'';}
  },
  clear(){active=[];last=null;total=0;seen.clear();for(const node of targets.keys())remove(node);}
 };
}
const cueUrls=Object.fromEntries(['place','combine','upgrade'].map(kind=>{const url=new URL('./assets/audio/'+kind+'.wav',import.meta.url),build=new URL(import.meta.url).searchParams.get('build');if(build)url.searchParams.set('build',build);return[kind,url.href];}));
export function createCueAudio({contextFactory=()=>{const C=globalThis.AudioContext??globalThis.webkitAudioContext;return C?new C():null;},fetch:fetchFile=globalThis.fetch,now=()=>performance.now(),onState=()=>{}}={}){
 let context=null,gain=null,pending=null,enabled=true,wantRunning=false,epoch=0,status='idle',played=0;const buffers=new Map(),voices=new Set(),lastPlay=new Map();
 const snapshot=()=>({enabled,status,played,active:voices.size});
 const publish=value=>{status=value;try{onState(snapshot());}catch{}};
 const stop=()=>{for(const voice of [...voices]){try{voice.stop();}catch{}try{voice.disconnect();}catch{}}voices.clear();};
 const api={snapshot,
  async unlock(){
   if(!enabled)return false;if(pending?.epoch===epoch)return pending.promise;
   wantRunning=true;const ticket=epoch;
   const cancelled=async()=>{if(ticket===epoch)return false;if(!wantRunning){try{if(context?.state==='running')await context.suspend();}catch{}publish(enabled?'paused':'muted');}return true;};
   const promise=(async()=>{try{
    context??=contextFactory();if(!context){publish('unsupported');return false;}
    if(context.state!=='running')await context.resume();
    if(await cancelled())return false;
    if(!enabled){publish('muted');return false;}
    if(!gain){gain=context.createGain();gain.gain.value=.22;gain.connect(context.destination);}
    publish('loading');await Promise.all(Object.entries(cueUrls).map(async([kind,url])=>{if(buffers.has(kind))return;const response=await fetchFile(url);if(!response.ok)throw Error('sound unavailable');const bytes=await response.arrayBuffer();buffers.set(kind,await context.decodeAudioData(bytes));}));
    if(await cancelled())return false;
    if(!enabled){publish('muted');return false;}if(context.state!=='running'){publish('paused');return false;}publish('ready');return true;
   }catch{if(ticket===epoch)publish(enabled?'blocked':'muted');return false;}})();
   pending={epoch:ticket,promise};try{return await promise;}finally{if(pending?.promise===promise)pending=null;}
  },
  play(kind){
   if(!enabled||status!=='ready'||context?.state!=='running'||!buffers.has(kind)||voices.size>=3||now()-(lastPlay.get(kind)??-Infinity)<80)return false;
   let voice;try{voice=context.createBufferSource();voice.buffer=buffers.get(kind);voice.connect(gain);voice.onended=()=>{voices.delete(voice);try{voice.disconnect();}catch{}};voices.add(voice);voice.start();lastPlay.set(kind,now());played++;publish('ready');return true;}catch{if(voice){voices.delete(voice);try{voice.disconnect();}catch{}}return false;}
  },
  setEnabled(value){enabled=value===true;if(!enabled){epoch++;wantRunning=false;stop();publish('muted');}else publish(context?.state==='running'&&buffers.size===3?'ready':'idle');},
  stop,
  async suspend(){epoch++;wantRunning=false;stop();try{if(context?.state==='running')await context.suspend();}catch{}publish(enabled?'paused':'muted');}
 };return api;
}
