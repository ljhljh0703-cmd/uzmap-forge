import {it} from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';
import {restoreFixture} from './helpers/restore-fixture.ts';import * as store from '../../web/run-storage.js';
function upgradeFixture({mismatch=false,quota=false}={}){
 const f=restoreFixture({mismatch}),old=f.trace as any;old.build='b'.repeat(16);old.replayBuild='d'.repeat(16);old.mode='race';old.runId='previous-run-001';old.actions=[{tick:0,kind:'dialog',playerId:0,dialogId:7,buttonId:11}];
 const data=new Map<string,string>(),originalKey='uzmap.gemtower.runs.v2.'+old.build+'.'+old.runId,raw=JSON.stringify(old);data.set(originalKey,raw);data.set('unrelated-current-record','keep-current');const before=[...data];let selected:string|undefined;
 const storage={getItem:(key:string)=>data.get(key)??null,removeItem:(key:string)=>{data.delete(key);},setItem(key:string,value:string){if(quota)throw Error('quota');data.set(key,value);}};
 const originalLoad=f.context.loadFromUrl;
 f.context.loadFromUrl=(...args:any[])=>{const pending=originalLoad(...args);f.context.world.modeDialog={dialogId:7,raceButtonId:11,clicked:true};return pending;};
 Object.assign(f.context,{localStorage:storage,replayBuild:'c'.repeat(16),canVerifyRunUpgrade:(store as any).canVerifyRunUpgrade,saveVerifiedRunCopy:(s:any,t:any,next:any)=>(store as any).saveVerifiedRunCopy(s,t,next,{newRunId:'verified-copy-001',savedAt:5}),refreshSavedRuns:(key:string)=>{selected=key;}});
 const snapshot=f.source.match(/^function runSnapshot\([^\n]*\{[^\n]*/m)?.[0];assert.ok(snapshot);vm.runInNewContext(snapshot,f.context);
 f.context.replayInputBatch=(w:any,t:any,_cursor:number,advance:(n:number)=>void,maxTicks:number)=>{advance(Math.min(maxTicks,t.tick-w.sim.tickCount));return t.actions.filter((a:any)=>a.tick<=w.sim.tickCount).length;};
 return {...f,old,raw,data,before,originalKey,selected:()=>selected};
}
it('an explicit old-save check reuses the real replay controller and publishes only a separate verified current copy',async()=>{
 const f=upgradeFixture();f.begin({verifyUpgrade:true});await f.firstChunk();await f.finish();assert.notEqual(f.context.world,f.originalWorld);assert.equal(f.context.world.sim.tickCount,5000);assert.equal(f.context.world.runId,'verified-copy-001');assert.equal(f.context.playing,false);assert.equal(f.data.get(f.originalKey),f.raw);assert.equal(f.data.get('unrelated-current-record'),'keep-current');assert.equal(f.data.size,3);assert.ok(f.selected());
 const copy=JSON.parse(f.data.get(f.selected()!)!);assert.equal(copy.build,f.context.contentBuild);assert.equal(copy.replayBuild,f.context.replayBuild);assert.deepEqual(copy.actions,f.old.actions);assert.equal(copy.stateHash,f.old.stateHash);assert.equal(copy.migratedFrom.build,f.old.build);assert.equal(store.isRunCompatible(copy,f.context.contentBuild,f.context.replayBuild),true);assert.match(f.messages.at(-1)??'',/새 저장/);
});
it('the ordinary resume path still rejects a different version before replacing the current world',async()=>{const f=upgradeFixture();f.begin();await f.finish();assert.equal(f.context.world,f.originalWorld);assert.deepEqual([...f.data],f.before);assert.deepEqual(f.chunks,[]);});
it('a failed old-save result or changed source keeps the current game, camera and source records',async()=>{
 for(const reason of ['hash','source','crash']){const f=upgradeFixture({mismatch:reason==='hash'});if(reason==='source')f.old.sourceVersion='different-original-source';if(reason==='crash'){const load=f.context.loadFromUrl;f.context.loadFromUrl=(...args:any[])=>{const pending=load(...args);f.context.world.runtimeCrashes=[{kind:'ThreadCrashed'}];return pending;};}const camera={...f.context.cam};f.begin({verifyUpgrade:true});await f.finish();assert.equal(f.context.world,f.originalWorld);assert.deepEqual(f.context.cam,camera);assert.deepEqual([...f.data],f.before);assert.equal(f.context.restoring,false);assert.equal(f.nodes.play.disabled,false);assert.match(f.messages.at(-1)??'',/기존 진행/);}
});
it('canceling an old-save check publishes no copy and preserves the original progress',async()=>{const f=upgradeFixture();f.begin({verifyUpgrade:true});await f.firstChunk();f.context.cancelRestore();await f.finish();assert.equal(f.context.world,f.originalWorld);assert.deepEqual([...f.data],f.before);assert.equal(f.context.playing,false);assert.match(f.messages.at(-1)??'',/취소/);});
it('failure writing a verified copy rolls the UI back instead of silently adopting an unsaved migration',async()=>{const f=upgradeFixture({quota:true});f.begin({verifyUpgrade:true});await f.finish();assert.equal(f.context.world,f.originalWorld);assert.deepEqual([...f.data],f.before);assert.equal(f.context.restoring,false);assert.equal(f.nodes.play.disabled,false);assert.match(f.messages.at(-1)??'',/quota/);});
it('a failed current checkpoint or unissued current batch is protected before an old-save check',async()=>{
 for(const reason of ['quota','batch','pending-mode']){const f=upgradeFixture();if(reason==='quota')f.context.checkpointRun=()=>({kind:'failed'});if(reason==='batch')f.context.world.trainingBatch={remaining:2};if(reason==='pending-mode')f.context.world.modeDialog={pendingButtonId:9};f.begin({verifyUpgrade:true});await f.finish();assert.equal(f.context.world,f.originalWorld);assert.deepEqual([...f.data],f.before);assert.deepEqual(f.chunks,[]);assert.equal(f.context.restoring,false);}
});
it('a post-copy render or final-control failure rolls back its own unpublished copy as well as the live game',async()=>{
 for(const phase of ['render','refresh','final-controls']){
  const f=upgradeFixture(),originalRender=f.context.render,originalControls=f.context.renderControls,originalRefresh=f.context.refreshSavedRuns;let failed=false;
  if(phase==='render')f.context.render=(w:any,...args:any[])=>{if(!failed&&f.data.size>f.before.length){failed=true;throw Error('render publication failed');}return originalRender(w,...args);};
  if(phase==='refresh')f.context.refreshSavedRuns=(key:string)=>{if(!failed&&f.data.size>f.before.length){failed=true;throw Error('list publication failed');}return originalRefresh(key);};
  if(phase==='final-controls')f.context.renderControls=(w:any)=>{if(!failed&&!f.context.restoring&&f.context.world!==f.originalWorld){failed=true;throw Error('control publication failed');}return originalControls(w);};
  f.begin({verifyUpgrade:true});await f.finish();assert.equal(failed,true,phase);assert.equal(f.context.world,f.originalWorld,phase);assert.deepEqual([...f.data],f.before,phase);assert.equal(f.context.restoring,false);assert.equal(f.nodes.play.disabled,false);
 }
});
it('failed final controls or URL publication preserve the original session seed and URL as well as the saved data',async()=>{
 for(const phase of ['controls','history']){
  const f=upgradeFixture(),priorURL='http://127.0.0.1/web/?seed=1';f.old.seed=7;f.originalWorld.seed=1;f.context.sessionSeed=1;f.context.URL=URL;f.context.location={href:priorURL};let historyCalls=0,failed=false;
  f.context.history={state:null,replaceState(_state:any,_title:string,url:URL){historyCalls++;if(phase==='history')throw Error('history publication failed');f.context.location.href=url.href;}};
  const commit=f.source.match(/^function commitSessionSeed\([^\n]*\{[\s\S]*?\n\}/m)?.[0];assert.ok(commit);vm.runInNewContext(commit,f.context);
  const load=f.context.loadFromUrl;f.context.loadFromUrl=(...args:any[])=>{const pending=load(...args);f.context.world.seed=7;return pending;};
  if(phase==='controls'){const controls=f.context.renderControls;f.context.renderControls=(w:any)=>{if(!failed&&!f.context.restoring&&w!==f.originalWorld){failed=true;throw Error('final controls failed');}return controls(w);};}
  f.begin({verifyUpgrade:true});await f.finish();assert.equal(f.context.world,f.originalWorld);assert.equal(f.context.sessionSeed,1);assert.equal(f.context.location.href,priorURL);assert.deepEqual([...f.data],f.before);assert.equal(historyCalls,phase==='controls'?0:1);
 }
});
