/** Actual browser control-flow functions with model world/storage/render; no browser or original-map input. */
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {createFrameClock} from '../../src/sim/ticks.ts';
import {createRunCheckpoint} from '../../web/run-checkpoint.js';
import {it} from 'node:test';
it('a post-boot presentation failure stops the new clock and prevents saving a failed candidate',async()=>{
const source=fs.readFileSync(new URL('../../web/main.js',import.meta.url),'utf8');
const names=['runSnapshot','checkpointRun','chooseStartup','loadFromUrl','loop'];
const extract=n=>source.match(new RegExp('^(?:async )?function '+n+'\\([^\\n]*\\{[\\s\\S]*?^\\}','m'))[0];
const code=names.map(extract).join('\n');
for(const failure of ['reject','render']){
const nodes={},node=id=>nodes[id]??=({hidden:true,dataset:{},style:{display:'none'},textContent:'',focus(){}});
const old={id:'old',sim:{tickCount:100,stateHash:()=> '11111111'},runMode:null};
const created={id:'new',runId:'new-run',sim:{tickCount:0,stateHash:()=> '22222222',ledger:{gold:()=>10}},runMode:null,modeDialog:{clicked:true},runtimeCrashes:[],inputLog:[],selectedGemId:null,seed:6};
let rejectVisual,resolveVisual;const visual=new Promise((r,j)=>{resolveVisual=r;rejectVisual=j;});void visual.catch(()=>{});
let committed=0;const writes=[],steps=[],errors=[];let loader='idle';const app=node('gameApp');
const c={world:old,playing:true,restoring:false,loadingRun:false,runtimeFailed:false,sessionSeed:6,selectedSource:{mapBytes:new ArrayBuffer(0),stockProfile:{}},localSourceMode:true,frameClock:createFrameClock(),tps:1,
 document:{documentElement:{dataset:{}},fonts:{ready:Promise.resolve()}},$:node,
 loadingScreen:{begin(){loader='receiving';app.inert=true},reading:async()=>{},finish(){loader='ready';app.inert=false},error(){loader='error';app.inert=true}},
 readResponseBytes(){},setMsg(){},drag:{},resize(){},boot:()=>created,extractGemPresentation:()=>({}),renderChatHelp(){},listRunRecords:()=>[],localStorage:{},
 requestStartupChoice(w){w.runMode='race';return true},stepN:(w,n)=>{steps.push({world:w.id,n});w.sim.tickCount+=n},render(){},cv:{focus(){}},visualReady:visual,commitSessionSeed(){committed++;},quietActionFeedback(){},window:{showErr(...a){errors.push(a)}},requestAnimationFrame(){},
 gemTowerPlayerState:()=>({round:1,life:15,buildCount:0,chosen:false,active:true,difficulty:1}),createRunCheckpoint,
 saveRunRecord:(_storage,trace)=>{writes.push({runId:trace.runId,tick:trace.tick});return{key:'saved'}},contentBuild:'build',replayBuild:'replay',cam:{},flash(){},refreshSavedRuns(){},console:{error(e){errors.push(String(e))}},
 prevHp:new Map(),prevGold:[],textTags:[],goldTags:[],lastPos:new Map(),attackFx:[],waveNum:0,prevCreeps:0,waveFlashUntil:0,rectEntered:0,deaths:0,gatePassed:0};
vm.runInNewContext(code,c);const pending=c.loadFromUrl(6);for(let i=0;i<8;i++)await Promise.resolve();
const whilePending={oldTick:old.sim.tickCount,newTick:created.sim.tickCount,playing:c.playing,loadingRun:c.loadingRun};
if(failure==='render'){c.render=()=>{throw Error('loading render failed');};c.loop(0);c.render=()=>{};resolveVisual();}else rejectVisual(Error('post-boot visual refresh failed'));const result=await pending;
const afterFailure={result:result??null,world:c.world.id,playing:c.playing,loadingRun:c.loadingRun,runtimeFailed:c.runtimeFailed,loader,appInert:app.inert,tick:created.sim.tickCount,writes:writes.length};
c.loop(0);c.loop(50);
const output={scope:'actual flow functions; controlled post-boot visual Promise rejection; source world/storage/render are fixtures',mode:'current-main',whilePending,afterFailure,afterFrames:{oldTick:old.sim.tickCount,newTick:created.sim.tickCount,playing:c.playing,loader,appInert:app.inert,writes},steps,errors};

assert.equal(result,false,'a failed candidate never reports load success');assert.equal(loader,'error','the failure recovery stays visible');assert.equal(app.inert,true);assert.equal(committed,0,'failed candidate seed remains unpublished');
assert.equal(old.sim.tickCount,100,'prior world never advances');
assert.equal(c.playing,false,'a failed post-boot world must stop');
assert.equal(c.runtimeFailed,true,'failed new world must not remain checkpoint-healthy');
assert.equal(created.sim.tickCount,whilePending.newTick,'failed new world must not advance after catch');
assert.equal(writes.length,0,'failed new world must not reach the checkpoint writer');

}
});

it('a restore candidate with unavailable hosted input returns false without opening ordinary file intake over rollback',async()=>{const source=fs.readFileSync(new URL('../../web/main.js',import.meta.url),'utf8'),body=source.match(/^async function loadFromUrl[^\n]*\{[\s\S]*?^\}/m)[0];let intake=0;const prior={id:'old'},c:any={world:prior,playing:true,restoring:true,loadingRun:false,runtimeFailed:false,sessionSeed:6,selectedSource:null,localSourceMode:false,frameClock:{reset(){}},document:{documentElement:{dataset:{}}},checkpointRun(){},loadingScreen:{},readResponseBytes(){},setMsg(){},loadHostedPlayFiles:async()=>null,fetch(){},parseStockProfile(){},showSourceFiles(){intake++;},console};vm.runInNewContext(body,c);assert.equal(await c.loadFromUrl(),false);assert.equal(c.world,prior);assert.equal(c.playing,false);assert.equal(c.runtimeFailed,false);assert.equal(intake,0);});
