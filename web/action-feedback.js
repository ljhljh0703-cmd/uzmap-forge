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
// Legacy defaults remain for API/tests only. The product injects its separately
// verified catalogue; these paths make no license assertion.
const cueUrls=Object.fromEntries(['place','combine','upgrade'].map(kind=>{const url=new URL('./assets/audio/'+kind+'.wav',import.meta.url),build=new URL(import.meta.url).searchParams.get('build');if(build)url.searchParams.set('build',build);return[kind,url.href];}));
const CUE_PRIORITIES=Object.freeze({tap:0,kill:10,place:20,waveGold:30,keep:50,upgrade:55,combine:60,research:60,rare:65,waveStart:75,air:80,boss:85,lifeLoss:90,defeat:100,clear:100});
const cleanCatalogue=entries=>Object.fromEntries(Object.entries(entries??{}).flatMap(([kind,value])=>{
 const urls=(Array.isArray(value)?value:[value]).filter(url=>typeof url==='string'&&url.trim()).flatMap(url=>{try{return[new URL(url,import.meta.url).href];}catch{return[];}});
 return urls.length?[[kind,[...new Set(urls)]]]:[];
}));
const audioContextInfo=value=>{
 if(typeof value==='string')return value.slice(0,200);
 if(!value||typeof value!=='object')return {};
 return Object.fromEntries(Object.entries(value).slice(0,16).filter(([,v])=>typeof v==='string'||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)).map(([k,v])=>[k,typeof v==='string'?v.slice(0,200):v]));
};
/** View-only audio. No simulation, source RNG, storage or game clock access.
 * unlock resumes/loads only; it never plays deferred effects or old phase requests. */
