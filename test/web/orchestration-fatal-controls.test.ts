import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
const source=fs.readFileSync(process.env.SAVE_UI_SOURCE??resolve('web/main.js'),'utf8');
function fixture(){
 const controls=source.match(/^function renderControls\([^\n]*\{[\s\S]*?^\}/m)?.[0];
 const visibility=source.match(/document[.]addEventListener\("visibilitychange",[\s\S]*?\n\}\);/)?.[0];
 const fatal=source.match(/window[.]addEventListener\('game-runtime-error',[^\n]*/)?.[0];
 const loop=source.match(/^function loop[^\n]*\{[\s\S]*?^\}/m)?.[0];
 assert.ok(controls&&visibility&&fatal&&loop);
 const ids=['runState','restoreOverlay','cancelRestore','play','stepBtn','speed','chatInput','chatSend','reset','resumeRun','importRun','saveRun','savedRuns'];
 const nodes:any=Object.fromEntries(ids.map(id=>[id,{disabled:false,textContent:'',dataset:{},inert:false}]));
 nodes.savedRuns.selectedOptions=[{record:{compatible:true}}];
 const callbacks:Record<string,()=>void>={};let steps=0;
 const context:any={world:{sim:{}},playing:true,restoring:false,restoreCancelled:false,runtimeFailed:false,tps:1,frameClock:{reset(){},advance(){return 1;}},$:(id:string)=>nodes[id],document:{hidden:true,querySelectorAll:()=>[],addEventListener:(type:string,fn:()=>void)=>callbacks[type]=fn},window:{addEventListener:(type:string,fn:()=>void)=>callbacks[type]=fn,showErr(){}},requestAnimationFrame(){},render(){},stepN(){steps++;},performance:{now:()=>0}};
 vm.runInNewContext(controls+'\n'+visibility+'\n'+fatal+'\n'+loop,context);
 return {context,nodes,callbacks,steps:()=>steps};
}
it('a fatal game error stays visible and non-resumable across hide, return and later control refresh',()=>{
 const f=fixture();f.callbacks['game-runtime-error']!();f.callbacks.visibilitychange!();f.context.document.hidden=false;f.callbacks.visibilitychange!();f.context.renderControls(f.context.world);
 assert.equal(f.context.runtimeFailed,true);assert.equal(f.nodes.runState.textContent,'오류로 정지');assert.equal(f.nodes.runState.dataset.state,'error');
 for(const id of ['play','stepBtn','speed','chatInput','chatSend'])assert.equal(f.nodes[id].disabled,true,id);
 assert.equal(f.nodes.reset.disabled,false);assert.equal(f.nodes.saveRun.disabled,false);
 f.context.playing=true;f.context.loop(100);assert.equal(f.steps(),0);
});
it('successful new runtime startup can clear the old fatal control state without disabling normal pause and resume',()=>{
 const f=fixture();f.callbacks['game-runtime-error']!();f.context.runtimeFailed=false;f.context.playing=false;f.context.renderControls(f.context.world);
 assert.equal(f.nodes.play.disabled,false);assert.equal(f.nodes.stepBtn.disabled,false);assert.equal(f.nodes.runState.textContent,'일시정지');
 f.context.playing=true;f.context.renderControls(f.context.world);assert.equal(f.nodes.runState.textContent,'진행 중');
});

it('pending mode input keeps save locked through training paint and unlocks after the source click was recorded',()=>{
 const f=fixture();f.context.world.modeDialog={clicked:true,pendingButtonId:635};
 const training=source.match(/^function renderTraining\([^\n]*\{[\s\S]*?^\}/m)?.[0];assert.ok(training);
 const extraNodes:any={trainingOptions:{},casinoTrainingOptions:{},trainingStatus:{},casinoUse:{},casinoTrainingStatus:{}};
 const base=f.context.$;f.context.$=(id:string)=>extraNodes[id]??base(id);
 Object.assign(f.context,{trainingActions:()=>[],gemTowerPlayerState:()=>({life:15,difficulty:1}),gemTowerCasinoState:()=>({stations:[]})});
 Object.assign(f.context.world,{sim:{ledger:{gold:()=>10},pendingTrainings:new Map()},trainingSignature:JSON.stringify([[],15,true,10,undefined,[],[]])});
 vm.runInNewContext(training,f.context);f.context.renderTraining(f.context.world);f.context.renderControls(f.context.world);assert.equal(f.nodes.saveRun.disabled,true);
 f.context.renderTraining(f.context.world);assert.equal(f.nodes.saveRun.disabled,true,'training must not re-enable an unsafe save');
 delete f.context.world.modeDialog.pendingButtonId;f.context.renderTraining(f.context.world);f.context.renderControls(f.context.world);assert.equal(f.nodes.saveRun.disabled,false);
});
