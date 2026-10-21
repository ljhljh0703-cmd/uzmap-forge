import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import * as store from '../../web/run-storage.js';
import * as checkpoint from '../../web/run-checkpoint.js';

const build='a'.repeat(16),otherBuild='b'.repeat(16),replayBuild='c'.repeat(16);
const trace=(runId='check-run001',tick=20)=>({format:'uzmap-ui-input-v1',build,seed:6,tick,stateHash:'01234567',actions:[],runId,mode:'race'});
function storage(){
 const data=new Map<string,string>();let failure:unknown=null,writes=0;
 return {data,get writes(){return writes;},get length(){return data.size;},key:(i:number)=>[...data.keys()][i]??null,getItem:(key:string)=>data.get(key)??null,setItem(key:string,raw:string){writes++;if(failure)throw failure;data.set(key,raw);},fail(error:unknown){failure=error;}};
}
describe('independent automatic slots preserve existing save authority',()=>{
 it('writes an automatic slot atomically without touching same-run manual or protected legacy bytes',()=>{
  const s=storage(),legacy='  '+JSON.stringify(trace('legacy001'))+'\n';s.data.set(store.LEGACY_RUN_KEY,legacy);
  const manual=store.saveRunRecord(s,trace(),10),automatic=store.saveRunRecord(s,trace(),11,{automatic:true});
  assert.notEqual(automatic.key,manual.key);assert.match(automatic.key,/^uzmap[.]gemtower[.]autos[.]v1[.]/);
  store.saveRunRecord(s,trace('check-run001',30),12,{automatic:true});
  assert.equal(s.getItem(manual.key),manual.raw);assert.equal(s.getItem(store.LEGACY_RUN_KEY),legacy);assert.equal(s.length,3);assert.equal(s.writes,3);
  const records=store.listRunRecords(s,build);assert.equal(records.length,3);assert.equal(records.filter((r:any)=>r.automatic).length,1);
  assert.equal(records.find((r:any)=>r.automatic)?.trace.tick,30);assert.equal(records.find((r:any)=>r.key===manual.key)?.automatic,false);
 });
 it('keeps automatic runs separate and preserves old manual signatures including the obsolete numeric third list argument',()=>{
  const s=storage();store.saveRunRecord(s,trace('check-run001'),1,{automatic:true});store.saveRunRecord(s,trace('check-run002'),2,{automatic:true});store.saveRunRecord(s,trace('check-run001'),3);
  assert.equal(s.length,3);assert.equal(store.listRunRecords(s,build,6).filter((r:any)=>r.compatible).length,3);
  assert.equal(store.listRunRecords(s,build).filter((r:any)=>r.automatic).length,2);
 });
 it('a quota failure leaves all manual, legacy and earlier automatic bytes unchanged',()=>{
  const s=storage();s.data.set(store.LEGACY_RUN_KEY,'protected raw');store.saveRunRecord(s,trace(),1);store.saveRunRecord(s,trace(),2,{automatic:true});
  const before=[...s.data],quota=new Error('quota');s.fail(quota);
  assert.throws(()=>store.saveRunRecord(s,trace('check-run001',40),3,{automatic:true}),error=>error===quota);assert.deepEqual([...s.data],before);
 });
 it('lists malformed automatic raw for export while refusing its resume and identity mismatch',()=>{
  const s=storage(),record=store.saveRunRecord(s,trace(),1,{automatic:true});s.data.set(record.key,record.raw.replace('check-run001','wrong-run002'));
  const [entry]=store.listRunRecords(s,build);assert.equal(entry.automatic,true);assert.equal(entry.compatible,false);assert.ok(entry.error);assert.equal(entry.raw,s.getItem(record.key));
 });
 it('rejects invalid optional replay fingerprints before any storage write',()=>{
  const s=storage();for(const value of [null,undefined,'','bad','d'.repeat(15),'G'.repeat(16)])assert.throws(()=>store.saveRunRecord(s,{...trace(),replayBuild:value},1,{automatic:true}));
  assert.equal(s.writes,0);assert.equal(s.length,0);
 });
});