export function createCueAudio({contextFactory=()=>{const C=globalThis.AudioContext??globalThis.webkitAudioContext;return C?new C():null;},fetch:fetchFile=globalThis.fetch,now=()=>performance.now(),wallNow=()=>Date.now(),onState=()=>{},cueUrls:injectedCues=cueUrls,bgmUrls={},cueSettings={},logLimit=256,setTimeout:schedule=globalThis.setTimeout,clearTimeout:cancelSchedule=globalThis.clearTimeout}={}){
 const catalogue=cleanCatalogue(injectedCues),music=cleanCatalogue(bgmUrls),settings=Object.fromEntries(Object.entries(cueSettings??{}).map(([kind,value])=>[kind,{...value}]));
 const assets=[...Object.entries(catalogue).map(([kind,urls])=>({key:kind,urls})),...Object.entries(music).filter(([kind])=>['prepare','combat'].includes(kind)).map(([kind,urls])=>({key:'bgm:'+kind,urls}))];
 const buffers=new Map(),decoded=new Map(),loading=new Map(),voices=new Set(),tracks=new Map(),lastPlay=new Map();let log=[],sequence=0,skipped=0;
 const limit=Number.isFinite(logLimit)?Math.max(1,Math.min(2048,Math.round(logLimit))):256;
 let context=null,sfxGain=null,bgmGain=null,recording=null,pending=null,suspending=null,enabled=true,wantRunning=false,epoch=0,status='idle',played=0,bgmStarted=0,phase=null,sfxVolume=80,bgmVolume=50,lastPhaseSkip='';
 const ms=()=>{try{const n=now();return Number.isFinite(n)?n:0;}catch{return 0;}};
 const audioTime=()=>Number.isFinite(context?.currentTime)?context.currentTime:0;
 const copyLog=()=>log.map(item=>({...item,context:typeof item.context==='string'?item.context:{...item.context}}));
 const muted=()=>!enabled||sfxVolume===0&&bgmVolume===0;
 const allLoaded=()=>assets.every(asset=>buffers.has(asset.key));
 const snapshot=()=>({enabled,status,played,active:voices.size,sfxVolume,bgmVolume,phase,bgmActive:tracks.size,bgmStarted,skipped,files:Object.fromEntries([...buffers].map(([kind,entry])=>[kind,entry.file])),log:copyLog()});
 const publish=value=>{status=value;try{onState(snapshot());}catch{}};
 const record=(type,result,cue,file,details={},reason='')=>{
  let wallTime=null;try{const n=wallNow();if(Number.isFinite(n))wallTime=n;}catch{}
  if(result==='skipped')skipped++;
  // context may contain a router descriptor gain; these scalars describe the
  // actual catalogue setting and channel controls at this log entry's time.
  const effectiveCueGain=type==='sfx'&&Object.hasOwn(catalogue,cue)?gainFor(cue):type==='bgm'&&Object.hasOwn(music,String(cue).slice(4))?1:null;
  log.push({sequence:++sequence,type,result,cue,file:file??null,at:ms(),wallTime,audioTime:context&&Number.isFinite(context.currentTime)?context.currentTime:null,effectiveCueGain,sfxVolume,bgmVolume,enabled,context:audioContextInfo(details),...(reason?{reason}:{})});
  if(log.length>limit)log.splice(0,log.length-limit);
 };
 const writeGain=(node,value)=>{if(node?.gain)node.gain.value=value;};
 const disposeVoice=voice=>{voices.delete(voice);try{voice.source.disconnect();}catch{}try{voice.gain?.disconnect();}catch{}};
 const stopVoice=voice=>{disposeVoice(voice);try{voice.source.stop();}catch{}};
 const stopVoices=()=>{for(const voice of [...voices])stopVoice(voice);};
 const clearTrackTimer=track=>{if(track.timer!==null){try{cancelSchedule(track.timer);}catch{}track.timer=null;}};
 const disposeTrack=track=>{clearTrackTimer(track);if(tracks.get(track.mode)===track)tracks.delete(track.mode);try{track.source.disconnect();}catch{}try{track.gain.disconnect();}catch{}};
 const stopTrack=track=>{disposeTrack(track);try{track.source.stop();}catch{}};
 const stopMusic=()=>{for(const track of [...tracks.values()])stopTrack(track);phase=null;};
 const stopAll=()=>{stopVoices();stopMusic();};
 const suspendContext=()=>{
  if(suspending)return suspending;if(context?.state!=='running')return Promise.resolve();
  const promise=Promise.resolve().then(()=>context.suspend()).finally(()=>{if(suspending===promise)suspending=null;});suspending=promise;return promise;
 };
 const priorityFor=kind=>Number.isFinite(settings[kind]?.priority)?settings[kind].priority:CUE_PRIORITIES[kind]??40;
 const gainFor=kind=>{const n=settings[kind]?.gain??({kill:.18,tap:.12})[kind]??1;return Number.isFinite(n)?Math.max(0,Math.min(1,n)):1;};
 const fileFor=kind=>buffers.get(kind)?.file??catalogue[kind]?.[0]??null;
 const skip=(kind,details,reason)=>{record('sfx','skipped',kind,fileFor(kind),details,reason);return false;};
 const usable=()=>enabled&&wantRunning&&status==='ready'&&context?.state==='running';
 const refresh=()=>publish(muted()?'muted':wantRunning&&context?.state==='running'&&allLoaded()?'ready':context?.state==='suspended'?'paused':'idle');
 const prepareGains=()=>{
  if(!sfxGain){sfxGain=context.createGain();writeGain(sfxGain,sfxVolume/100);sfxGain.connect(context.destination);}
  if(!bgmGain){bgmGain=context.createGain();writeGain(bgmGain,bgmVolume/100);bgmGain.connect(context.destination);}
 };
 const loadUrl=url=>{
  if(decoded.has(url))return Promise.resolve(decoded.get(url));if(loading.has(url))return loading.get(url);
  const promise=(async()=>{const response=await fetchFile(url);if(!response.ok)throw Error('sound unavailable');const data=await response.arrayBuffer(),buffer=await context.decodeAudioData(data);decoded.set(url,buffer);return buffer;})();
  loading.set(url,promise);void promise.then(()=>loading.delete(url),()=>loading.delete(url));return promise;
 };
 const loadAsset=async asset=>{
  if(buffers.has(asset.key))return;let lastError;
  for(const url of asset.urls){try{const buffer=await loadUrl(url);buffers.set(asset.key,{buffer,file:url});return;}catch(error){lastError=error;}}
  throw lastError??Error('sound unavailable');
 };
 const valueAt=(track,time)=>{const r=track.ramp;if(!r)return 0;if(time>=r.end)return r.to;if(time<=r.start)return r.from;return r.from+(r.to-r.from)*(time-r.start)/(r.end-r.start);};
 const ramp=(track,to)=>{
  clearTrackTimer(track);const start=audioTime(),from=valueAt(track,start),param=track.gain.gain;
  try{param.cancelScheduledValues?.(start);if(typeof param.setValueAtTime==='function')param.setValueAtTime(from,start);else param.value=from;if(typeof param.linearRampToValueAtTime==='function')param.linearRampToValueAtTime(to,start+.5);else param.value=to;}catch{param.value=to;}
  track.ramp={from,to,start,end:start+.5};
  if(to===0){const ticket=epoch;track.timer=schedule(()=>{track.timer=null;if(ticket===epoch&&tracks.get(track.mode)===track&&track.ramp?.to===0)stopTrack(track);},500);track.timer?.unref?.();}
 };
 const api={snapshot,
  get log(){return copyLog();},
  async unlock(){
   if(muted()){publish('muted');return false;}if(pending?.epoch===epoch)return pending.promise;
   wantRunning=true;const ticket=epoch;
   const cancelled=async()=>{if(ticket===epoch)return false;if(!wantRunning){try{await suspendContext();}catch{}if(!wantRunning)publish(muted()?'muted':'paused');}return true;};
   const promise=(async()=>{try{
    context??=contextFactory();if(!context){publish('unsupported');return false;}
    // A preceding background suspend may still be settling. A new gesture must
    // resume after it rather than have that old completion pause the new session.
    if(suspending)try{await suspending;}catch{}if(await cancelled())return false;
    if(context.state!=='running')await context.resume();if(await cancelled())return false;
    if(muted()){publish('muted');return false;}prepareGains();
    if(!allLoaded()){publish('loading');await Promise.all(assets.map(loadAsset));}
    if(await cancelled())return false;if(muted()){publish('muted');return false;}
    if(context.state!=='running'){publish('paused');return false;}lastPhaseSkip='';publish('ready');return true;
   }catch{if(ticket===epoch)publish(muted()?'muted':'blocked');return false;}})();
   pending={epoch:ticket,promise};try{return await promise;}finally{if(pending?.promise===promise)pending=null;}
  },
  play(kind,details={}){
   if(details?.suppressed===true)return skip(kind,details,'suppressed');
   if(!catalogue[kind])return skip(kind,details,'unknown-cue');
   if(!enabled||sfxVolume===0||gainFor(kind)===0)return skip(kind,details,'muted');
   if(!usable()||!buffers.has(kind))return skip(kind,details,'not-ready');
   const at=ms();if(at-(lastPlay.get(kind)??-Infinity)<80)return skip(kind,details,'duplicate-80ms');
   const priority=priorityFor(kind);
   if(voices.size>=3){const quietest=[...voices].sort((a,b)=>a.priority-b.priority||a.order-b.order)[0];if(priority<=quietest.priority)return skip(kind,details,'voice-limit');stopVoice(quietest);record('sfx','skipped',quietest.kind,fileFor(quietest.kind),quietest.details,'preempted');}
   let voice;
   try{
    const source=context.createBufferSource(),entry=buffers.get(kind);voice={source,gain:null,priority,order:sequence+1,kind,details:audioContextInfo(details)};source.buffer=entry.buffer;
    const cueGain=gainFor(kind);if(cueGain!==1){voice.gain=context.createGain();writeGain(voice.gain,cueGain);source.connect(voice.gain);voice.gain.connect(sfxGain);}else source.connect(sfxGain);
    source.onended=()=>disposeVoice(voice);voices.add(voice);source.start();lastPlay.set(kind,at);played++;record('sfx','played',kind,entry.file,details);publish('ready');return true;
   }catch{if(voice)disposeVoice(voice);return skip(kind,details,'start-failed');}
  },
  setPhase(mode,details={}){
   if(mode===null){if(phase!==null||tracks.size){record('bgm','skipped','bgm:'+phase,buffers.get('bgm:'+phase)?.file,details,'phase-cleared');stopMusic();}return true;}
   const key='bgm:'+mode,entry=buffers.get(key);
   if(!['prepare','combat'].includes(mode)||!music[mode]||details?.suppressed===true||!usable()||bgmVolume===0||!entry){const reason=!enabled||bgmVolume===0?'muted':details?.suppressed?'suppressed':!music[mode]?'unknown-phase':'not-ready',signature=[epoch,mode,reason,status].join(':');if(signature!==lastPhaseSkip){lastPhaseSkip=signature;record('bgm','skipped',key,entry?.file??music[mode]?.[0],details,reason);}return false;}
   if(phase===mode&&tracks.has(mode))return true;lastPhaseSkip='';let target=tracks.get(mode);
   try{
    if(!target){const source=context.createBufferSource(),gain=context.createGain();writeGain(gain,0);source.buffer=entry.buffer;source.loop=true;source.connect(gain);gain.connect(bgmGain);target={source,gain,mode,timer:null,ramp:{from:0,to:0,start:audioTime(),end:audioTime()}};source.onended=()=>disposeTrack(target);source.start();tracks.set(mode,target);bgmStarted++;}
    for(const track of tracks.values())if(track!==target)ramp(track,0);ramp(target,1);phase=mode;record('bgm','played',key,entry.file,details);return true;
   }catch{if(target&&tracks.get(mode)!==target)disposeTrack(target);record('bgm','skipped',key,entry.file,details,'start-failed');return false;}
  },
  setSfxVolume(value){const number=Number(value);if(!Number.isFinite(number))return sfxVolume;const next=Math.max(0,Math.min(100,Math.round(number)));if(next===sfxVolume)return sfxVolume;sfxVolume=next;writeGain(sfxGain,next/100);if(next===0)stopVoices();if(muted()){epoch++;wantRunning=false;stopAll();}refresh();return sfxVolume;},
  setBgmVolume(value){const number=Number(value);if(!Number.isFinite(number))return bgmVolume;const next=Math.max(0,Math.min(100,Math.round(number)));if(next===bgmVolume)return bgmVolume;bgmVolume=next;writeGain(bgmGain,next/100);if(next===0)stopMusic();if(muted()){epoch++;wantRunning=false;stopAll();}refresh();return bgmVolume;},
  setEnabled(value){enabled=value===true;if(!enabled){epoch++;wantRunning=false;stopAll();publish('muted');}else refresh();},
  stop(){epoch++;wantRunning=false;stopAll();refresh();},
  async suspend(){const ticket=++epoch;wantRunning=false;stopAll();try{await suspendContext();}catch{}if(ticket===epoch&&!wantRunning)publish(muted()?'muted':'paused');},
  getRecordingStream(){
   if(!usable()||!sfxGain||!bgmGain||typeof context.createMediaStreamDestination!=='function')return null;
   if(recording)return recording.stream;
   let destination;try{destination=context.createMediaStreamDestination();sfxGain.connect(destination);bgmGain.connect(destination);recording=destination;return destination.stream??null;}catch{if(destination)for(const gain of [sfxGain,bgmGain])try{gain.disconnect(destination);}catch{}return null;}
  },
 };
 return api;
}
