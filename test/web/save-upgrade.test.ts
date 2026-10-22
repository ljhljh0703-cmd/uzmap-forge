import {it} from 'node:test';import assert from 'node:assert/strict';import * as storageModule from '../../web/run-storage.js';
const store=storageModule as any,oldBuild='a'.repeat(16),oldReplay='d'.repeat(16),build='b'.repeat(16),replay='c'.repeat(16);
function trace(){return {format:'uzmap-ui-input-v1',mode:'race',runId:'old-run-001',build:oldBuild,replayBuild:oldReplay,seed:7,tick:20,stateHash:'abcdef01',sourceVersion:'original-map-and-profile',sourceState:{round:1,life:15},runtimeCrashes:[],actions:[{tick:20,kind:'train',playerId:0,producerId:3,typeId:'h01W',accepted:true}]};}
function memory(){const data=new Map<string,string>();let fail=false;return {data,key:(n:number)=>[...data.keys()][n],get length(){return data.size;},getItem:(key:string)=>data.get(key)??null,removeItem:(key:string)=>{data.delete(key);},setItem(key:string,value:string){if(fail)throw Error('quota');data.set(key,value);},quota(){fail=true;}};}
it('a different version is an explicit check candidate; ordinary compatibility remains strict',()=>{
 assert.equal(typeof store.canVerifyRunUpgrade,'function');const old=trace(),before=JSON.stringify(old);assert.equal(store.isRunCompatible(old,build,replay),false);assert.equal(store.canVerifyRunUpgrade(old,build,replay),true);assert.equal(JSON.stringify(old),before);
 assert.equal(store.canVerifyRunUpgrade({...old,build,replayBuild:replay},build,replay),false);assert.equal(store.canVerifyRunUpgrade({...old,replayBuild:replay},build,replay),false);
 const {build:previousBuild,replayBuild:previousReplay,...legacy}=old;assert.equal(store.canVerifyRunUpgrade(legacy,build,replay),true,'a protected legacy record can have no former build identity, but still needs a known source and exact result');
});
it('unsupported or damaged old records are never offered an upgrade attempt',()=>{
 assert.equal(typeof store.canVerifyRunUpgrade,'function');for(const old of [{...trace(),mode:'classic'},{...trace(),mode:'other'},{...trace(),sourceVersion:null},{...trace(),sourceVersion:''},{...trace(),runtimeCrashes:[{kind:'ThreadCrashed'}]},{...trace(),replayBuild:'broken'},{...trace(),actions:[{tick:50}]}])assert.equal(store.canVerifyRunUpgrade(old,build,replay),false);
 assert.equal(store.canVerifyRunUpgrade(trace(),null,replay),false);assert.equal(store.canVerifyRunUpgrade(trace(),build,null),false);
});
it('verified copies get a fresh current identity, preserve the old bytes and resume by the existing normal path',()=>{
 assert.equal(typeof store.saveVerifiedRunCopy,'function');const s=memory(),old=trace(),original=store.saveRunRecord(s,old,1),before=s.getItem(original.key),candidate={...old,build,replayBuild:replay,actions:structuredClone(old.actions)};
 const copy=store.saveVerifiedRunCopy(s,old,candidate,{newRunId:'upgraded-run-001',savedAt:2});assert.notEqual(copy.key,original.key);assert.equal(s.getItem(original.key),before);assert.equal(copy.trace.runId,'upgraded-run-001');assert.equal(copy.trace.build,build);assert.equal(copy.trace.replayBuild,replay);assert.deepEqual(copy.trace.actions,old.actions);assert.equal(copy.trace.stateHash,old.stateHash);
 assert.deepEqual(copy.trace.migratedFrom,{build:oldBuild,replayBuild:oldReplay,runId:old.runId,tick:20,stateHash:'abcdef01'});assert.equal(store.isRunCompatible(copy.trace,build,replay),true);assert.equal(JSON.stringify(old),JSON.stringify(trace()));
 const records=store.listRunRecords(s,build,replay);assert.equal(records.find((r:any)=>r.key===original.key).upgradeable,true);assert.equal(records.find((r:any)=>r.key===copy.key).compatible,true);
});
it('a missing old build is recorded honestly and is never invented on the original',()=>{
 assert.equal(typeof store.saveVerifiedRunCopy,'function');const old:any=trace();delete old.build;delete old.replayBuild;delete old.runId;const original=JSON.stringify(old),s=memory();s.data.set(store.LEGACY_RUN_KEY,original);
 const copy=store.saveVerifiedRunCopy(s,old,{...old,mode:'race',build,replayBuild:replay},{newRunId:'legacy-copy-001'});assert.equal(s.getItem(store.LEGACY_RUN_KEY),original);assert.equal(copy.trace.migratedFrom.build,null);assert.equal(copy.trace.migratedFrom.runId,null);
});
it('changed replay results, source, commands or unsupported target mode cannot be saved as a verified copy',()=>{
 assert.equal(typeof store.saveVerifiedRunCopy,'function');for(const patch of [{seed:8},{tick:21},{stateHash:'deadbeef'},{sourceVersion:'different-source'},{sourceState:{round:1,life:99}},{runtimeCrashes:[{}]},{actions:[]},{mode:'classic'},{build:null},{replayBuild:'bad'}]){
  const s=memory(),old=trace(),prior=store.saveRunRecord(s,old,1),before=[...s.data];assert.throws(()=>store.saveVerifiedRunCopy(s,old,{...old,build,replayBuild:replay,...patch},{newRunId:'blocked-copy-001'}));assert.deepEqual([...s.data],before);assert.equal(s.getItem(prior.key),before[0][1]);
 }
});
it('quota errors, reused identities and key collisions leave existing records untouched',()=>{
 assert.equal(typeof store.saveVerifiedRunCopy,'function');for(const kind of ['quota','old-id','collision']){const s=memory(),old=trace();store.saveRunRecord(s,old,1);if(kind==='collision')store.saveRunRecord(s,{...old,runId:'upgraded-run-001',build,replayBuild:replay},2);const before=[...s.data];if(kind==='quota')s.quota();assert.throws(()=>store.saveVerifiedRunCopy(s,old,{...old,build,replayBuild:replay},{newRunId:kind==='old-id'?old.runId:'upgraded-run-001'}));assert.deepEqual([...s.data],before);}
});
it('malformed migration history is rejected and cannot be advertised as compatible',()=>{
 for(const migratedFrom of [false,'text',{build:'bad'},{build:oldBuild,replayBuild:oldReplay,runId:'old-run-001',tick:-1,stateHash:'abcdef01'},{build:oldBuild,replayBuild:oldReplay,runId:'old-run-001',tick:20,stateHash:'no'}])assert.equal(store.isRunCompatible({...trace(),build,replayBuild:replay,migratedFrom},build,replay),false);
});
it('an unpublished copy can be rolled back without touching changed or committed records',()=>{
 const old=trace(),next={...old,build,replayBuild:replay};
 const s=memory(),first=store.saveVerifiedRunCopy(s,old,next,{newRunId:'rollback-copy-001'});assert.equal(typeof first.rollback,'function');assert.equal(first.rollback(),true);assert.equal(s.data.size,0);assert.equal(first.rollback(),true);
 const second=store.saveVerifiedRunCopy(s,old,next,{newRunId:'rollback-copy-002'});s.data.set(second.key,'changed-by-another-owner');assert.equal(second.rollback(),false);assert.equal(s.getItem(second.key),'changed-by-another-owner');
 const third=store.saveVerifiedRunCopy(s,old,next,{newRunId:'rollback-copy-003'});third.commit();assert.equal(third.rollback(),false);assert.equal(s.getItem(third.key),third.raw);
});