describe('conservative replay compatibility',()=>{
 it('keeps unknown old records exact-build only and accepts a valid matching behavior fingerprint across builds',()=>{
  assert.equal(store.isRunCompatible(trace(),build),true);assert.equal(store.isRunCompatible(trace(),otherBuild,replayBuild),false);
  assert.equal(store.isRunCompatible({...trace(),replayBuild},otherBuild,replayBuild),true);
  assert.equal(store.isRunCompatible({...trace(),replayBuild},otherBuild,'d'.repeat(16)),false);
  assert.equal(store.isRunCompatible({...trace(),replayBuild},otherBuild,6),false);
 });
 it('rejects invalid fingerprints even for an exact build and keeps classic unsupported',()=>{
  for(const value of [null,undefined,'bad','f'.repeat(17)])assert.equal(store.isRunCompatible({...trace(),replayBuild:value},build,replayBuild),false);
  assert.equal(store.isRunCompatible({...trace(),mode:'classic',replayBuild},build,replayBuild),false);
  assert.equal(store.isRunCompatible({...trace(),mode:'classic',replayBuild},otherBuild,replayBuild),false);
  assert.equal(store.isRunCompatible({...trace(),build:'fixture-build'},'fixture-build'),false);
  assert.equal(store.isRunCompatible({...trace(),tick:-1,replayBuild},otherBuild,replayBuild),false);
 });
 it('exposes matching compatibility on both automatic and manual records without rewriting either raw',()=>{
  const s=storage();const old=store.saveRunRecord(s,trace('old-run001'),1),manual=store.saveRunRecord(s,{...trace('new-run001'),replayBuild},2),automatic=store.saveRunRecord(s,{...trace('new-run001'),replayBuild},3,{automatic:true}),before=[...s.data];
  const records=store.listRunRecords(s,otherBuild,replayBuild);assert.equal(records.find((r:any)=>r.key===old.key)?.compatible,false);
  for(const record of [manual,automatic])assert.equal(records.find((r:any)=>r.key===record.key)?.compatible,true);
  assert.deepEqual([...s.data],before);
 });
 it('surfaces an invalid fingerprint stored externally as an incompatible preserved record',()=>{
  const s=storage(),record=store.saveRunRecord(s,trace(),1,{automatic:true});s.data.set(record.key,JSON.stringify({...trace(),replayBuild:'invalid'}));
  const [entry]=store.listRunRecords(s,build,replayBuild);assert.equal(entry.compatible,false);assert.ok(entry.error);assert.equal(entry.automatic,true);assert.equal(entry.raw,s.getItem(record.key));
 });
});

