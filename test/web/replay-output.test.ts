import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {saveRunRecord}=await import(pathToFileURL(resolve('web/run-storage.js')).href);
const {validateInputReplay}=await import(pathToFileURL(resolve('web/gem-actions.js')).href);
// Existing frame-start/training fixtures execute actual UI functions in Node.
// Producer counters test work and freshness, rather than matching implementation text.
const mainSource=process.env.REPLAY_UI_SOURCE??resolve('web/main.js');
function fixture(initialOutput="old output"){
 const source=fs.readFileSync(mainSource,'utf8');
 const snapshot=source.match(/^function runSnapshot\([^\n]+$/m)?.[0];
 const refresh=source.match(/^function refreshReplayOutput\([^\n]*\{[\s\S]*?\n\}/m)?.[0]??'';
 const save=source.match(/^\$\("saveRun"\)\.onclick=[^\n]+$/m)?.[0];
 const automaticEnd=source.indexOf('  // 준비 오버레이');assert.ok(automaticEnd>0);
 const automatic=source.slice(0,automaticEnd).trimEnd().split('\n').at(-1);
 assert.ok(snapshot&&save&&automatic);
 let hashes=0,sourceReads=0,writes=0,value=initialOutput,visible=true,storageFails=false;
 const output={get value(){return value;},set value(next){writes++;value=next;}};
 const drawer={hidden:false},details={open:true,getClientRects:()=>visible?[{}]:[]},saveButton:any={};
 const nodes:any={gameDrawer:drawer,replayDetails:details,replayInput:output,saveRun:saveButton};
 const world:any={sim:{tickCount:20,stateHash:()=>{hashes++;return '01234567';}},inputLog:[],runtimeCrashes:[],selectedGemId:null,runId:'fixture-run001',sourceVersion:'fixture-source'};
 const stored=new Map<string,string>(),messages:string[]=[];
 const context:any={world,playing:false,restoring:false,cam:{cx:10,cy:20,zoom:.2},contentBuild:'aaaaaaaaaaaaaaaa',replayBuild:null,sessionSeed:6,saveRunRecord,refreshSavedRuns:()=>{},$:(id:string)=>nodes[id],gemTowerPlayerState:()=>{sourceReads++;return {round:1,life:100};},validateInputReplay,localStorage:{setItem(key:string,text:string){if(storageFails)throw Error('quota');stored.set(key,text);}},flash:(text:string)=>messages.push(text)};
 vm.runInNewContext(snapshot+'\n'+refresh+'\n'+save,context);
 return {context,world,drawer,details,output,stored,messages,stats:()=>({hashes,sourceReads,writes}),visible(v:boolean){visible=v;},failStorage(v:boolean){storageFails=v;},refresh(){context.w=context.world;vm.runInNewContext(automatic!,context);},save(){saveButton.onclick();}};
}
it('actual replay output never invokes the snapshot producer for hidden, closed, playing or restoring automatic views',()=>{
 const f=fixture();
 f.drawer.hidden=true;for(let i=0;i<100;i++)f.refresh();
 f.drawer.hidden=false;f.details.open=false;for(let i=0;i<100;i++)f.refresh();
 f.details.open=true;f.visible(false);for(let i=0;i<100;i++)f.refresh();
 f.visible(true);f.context.playing=true;for(let i=0;i<100;i++)f.refresh();
 f.context.playing=false;f.context.restoring=true;for(let i=0;i<100;i++)f.refresh();
 assert.deepEqual(f.stats(),{hashes:0,sourceReads:0,writes:0});assert.equal(f.output.value,'old output');
});
it('visible paused output refreshes once per tick, input count, selection or camera change and follows a fresh world',()=>{
 const f=fixture();f.refresh();for(let i=0;i<100;i++)f.refresh();assert.deepEqual(f.stats(),{hashes:1,sourceReads:1,writes:1});
 f.world.sim.tickCount++;f.refresh();
 f.world.inputLog.push({tick:21,kind:'train',playerId:0,producerId:572,typeId:'h044',accepted:true});f.refresh();
 f.world.selectedGemId=40;f.refresh();
 f.context.cam.cx=11;f.refresh();f.context.cam.cy=22;f.refresh();f.context.cam.zoom=.3;f.refresh();
 assert.deepEqual(f.stats(),{hashes:7,sourceReads:7,writes:7});
 const trace=JSON.parse(f.output.value);assert.equal(trace.tick,21);assert.equal(trace.actions.length,1);assert.equal(trace.selectedGemId,40);assert.deepEqual(trace.camera,{cx:11,cy:22,zoom:.3});
 f.drawer.hidden=true;f.world.sim.tickCount++;f.refresh();assert.equal(f.stats().hashes,7);
 f.drawer.hidden=false;f.refresh();assert.equal(JSON.parse(f.output.value).tick,22);f.refresh();assert.equal(f.stats().hashes,8);
 f.context.world={sim:f.world.sim,inputLog:f.world.inputLog,runtimeCrashes:[],selectedGemId:f.world.selectedGemId,sourceVersion:f.world.sourceVersion};f.refresh();assert.equal(f.stats().hashes,9);
});
it('actual save handler immediately displays the same successful trace once, preserves failure guards, and does not re-snapshot on reveal',()=>{
 const stale={format:'uzmap-ui-input-v1',seed:6,tick:19,stateHash:'89abcdef',actions:[]};
 const f=fixture(JSON.stringify(stale));f.drawer.hidden=true;f.context.playing=true;
 f.world.inputLog.push({tick:20,kind:'train',playerId:0,producerId:572,typeId:'h044',accepted:true});f.save();
 assert.deepEqual(f.stats(),{hashes:1,sourceReads:1,writes:1});
 assert.equal(JSON.parse(f.output.value).tick,20);assert.equal(JSON.parse(f.output.value).stateHash,'01234567');
 const stored=f.stored.get('uzmap.gemtower.runs.v2.aaaaaaaaaaaaaaaa.fixture-run001');assert.ok(stored);assert.equal(f.stored.has('uzmap.gemtower.run.v1'),false);assert.deepEqual(JSON.parse(f.output.value),JSON.parse(stored));assert.equal(JSON.parse(f.output.value).actions.length,1);assert.match(f.messages.at(-1)??'',/저장했습니다/);
 f.context.playing=false;f.drawer.hidden=false;f.refresh();assert.equal(f.stats().hashes,1);
 const successful=f.output.value;f.world.sim.tickCount++;f.failStorage(true);f.save();assert.equal(f.stats().hashes,2);assert.equal(f.output.value,successful);assert.equal(f.stored.get('uzmap.gemtower.runs.v2.aaaaaaaaaaaaaaaa.fixture-run001'),stored);assert.equal(f.messages.at(-1),'quota');
 f.failStorage(false);f.context.restoring=true;f.save();assert.equal(f.stats().hashes,2);
 f.context.restoring=false;f.world.trainingBatch={};f.save();assert.equal(f.stats().hashes,2);assert.match(f.messages.at(-1)??'',/묶음/);
});
