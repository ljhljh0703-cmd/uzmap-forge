import {trainingInterruptionText} from '../../web/play-ui.js';
import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=()=>fs.readFileSync(new URL('../../web/main.js',import.meta.url),'utf8');
async function fixture(){
 const code=source(),checkpoint=code.match(/^function checkpointRun\([^\n]*\{[\s\S]*?^\}/m)?.[0];
 assert.ok(checkpoint,'the actual UI must use a safe checkpoint adapter');
 const snapshot=code.match(/^function runSnapshot\([^\n]*\{[^\n]*/m)?.[0];assert.ok(snapshot);
 const {createRunCheckpoint}=await import('../../web/run-checkpoint.js');
 const {saveRunRecord,listRunRecords,isRunCompatible}=await import('../../web/run-storage.js');
 const data=new Map<string,string>();let quota=false,writes=0,hashReads=0;
 const storage={get length(){return data.size},key(i:number){return [...data.keys()][i]??null},getItem(k:string){return data.get(k)??null},setItem(k:string,v:string){if(quota)throw Error('quota');writes++;data.set(k,v)}};
 const nodes:any={automaticSaveStatus:{textContent:'',dataset:{}},gameDrawer:{hidden:true}};
 const callbacks:any={},messages:string[]=[];let paints=0;
 const state={difficulty:1,round:1,life:15},world:any={runId:'ui-checkpoint-001',runMode:'race',modeDialog:{clicked:true},runtimeCrashes:[],inputLog:[],selectedGemId:null,sourceVersion:'fixture',vm:{},sim:{tickCount:35,stateHash:()=>{hashReads++;return '844b2f8b';}}};
 const context:any={world,restoring:false,runtimeFailed:false,loadingRun:false,playing:true,contentBuild:'a'.repeat(16),replayBuild:'b'.repeat(16),sessionSeed:6,cam:{cx:0,cy:0,zoom:1},gemTowerPlayerState:()=>state,localStorage:storage,createRunCheckpoint,saveRunRecord,isRunCompatible,$:(id:string)=>nodes[id],flash:(text:string)=>messages.push(text),refreshSavedRuns(){},Date,frameClock:{reset(){}},renderControls(){paints++;},document:{hidden:true,documentElement:{dataset:{}},addEventListener:(type:string,fn:any)=>callbacks[type]=fn},window:{addEventListener:(type:string,fn:any)=>callbacks[type]=fn}};
 vm.runInNewContext(snapshot+'\n'+checkpoint,context);
 return {code,context,world,state,nodes,storage,data,messages,callbacks,quota:(value:boolean)=>{quota=value;},writes:()=>writes,hashReads:()=>hashReads,paints:()=>paints,list:()=>listRunRecords(storage,context.contentBuild,context.replayBuild)};
}
it('actual checkpoint adapter creates a separate auto record with current replay identity and leaves manual bytes unchanged',async()=>{
 const f=await fixture();f.data.set('uzmap.gemtower.runs.v2.'+'a'.repeat(16)+'.manual001','manual exact bytes');
 const result=f.context.checkpointRun(f.world,true,100);assert.equal(result.kind,'saved');assert.equal(f.writes(),1);
 assert.equal(f.data.get('uzmap.gemtower.runs.v2.'+'a'.repeat(16)+'.manual001'),'manual exact bytes');
 const record=f.list().find((r:any)=>r.automatic)!;assert.ok(record);assert.equal(record.trace.tick,35);assert.equal(record.trace.replayBuild,f.context.replayBuild);assert.equal(record.trace.stateHash,'844b2f8b');assert.match(f.nodes.automaticSaveStatus.textContent,/자동 저장됨/);
});
it('unsafe or unsupported UI states never snapshot or write partial progress',async()=>{
 for(const change of [(f:any)=>f.context.restoring=true,(f:any)=>f.context.runtimeFailed=true,(f:any)=>f.context.loadingRun=true,(f:any)=>f.world.trainingBatch={},(f:any)=>f.world.modeDialog.pendingButtonId=1,(f:any)=>f.world.runtimeCrashes.push({error:true}),(f:any)=>f.world.runMode='classic',(f:any)=>f.world.replayMismatch=true,(f:any)=>f.state.difficulty=0,(f:any)=>f.world.sim.tickCount=1]){
  const f=await fixture();change(f);assert.equal(f.context.checkpointRun(f.world,true,100).kind,'skipped');assert.equal(f.writes(),0);assert.equal(f.hashReads(),0);
 }
});
it('paused ordinary input at the same tick is saved while unchanged hide/pagehide attempts deduplicate',async()=>{
 const f=await fixture();f.context.playing=false;f.context.checkpointRun(f.world,true,100);assert.equal(f.writes(),1);
 f.context.checkpointRun(f.world,true,110);assert.equal(f.writes(),1);f.world.inputLog.push({tick:35,kind:'chat',playerId:0,text:'-길찾기'});f.context.checkpointRun(f.world,true,120);assert.equal(f.writes(),2);assert.equal(f.list()[0].trace.actions[0].text,'-길찾기');
});
it('storage failure preserves the last automatic bytes, stays nonfatal and reports failure until a successful retry',async()=>{
 const f=await fixture();f.context.checkpointRun(f.world,true,100);const before=[...f.data];f.quota(true);f.world.sim.tickCount++;
 assert.equal(f.context.checkpointRun(f.world,true,110).kind,'failed');assert.deepEqual([...f.data],before);assert.equal(f.context.runtimeFailed,false);assert.match(f.nodes.automaticSaveStatus.textContent,/실패/);assert.equal(f.messages.length,1);
 f.context.checkpointRun(f.world,true,120);assert.equal(f.messages.length,1,'failure notice is not repeated every event');f.quota(false);assert.equal(f.context.checkpointRun(f.world,true,130).kind,'saved');assert.match(f.nodes.automaticSaveStatus.textContent,/자동 저장됨/);
});
it('actual visibility and page lifecycle hooks pause, save once and never resume on return',async()=>{
 const f=await fixture(),visibility=f.code.match(/document[.]addEventListener\("visibilitychange",[\s\S]*?\n\}\);/)?.[0],pagehide=f.code.match(/window[.]addEventListener\("pagehide",[\s\S]*?\n\}\);/)?.[0],pageshow=f.code.match(/window[.]addEventListener\("pageshow",[\s\S]*?\n\}\);/)?.[0];assert.ok(visibility&&pagehide&&pageshow);
 f.context.trainingInterruptionText=trainingInterruptionText;f.context.drag={on:false};const clear=f.code.match(/^function clearPlacement\([^\n]*\{[\s\S]*?^\}/m)?.[0],interrupt=f.code.match(/^function interruptUiOrders\([^\n]*\{[\s\S]*?^\}/m)?.[0];assert.ok(clear&&interrupt);vm.runInNewContext(clear+'\n'+interrupt+'\n'+visibility+'\n'+pagehide+'\n'+pageshow,f.context);f.callbacks.visibilitychange();assert.equal(f.context.playing,false);assert.equal(f.writes(),1);f.callbacks.pagehide();assert.equal(f.writes(),1);f.context.document.hidden=false;f.callbacks.pageshow();assert.equal(f.context.playing,false);assert.ok(f.paints()>0);
});
it('new load checkpoints the healthy old world before clearing its failure flag and never checkpoints a restoring world',async()=>{
 for(const restoring of [false,true]){
  const f=await fixture();f.context.restoring=restoring;
  const load=f.code.match(/^async function loadFromUrl\([^\n]*\{[\s\S]*?^\}/m)?.[0];assert.ok(load);
  Object.assign(f.context,{selectedSource:null,localSourceMode:false,setMsg(){},loadHostedPlayFiles:async()=>null,parseStockProfile(){},showSourceFiles(){},globalThis:{fetch:()=>{}},console});
  vm.runInNewContext(load,f.context);await f.context.loadFromUrl();assert.equal(f.writes(),restoring?0:1);assert.equal(f.context.loadingRun,false);
 }
});

async function restoreFixture(){
 const f=await fixture(),restore=f.code.match(/^async function restoreRun\([^\n]*\{[\s\S]*?^\}/m)?.[0];assert.ok(restore);
 const {validateInputReplay}=await import('../../web/gem-actions.js');const {restoredRunId}=await import('../../web/run-storage.js');
 for(const id of ['restoreProgressText','cancelRestore','researchToggle','msg'])f.nodes[id]={textContent:'',disabled:false,style:{},focus(){}};
 const original=f.world;Object.assign(f.context,{validateInputReplay,restoredRunId,restoreCancelled:false,performance:{now:()=>0},captureRunView:()=>({world:original}),restoreRunView:(before:any)=>{f.context.world=before.world;},loadFromUrl:async()=>{f.context.world={sim:{tickCount:0,stateHash:()=> '11223344',getUnit(){}},sourceVersion:'fixture',runtimeCrashes:[]};},render(){},setDrawer(){},commitSessionSeed(){}});
 vm.runInNewContext(restore,f.context);
 const trace={format:'uzmap-ui-input-v1',runId:'other-restored-001',mode:'race',build:f.context.contentBuild,replayBuild:f.context.replayBuild,seed:77,tick:0,stateHash:'11223344',sourceVersion:'fixture',actions:[]};
 return {...f,trace};
}
it('successful resume first checkpoints the healthy old run before entering the restoration exclusion window',async()=>{
 const f=await restoreFixture();f.world.sim.tickCount=34;f.context.checkpointRun(f.world,true,100);f.world.sim.tickCount=35;f.world.inputLog.push({tick:35,kind:'chat',playerId:0,text:'-길찾기'});
 await f.context.restoreRun(f.trace);assert.notEqual(f.context.world,f.world);const old=f.list().find((r:any)=>r.trace?.runId===f.world.runId)!;assert.equal(old.trace.tick,35);assert.equal(old.trace.actions.length,1);assert.equal(f.writes(),2);
});
it('resume refuses to replace healthy unsaved progress when the safety checkpoint fails',async()=>{
 const f=await restoreFixture();f.world.sim.tickCount=34;f.context.checkpointRun(f.world,true,100);f.world.sim.tickCount=35;f.quota(true);
 await f.context.restoreRun(f.trace);assert.equal(f.context.world,f.world);assert.equal(f.context.restoring,false);assert.equal(f.list()[0].trace.tick,34);assert.match(f.messages.at(-1)??'',/보관하지 못해/);
});

it('unchanged checkpoints do not repeatedly replace the live-region text on every animation frame',async()=>{
 const f=await fixture();let changes=0,text='';Object.defineProperty(f.nodes.automaticSaveStatus,'textContent',{get:()=>text,set:(next:string)=>{changes++;text=next;}});
 f.context.checkpointRun(f.world,true,100);for(let now=101;now<201;now++)f.context.checkpointRun(f.world,false,now);assert.equal(changes,1);
});