describe('lazy synchronous checkpoint scheduling',()=>{
 it('saves the first eligible frame immediately, then only when the interval is due',()=>{
  const writes:any[]=[],c=checkpoint.createRunCheckpoint((value:any,now:number)=>{writes.push([value,now]);return {key:'auto',raw:'raw',trace:value};});let snapshots=0;
  const snapshot=()=>({number:++snapshots});
  const first=c.attempt({now:1000,eligible:true,revision:'1:0',snapshot});assert.equal(first.kind,'saved');assert.equal(first.record.key,'auto');assert.equal(snapshots,1);
  assert.equal(c.attempt({now:30999,eligible:true,revision:'2:0',snapshot}).kind,'skipped');assert.equal(snapshots,1);
  assert.equal(c.attempt({now:31000,eligible:true,revision:'2:0',snapshot}).kind,'saved');assert.equal(snapshots,2);assert.deepEqual(writes.map(w=>w[1]),[1000,31000]);
 });
 it('never calls snapshot or write for an ineligible world, including forced lifecycle attempts',()=>{
  let calls=0;const c=checkpoint.createRunCheckpoint(()=>{calls++;throw Error('must not write');});
  for(const force of [false,true])assert.deepEqual(c.attempt({now:0,eligible:false,revision:'1:0',force,snapshot:()=>{calls++;throw Error('must not snapshot');}}),{kind:'skipped',reason:'ineligible'});
  assert.equal(calls,0);
 });
 it('deduplicates a successfully saved revision even when lifecycle callers force it',()=>{
  let snapshots=0,writes=0;const c=checkpoint.createRunCheckpoint(()=>{writes++;return 'record';}),snapshot=()=>++snapshots;
  assert.equal(c.attempt({now:0,eligible:true,revision:'1:0',snapshot}).kind,'saved');
  for(const [now,force] of [[1,true],[30000,false],[60000,true]] as const)assert.equal(c.attempt({now,eligible:true,revision:'1:0',force,snapshot}).kind,'skipped');
  assert.equal(writes,1);assert.equal(snapshots,1);assert.equal(c.attempt({now:60001,eligible:true,revision:'1:1',snapshot}).kind,'saved');
 });
 it('returns a write error without throwing, throttles the failed attempt and allows a forced same-revision retry',()=>{
  const quota=new Error('quota');let snapshots=0,writes=0,fail=true;
  const c=checkpoint.createRunCheckpoint(()=>{writes++;if(fail)throw quota;return {key:'auto'};}),snapshot=()=>++snapshots;
  const failure=c.attempt({now:0,eligible:true,revision:'1:0',snapshot});assert.equal(failure.kind,'failed');assert.equal(failure.error,quota);
  fail=false;assert.equal(c.attempt({now:29999,eligible:true,revision:'1:0',snapshot}).kind,'skipped');assert.equal(snapshots,1);assert.equal(writes,1);
  const retry=c.attempt({now:29999,eligible:true,revision:'1:0',force:true,snapshot});assert.equal(retry.kind,'saved');assert.equal(retry.record.key,'auto');assert.equal(writes,2);
  assert.equal(c.attempt({now:30000,eligible:true,revision:'1:0',force:true,snapshot}).kind,'skipped');assert.equal(writes,2);
 });
 it('throttles snapshot exceptions too, without calling write or marking a revision as saved',()=>{
  const bad=new Error('snapshot failed');let calls=0,writes=0;const c=checkpoint.createRunCheckpoint(()=>{writes++;return 'ok';});
  const snapshot=()=>{calls++;if(calls===1)throw bad;return 'trace';};
  const first=c.attempt({now:10,eligible:true,revision:'1:0',snapshot});assert.equal(first.kind,'failed');assert.equal(first.error,bad);assert.equal(writes,0);
  assert.equal(c.attempt({now:30009,eligible:true,revision:'1:0',snapshot}).kind,'skipped');assert.equal(calls,1);
  assert.equal(c.attempt({now:30010,eligible:true,revision:'1:0',snapshot}).kind,'saved');assert.equal(writes,1);
 });
 it('rejects invalid time as a returned failure and skips backwards clock readings without snapshots',()=>{
  let snapshots=0;const c=checkpoint.createRunCheckpoint(()=> 'ok'),snapshot=()=>++snapshots;
  for(const now of [NaN,Infinity,-1]){const result=c.attempt({now,eligible:true,revision:'1:0',snapshot});assert.equal(result.kind,'failed');assert.ok(result.error instanceof Error);}
  assert.equal(snapshots,0);assert.equal(c.attempt({now:100,eligible:true,revision:'1:0',snapshot}).kind,'saved');
  assert.deepEqual(c.attempt({now:99,eligible:true,revision:'2:0',force:true,snapshot}),{kind:'skipped',reason:'clock'});
  assert.equal(snapshots,1);assert.equal(c.attempt({now:101,eligible:true,revision:'2:0',force:true,snapshot}).kind,'saved');
 });
 it('keeps each world controller independent and accepts a positive custom interval',()=>{
  let writes=0;const write=()=>++writes,one=checkpoint.createRunCheckpoint(write,{intervalMs:10}),two=checkpoint.createRunCheckpoint(write,{intervalMs:10}),snapshot=()=>({});
  assert.equal(one.attempt({now:0,eligible:true,revision:'1:0',snapshot}).kind,'saved');assert.equal(two.attempt({now:0,eligible:true,revision:'1:0',snapshot}).kind,'saved');
  assert.equal(one.attempt({now:9,eligible:true,revision:'2:0',snapshot}).kind,'skipped');assert.equal(one.attempt({now:10,eligible:true,revision:'2:0',snapshot}).kind,'saved');assert.equal(writes,3);
  for(const intervalMs of [0,-1,NaN,Infinity])assert.throws(()=>checkpoint.createRunCheckpoint(write,{intervalMs}));
 });
 it('reuses the atomic automatic writer while preserving all earlier bytes on quota failure',()=>{
  const s=storage();const manual=store.saveRunRecord(s,trace(),1);s.data.set(store.LEGACY_RUN_KEY,'legacy bytes');
  const c=checkpoint.createRunCheckpoint((value:any,now:number)=>store.saveRunRecord(s,value,now,{automatic:true}));
  assert.equal(c.attempt({now:2,eligible:true,revision:'20:0',snapshot:()=>trace()}).kind,'saved');const before=[...s.data];s.fail(new Error('quota'));
  assert.equal(c.attempt({now:30002,eligible:true,revision:'21:0',snapshot:()=>trace('check-run001',21)}).kind,'failed');
  assert.deepEqual([...s.data],before);assert.equal(s.getItem(manual.key),manual.raw);assert.equal(s.getItem(store.LEGACY_RUN_KEY),'legacy bytes');
 });
});
