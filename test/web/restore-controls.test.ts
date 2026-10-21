import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {restoredRunId}=await import(pathToFileURL(resolve('web/run-storage.js')).href);
const {validateInputReplay}=await import(pathToFileURL(resolve('web/gem-actions.js')).href);
const mainSource=process.env.RESTORE_UI_SOURCE??resolve('web/main.js');
const controlIds=['play','stepBtn','speed','chatInput','chatSend','reset','saveRun','resumeRun','importRun'];
function fixture({ended=false,mismatch=false}={}){
 const source=fs.readFileSync(mainSource,'utf8');
 const restore=source.match(/^async function restoreRun\([^\n]*\{[\s\S]*?\n\}/m)?.[0];
 const controls=source.match(/^function renderControls\([^\n]*\{[\s\S]*?\n\}/m)?.[0]??'';
 const renderEnd=source.indexOf('  const over = $("gameOver");');assert.ok(renderEnd>0&&restore);
 const renderStatement=source.slice(0,renderEnd).trimEnd().split('\n').at(-1)!;
 const nodes:any={};for(const id of [...controlIds,'gameApp','battlefield','msg','restoreOverlay','restoreProgressText','cancelRestore','runState'])nodes[id]={disabled:false,textContent:id==='play'?'재개':'',inert:false,dataset:{mode:'race'},focus:()=>{},style:{display:'none'},hidden:true};
 // Existing input-region roots, supplied as native inert targets. #msg and its
 // ancestors are separate observations; actual browser/AT behavior is not mocked.
 const inputAreas=Array.from({length:8},()=>({inert:false}));nodes.researchToggle={focus:()=>{}};nodes.savedRuns={selectedOptions:[{record:{compatible:true}}]};
 const visibility=source.match(/document[.]addEventListener\("visibilitychange",[\s\S]*?\n\}\);/)?.[0];assert.ok(visibility);
 const timers:Array<()=>void>=[],messages:string[]=[],chunks:number[]=[];let onVisibility:()=>void=()=>{};
 let release:()=>void=()=>{},running:Promise<void>|null=null;
 const makeWorld=()=>({sim:{tickCount:0,stateHash:()=> 'abcdef01',getUnit:()=>undefined},sourceVersion:'fixture-source',runtimeCrashes:[],inputLog:[],gameOver:ended?{winner:null}:null});
 const trace={format:'uzmap-ui-input-v1',build:'fixture-build',seed:6,tick:5000,stateHash:mismatch?'fedcba98':'abcdef01',sourceVersion:'fixture-source',sourceState:{round:40,life:100},actions:[],camera:{cx:10,cy:20,zoom:.2},selectedGemId:null};
 const context:any={world:makeWorld(),restoring:false,restoreCancelled:false,playing:true,runtimeFailed:false,performance:{now:()=>0},prevHp:new Map(),prevGold:[10],textTags:[],goldTags:[],lastPos:new Map(),attackFx:[],waveNum:3,prevCreeps:2,waveFlashUntil:0,rectEntered:4,deaths:5,gatePassed:6,renderChatHelp:()=>{},sessionSeed:6,commitSessionSeed:()=>{},contentBuild:'fixture-build',cam:{cx:0,cy:0,zoom:.2},$:(id:string)=>nodes[id],document:{hidden:false,querySelectorAll:()=>inputAreas,addEventListener:(_type:string,callback:()=>void)=>{onVisibility=callback;}},validateInputReplay,restoredRunId,flash:(text:string)=>messages.push(text),setDrawer:()=>{},frameClock:{reset:()=>{}},gemTowerPlayerState:()=>({round:40,life:100}),setTimeout:(resolve:()=>void)=>timers.push(resolve),stepN:(w:any,n:number)=>{w.sim.tickCount+=n;},replayInputBatch:(w:any,t:any,cursor:number,advance:(n:number)=>void,maxTicks:number)=>{const n=Math.min(maxTicks,t.tick-w.sim.tickCount);chunks.push(n);advance(n);return cursor;}};
 const paint=()=>{context.w=context.world;vm.runInNewContext(renderStatement,context);};
 context.render=paint;const originalWorld=context.world,originalCam={...context.cam};
 context.loadFromUrl=async()=>{context.world=makeWorld();context.textTags=[];context.goldTags=[];context.attackFx=[];context.playing=true;paint();await new Promise<void>(resolve=>{release=resolve;});};
 const helpers=['captureRunView','restoreRunView','cancelRestore'].map(name=>source.match(new RegExp('^function '+name+'\\([^\\n]*\\{[\\s\\S]*?\\n\\}','m'))?.[0]??'').join('\n');
 vm.runInNewContext(helpers+'\n'+controls+'\n'+restore+'\n'+visibility,context);
 const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
 const capture=()=>({disabled:Object.fromEntries(controlIds.map(id=>[id,nodes[id].disabled])),label:nodes.play.textContent,inert:inputAreas.map(a=>a.inert),msgInert:nodes.msg.inert,appInert:nodes.gameApp.inert,battlefieldInert:nodes.battlefield.inert,restoring:context.restoring,overlayHidden:nodes.restoreOverlay.hidden,cancelDisabled:nodes.cancelRestore.disabled});
 return {context,trace,nodes,originalWorld,originalCam,messages,chunks,inputAreas,paint,capture,hide(){context.document.hidden=true;onVisibility();},begin(){running=context.restoreRun(trace);},async firstChunk(){release();await settle();paint();return capture();},async finish(){release();for(let i=0;i<100;i++){await settle();if(!context.restoring)break;const timer=timers.shift();assert.ok(timer,'the actual replay loop must yield between chunks');timer();}await running;}};
}
it('load and intermediate render keep restoration controls locked while leaving the progress text and its ancestors outside inert',async()=>{
 const f=fixture();f.begin();const duringLoad=f.capture(),duringChunk=await f.firstChunk();f.hide();const hidden=f.capture();await f.finish();
 for(const phase of [duringLoad,duringChunk,hidden]){assert.ok(Object.values(phase.disabled).every(Boolean));assert.equal(phase.label,'복원 중…');assert.ok(phase.inert.every(Boolean));assert.equal(phase.msgInert,false);assert.equal(phase.appInert,false);assert.equal(phase.battlefieldInert,false);assert.equal(phase.restoring,true);assert.equal(phase.overlayHidden,false);assert.equal(phase.cancelDisabled,false);}
 assert.equal(f.chunks.reduce((a,b)=>a+b,0),5000);assert.ok(f.chunks.every(n=>n<=200));assert.equal(f.context.world.inputLog.length,0);
});
it('only successful strict completion unlocks normal controls and preserves the existing batch-save restriction',async()=>{
 const f=fixture();f.begin();await f.firstChunk();await f.finish();const final=f.capture();
 assert.equal(final.restoring,false);assert.equal(final.overlayHidden,true);assert.ok(Object.values(final.disabled).every(v=>v===false));assert.ok(final.inert.every(v=>v===false));assert.equal(final.label,'재개');assert.equal(f.context.playing,false);assert.match(f.messages.at(-1)??'',/정확히 복원/);assert.equal(f.context.world.sim.tickCount,5000);
 f.context.world.trainingBatch={};f.paint();assert.equal(f.nodes.saveRun.disabled,true);assert.equal(f.nodes.play.disabled,false);
});
it('strict mismatch preserves the previous live game and camera, allowing the player to resume safely',async()=>{
 const f=fixture({mismatch:true});f.begin();await f.finish();const final=f.capture();
 assert.equal(final.restoring,false);assert.ok(final.inert.every(v=>v===false));assert.equal(f.context.world,f.originalWorld);assert.equal(f.context.world.replayMismatch,undefined);assert.deepEqual(f.context.cam,f.originalCam);assert.equal(final.disabled.play,false);assert.equal(final.label,'재개');assert.equal(final.disabled.reset,false);assert.match(f.messages.at(-1)??'',/일치하지 않아/);
});
it('a restored terminal world keeps play and step disabled after finally instead of unconditionally enabling play',async()=>{
 const f=fixture({ended:true});f.begin();await f.finish();const final=f.capture();assert.equal(final.disabled.play,true);assert.equal(final.disabled.stepBtn,true);assert.equal(final.label,'게임 종료');assert.equal(final.disabled.reset,false);assert.ok(final.inert.every(v=>v===false));
});

it('unknown or different save builds are refused before replacing a running world or entering restoration',async()=>{
 for(const [currentBuild,build] of [['fixture-build','previous-combat-build'],['fixture-build',undefined],['fixture-build',null],[null,null],['','']]){
  const f=fixture();f.context.contentBuild=currentBuild;const before=f.context.world;const original=JSON.stringify(f.trace);
  const trace={...f.trace,build};
  const refused=f.context.restoreRun(trace);
  assert.equal(f.context.world,before,'version refusal must preserve the currently running world');
  assert.equal(f.context.playing,true);assert.equal(f.context.restoring,false);assert.deepEqual(f.chunks,[]);
  assert.ok(f.inputAreas.every(a=>!a.inert));assert.equal(f.nodes.play.disabled,false);
  assert.equal(before.replayMismatch,undefined);assert.equal(JSON.stringify(f.trace),original);
  await refused;assert.match(f.messages.at(-1)??'',/게임 버전/);assert.match(f.messages.at(-1)??'',/같은 버전/);
 }
});

 it('cancellation at a yielded boundary returns to the original game without accepting a partial replay',async()=>{
 const f=fixture();f.begin();await f.firstChunk();assert.equal(typeof f.context.cancelRestore,'function');f.context.cancelRestore();await f.finish();assert.equal(f.context.world,f.originalWorld);assert.deepEqual(f.context.cam,f.originalCam);assert.equal(f.context.restoring,false);assert.equal(f.context.playing,false);assert.ok(f.inputAreas.every(a=>!a.inert));assert.equal(f.nodes.play.disabled,false);assert.match(f.messages.at(-1)??'',/취소/);
 });
 it('a failed reload returns to the original world instead of leaving a half-restored game',async()=>{const f=fixture();f.context.loadFromUrl=async()=>{f.context.world=null;throw Error('load failed');};await f.context.restoreRun(f.trace);assert.equal(f.context.world,f.originalWorld);assert.deepEqual(f.context.cam,f.originalCam);assert.equal(f.nodes.play.disabled,false);assert.match(f.messages.at(-1)??'',/load failed/);});

it('rollback invalidates both construction cache layers before repainting the original paused view',async()=>{const f=fixture({mismatch:true});f.originalWorld.buildCellsCheck='before';f.originalWorld.buildCellsView='before';let stalePaint=false;const paint=f.context.render;f.context.render=()=>{if(f.context.world===f.originalWorld&&f.context.world.buildCellsCheck==='before')stalePaint=true;paint();};f.begin();await f.finish();assert.equal(f.context.world,f.originalWorld);assert.equal(stalePaint,false,'the paused view must not skip rebuilding the construction surface');});

it('rollback discards detached training button references so the original producer list is rebuilt',async()=>{const f=fixture({mismatch:true});f.originalWorld.trainingButtons=new Map([[1,{detached:true}]]);let detachedReuse=false;const paint=f.context.render;f.context.render=()=>{if(f.context.world===f.originalWorld&&f.context.world.trainingButtons)detachedReuse=true;paint();};f.begin();await f.finish();assert.equal(f.context.world,f.originalWorld);assert.equal(detachedReuse,false,'buttons from the previous DOM must be reconstructed');});

it('rollback repaints a source dialog without unlocking an already queued selection',async()=>{const f=fixture({mismatch:true});const source=fs.readFileSync(mainSource,'utf8'),start=source.indexOf('  const dialog=w.registry.dialogIds'),end=source.indexOf('  refreshReplayOutput(w);',start);assert.ok(start>0&&end>start);const dialog={id:42,kind:'dialog',data:{message:'choose',visibleTo:[0],buttons:[43]}};f.originalWorld.nativeDialogPendingId=42;f.originalWorld.nativeDialogKey='previous DOM';f.originalWorld.registry={dialogIds:[42]};f.originalWorld.vm={handles:new Map([[42,dialog],[43,{id:43,kind:'button',data:{text:'choice'}}]])};const host={children:[],replaceChildren(){this.children=[];},append(b){this.children.push(b);},querySelector(){return this.children[0];}};f.nodes.sourceDialog={hidden:false};f.nodes.sourceDialogTitle={textContent:''};f.nodes.sourceDialogButtons=host;f.context.document.createElement=()=>({dataset:{},focus(){}});f.context.sourceText=(_w,text)=>text;const paint=f.context.render;f.context.render=(_w,preservePendingDialog=false)=>{paint();if(f.context.world===f.originalWorld){f.context.w=f.originalWorld;f.context.preservePendingDialog=preservePendingDialog;vm.runInNewContext(source.slice(start,end),f.context);}};f.begin();await f.finish();assert.equal(f.context.world,f.originalWorld);assert.equal(f.originalWorld.nativeDialogPendingId,42);assert.equal(host.children[0].disabled,true);});

it('restoration discards invisible replay effects after each bounded batch while preserving the old view for rollback',async()=>{for(const mismatch of [false,true]){const f=fixture({mismatch});const before=f.context.textTags;before.push({old:true});f.context.stepN=(w,n)=>{w.sim.tickCount+=n;for(const key of ['textTags','goldTags','attackFx'])for(let i=0;i<n;i++)f.context[key].push({replay:true});};f.begin();await f.firstChunk();for(const key of ['textTags','goldTags','attackFx'])assert.equal(f.context[key].length,0,key+' cleared at yield');await f.finish();if(mismatch){assert.equal(f.context.textTags,before);assert.equal(before.length,1);}else{for(const key of ['textTags','goldTags','attackFx'])assert.equal(f.context[key].length,0);assert.equal(before.length,1);}}});

it('strict restore carries a saved run identity only on success, while rollback retains the old run',async()=>{for(const mismatch of [false,true]){const f=fixture({mismatch});f.context.world.runId='original-run001';f.trace.runId='restored-run001';f.begin();await f.finish();assert.equal(f.context.world.runId,mismatch?'original-run001':'restored-run001');}});
it('resume stays disabled when the selected preserved save is from another version',()=>{const f=fixture();f.nodes.savedRuns.selectedOptions=[{record:{compatible:false}}];f.paint();assert.equal(f.nodes.resumeRun.disabled,true);assert.equal(f.nodes.play.disabled,false);});

it('actual controls announce running, paused, restoring and terminal display states',()=>{const f=fixture();for(const [playing,restoring,ended,label]of [[true,false,false,'진행 중'],[false,false,false,'일시정지'],[false,true,false,'복원 중'],[false,false,true,'게임 종료']]){f.context.playing=playing;f.context.restoring=restoring;f.context.world.gameOver=ended?{winner:null}:null;f.paint();assert.equal(f.nodes.runState.textContent,label);}});

it('initial unselected mode keeps play and diagnostic stepping disabled until an explicit mode choice',()=>{const f=fixture();f.context.playing=false;f.context.world.modeDialog={clicked:false};f.paint();assert.equal(f.nodes.play.disabled,true);assert.equal(f.nodes.stepBtn.disabled,true);assert.equal(f.nodes.play.textContent,'방식 선택');assert.equal(f.nodes.runState.textContent,'방식 선택');f.context.world.modeDialog.clicked=true;f.context.playing=true;f.paint();assert.equal(f.nodes.play.disabled,false);assert.equal(f.nodes.stepBtn.disabled,false);assert.equal(f.nodes.play.textContent,'일시정지');});

it('failed or cancelled restoration preserves the old fatal lock and original error message',async()=>{
 for(const failure of ['boot','mismatch','cancel']){
  const f=fixture({mismatch:failure==='mismatch'}),load=f.context.loadFromUrl;
  f.context.runtimeFailed=true;f.context.playing=false;f.nodes.msg.innerHTML='<h3>original runtime failure</h3><pre>kept diagnostic</pre>';f.nodes.msg.style.display='flex';f.paint();
  const originalMessage=f.nodes.msg.innerHTML,paint=f.context.render;let retriedBrokenFrame=0;f.context.render=(w:any)=>{if(w===f.originalWorld&&f.context.runtimeFailed){retriedBrokenFrame++;throw Error('must not retry a failed renderer during rollback');}return paint(w);};
  f.context.loadFromUrl=async()=>{f.context.runtimeFailed=false;f.nodes.msg.innerHTML='loading replacement';f.nodes.msg.style.display='flex';if(failure==='boot')throw Error('fixture boot failure');return load();};
  f.begin();if(failure==='cancel'){await f.firstChunk();f.context.cancelRestore();}await f.finish();
  assert.equal(f.context.world,f.originalWorld,failure);assert.equal(f.context.runtimeFailed,true,failure);assert.equal(f.nodes.play.disabled,true,failure);assert.equal(f.nodes.stepBtn.disabled,true,failure);assert.equal(f.nodes.runState.textContent,'오류로 정지',failure);assert.equal(f.nodes.msg.innerHTML,originalMessage,failure);assert.equal(f.nodes.msg.style.display,'flex',failure);assert.equal(f.nodes.reset.disabled,false,failure);assert.equal(retriedBrokenFrame,0,failure);
 }
});
it('a successful strict replacement can clear a previous fatal lock without restoring its obsolete error message',async()=>{
 const f=fixture(),load=f.context.loadFromUrl;f.context.runtimeFailed=true;f.context.playing=false;f.nodes.msg.innerHTML='old error';f.nodes.msg.style.display='flex';
 f.context.loadFromUrl=async()=>{f.context.runtimeFailed=false;return load();};f.begin();await f.finish();assert.notEqual(f.context.world,f.originalWorld);assert.equal(f.context.runtimeFailed,false);assert.equal(f.nodes.play.disabled,false);assert.equal(f.nodes.msg.style.display,'none');
});
