/** Source sound timing and already-confirmed view events only. No VM/sim, DOM,
 * asset loading, audio nodes, clock reads, RNG, commands or run storage here. */
const SOURCE_LANES=Object.freeze([
 ['life-loss','Br',['p4','adv','brv','GZv','MMv','UCv','ooe','Rze']],
 ['wave-gold','AN',['QMe','sie','sqe','SVe','SSe','tOe','tue','TAe']],
 ['wave-start','VA',['mke','MVe','MYe','pHe','Pie','Pwe','qge','Qxe']],
 ['boss','dr',['j5e','Jre','JIe','Jfe','JKe','Jse','JYe','J5e']],
]);
const SOURCE_CUES=Object.freeze(Object.fromEntries(SOURCE_LANES.flatMap(([kind,symbol,callers])=>callers.map((caller,playerId)=>[caller,Object.freeze({kind,symbol,playerId})]))));
/** Audited original PlaySoundBJ pairs. Unknown/test/treasure/shop sounds stay
 * unmapped; zero-valued legacy sound handles are never used as identity. */
export function sourceCueForCall(call){
 if(call?.kind!=='PlaySoundBJ')return null;
 const reference=call.reference;
 if(call.caller==='Sd'&&reference?.symbol==='dr'&&reference.index==null)return {kind:'wave-start',playerId:0};
 const row=Object.hasOwn(SOURCE_CUES,call.caller??'')?SOURCE_CUES[call.caller]:null;
 if(!row||reference?.symbol!==row.symbol)return null;
 if(row.symbol==='VA'){
  // The original calls these voices only from Ce>=40; only 40..50 have these
  // wave assignments. VA[60] is a different treasure event, not a wave cue.
  if(!Number.isSafeInteger(reference.index)||reference.index<40||reference.index>50)return null;
 }else if(reference.index!=null)return null;
 return {kind:row.kind,playerId:row.playerId};
}
const CUES=new Set(['wave-start','life-loss','kill','boss','air','keep','rare','combine','research','wave-gold','tap','defeat','clear','place','upgrade']);
const validKey=key=>typeof key==='string'&&key.length>0&&key.length<=240;
const tickValue=value=>Number.isSafeInteger(value)&&value>=0?value:null;

/** Submit source calls and view fallbacks for one game step together, using the
 * same semantic key (e.g. life:<tick>). A real source call wins that occurrence.
 * Suppressed history is consumed without playback or advancing kill sampling. */
export function createSoundEventRouter({playerId=0,maxSeen=2048}={}){
 const limit=Number.isSafeInteger(maxSeen)&&maxSeen>0?Math.min(maxSeen,32768):2048;
 let runId=null,fastKillCount=0;const seen=new Set();
 const reset=(id=null)=>{runId=id;fastKillCount=0;seen.clear();};
 return {
  route(events=[],context={}){
   const id=typeof context.runId==='string'?context.runId:'view';if(runId!==id)reset(id);
   const candidates=new Map();
   for(const [order,event]of (Array.isArray(events)?events:[]).entries()){
    if(!event||event.confirmed===false)continue;
    const source=event.kind==='source-call'?sourceCueForCall(event.call):null;
    if(event.kind==='source-call'&&!source)continue;
    const kind=source?.kind??event.kind,owner=source?.playerId??event.playerId??playerId;
    if(!CUES.has(kind)||owner!==playerId)continue;
    if(kind==='rare'&&event.special!==true&&!(Number.isSafeInteger(event.rank)&&event.rank>=4))continue;
    const key=validKey(event.key)?event.key:source&&Number.isSafeInteger(event.call.sequence)?`call:${event.call.sequence}`:null;
    if(key===null)continue;
    const occurrence=kind+'\0'+key;if(seen.has(occurrence))continue;
    const origin=source?'source':'view',tick=tickValue(source?event.call.tick:context.tick)??tickValue(context.tick)??0;
    const candidate={kind,cue:kind,key:runId+':'+kind+':'+key,eventKey:key,runId,origin,tick,gain:kind==='kill'||kind==='tap'?0.12:1,
     ...(source?{source:{caller:event.call.caller,line:event.call.line,reference:{...event.call.reference}}}:{}),order};
    const previous=candidates.get(occurrence);
    if(!previous||origin==='source'&&previous.origin!=='source')candidates.set(occurrence,candidate);
   }
   const suppressed=context.restoring===true||context.hidden===true||context.failed===true||context.suppressed===true,result=[];
   if(!(Number.isFinite(context.speed)&&context.speed>=4))fastKillCount=0;
   for(const [occurrence,candidate]of [...candidates].sort((a,b)=>a[1].tick-b[1].tick||a[1].order-b[1].order)){
    seen.add(occurrence);if(seen.size>limit)seen.delete(seen.values().next().value);
    if(suppressed)continue;
    if(candidate.kind==='kill'&&context.speed>=4&&++fastKillCount%3!==0)continue;
    const {order,...descriptor}=candidate;result.push(descriptor);
   }
   return result;
  },
  reset,
  snapshot(){return {runId,seen:seen.size,fastKillCount};},
 };
}
