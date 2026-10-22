import {validateInputReplay} from './gem-actions.js';
// Presentation metadata only: no Sim RNG or source rules are read or changed here.
export const LEGACY_RUN_KEY='uzmap.gemtower.run.v1';
const PREFIX='uzmap.gemtower.runs.v2.';
const AUTO_PREFIX='uzmap.gemtower.autos.v1.';
const safeId=id=>typeof id==='string'&&/^[a-zA-Z0-9_-]{8,80}$/.test(id);
const safeBuild=build=>typeof build==='string'&&/^[a-f0-9]{16}$/.test(build);
function validatedTrace(input){
 const trace=validateInputReplay(input);
 if(Object.hasOwn(trace,'replayBuild')&&!safeBuild(trace.replayBuild))throw Error('재생 호환 식별 정보가 올바르지 않습니다');
 if(trace.migratedFrom!==undefined){
  const m=trace.migratedFrom,keys=['build','replayBuild','runId','tick','stateHash'];
  if(!m||typeof m!=='object'||Object.keys(m).length!==keys.length||!keys.every(key=>Object.hasOwn(m,key))||(m.build!==null&&!safeBuild(m.build))||(m.replayBuild!==null&&!safeBuild(m.replayBuild))||(m.runId!==null&&!safeId(m.runId))||!Number.isSafeInteger(m.tick)||m.tick<0||m.tick>1000000||!/^[a-f0-9]{8}$/i.test(m.stateHash))throw Error('이전 저장 확인 기록이 올바르지 않습니다');
 }
 return trace;
}
export function createRunId(){return crypto.randomUUID();}
export function restoredRunId(trace){return safeId(trace.runId)?trace.runId:createRunId();}
export function saveRunRecord(storage,input,savedAt=Date.now(),{automatic=false}={}){
 const trace=validatedTrace(input);
 if(!safeId(trace.runId)||!safeBuild(trace.build)||!Number.isFinite(savedAt)||savedAt<0)throw Error('저장 식별 정보가 올바르지 않습니다');
 const saved={...trace,savedAt},key=(automatic?AUTO_PREFIX:PREFIX)+trace.build+'.'+trace.runId,raw=JSON.stringify(saved);
 storage.setItem(key,raw); // One atomic write; legacy and the other save namespace are never write targets.
 return {key,raw,trace:saved};
}
export function isRunCompatible(input,build,replayBuild=null){
 let trace;try{trace=validatedTrace(input);}catch{return false;}
 if(!safeBuild(build)||!safeBuild(trace.build)||trace.mode==='classic')return false;
 return trace.build===build||safeBuild(replayBuild)&&safeBuild(trace.replayBuild)&&trace.replayBuild===replayBuild;
}
export function listRunRecords(storage,build,replayBuild=null){
 const keys=[];for(let i=0;i<storage.length;i++){const key=storage.key(i);if(key===LEGACY_RUN_KEY||key?.startsWith(PREFIX)||key?.startsWith(AUTO_PREFIX))keys.push(key);}
 return keys.map(key=>{
  const raw=storage.getItem(key),legacy=key===LEGACY_RUN_KEY,automatic=key.startsWith(AUTO_PREFIX);let trace,error;
  try{trace=validatedTrace(raw);if(!legacy&&key!==(automatic?AUTO_PREFIX:PREFIX)+trace.build+'.'+trace.runId)throw Error('저장 식별 정보가 다릅니다');}catch(e){error=e.message;}
  const reason=trace?.mode==='classic'?'classic':null;
  // Restoration boots trace.seed; a new-game URL must not hide older runs.
  const compatible=!error&&!reason&&isRunCompatible(trace,build,replayBuild);
  const upgradeable=!error&&!reason&&canVerifyRunUpgrade(trace,build,replayBuild);
  return {key,raw:raw??'',legacy,automatic,trace,error,reason,compatible,upgradeable};
 }).sort((a,b)=>(Number(b.trace?.savedAt)||0)-(Number(a.trace?.savedAt)||0)||a.key.localeCompare(b.key));
}

/** Permission to try a replay, never permission to adopt its result. */
export function canVerifyRunUpgrade(input,build,replayBuild){
 let trace;try{trace=validatedTrace(input);}catch{return false;}
 return safeBuild(build)&&safeBuild(replayBuild)&&!isRunCompatible(trace,build,replayBuild)&&
  (trace.mode===undefined||trace.mode===null||trace.mode==='race')&&typeof trace.sourceVersion==='string'&&trace.sourceVersion.length>0&&
  (trace.runtimeCrashes===undefined||Array.isArray(trace.runtimeCrashes)&&trace.runtimeCrashes.length===0);
}
/** Copy a replay proven identical by the current runtime; never relabel the source. */
export function saveVerifiedRunCopy(storage,original,candidate,{newRunId=createRunId(),savedAt=Date.now()}={}){
 const from=validatedTrace(original),next=validatedTrace(candidate);
 if(!canVerifyRunUpgrade(from,next.build,next.replayBuild)||next.mode!=='race'||next.seed!==from.seed||next.tick!==from.tick||next.stateHash!==from.stateHash||next.sourceVersion!==from.sourceVersion||
  from.sourceState&&JSON.stringify(next.sourceState)!==JSON.stringify(from.sourceState)||!Array.isArray(next.runtimeCrashes)||next.runtimeCrashes.length||JSON.stringify(next.actions)!==JSON.stringify(from.actions))throw Error('저장 당시와 결과가 일치해야 새 저장을 만들 수 있습니다');
 if(!safeId(newRunId)||newRunId===from.runId||storage.getItem(PREFIX+next.build+'.'+newRunId)!==null||storage.getItem(AUTO_PREFIX+next.build+'.'+newRunId)!==null)throw Error('기존 저장과 다른 새 저장 칸이 필요합니다');
 const migratedFrom={build:safeBuild(from.build)?from.build:null,replayBuild:safeBuild(from.replayBuild)?from.replayBuild:null,runId:safeId(from.runId)?from.runId:null,tick:from.tick,stateHash:from.stateHash};
 const saved=saveRunRecord(storage,{...next,runId:newRunId,actions:next.actions.map(action=>({...action})),migratedFrom},savedAt);let state='pending';
 return {...saved,commit(){state='committed';},rollback(){
  if(state==='rolled-back')return true;if(state!=='pending'||storage.getItem(saved.key)!==saved.raw)return false;
  storage.removeItem(saved.key);state='rolled-back';return true;
 }};
}
