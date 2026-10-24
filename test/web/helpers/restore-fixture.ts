import {trainingInterruptionText} from '../../../web/play-ui.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const {restoredRunId,isRunCompatible}=await import(pathToFileURL(resolve('web/run-storage.js')).href);
const {validateInputReplay}=await import(pathToFileURL(resolve('web/gem-actions.js')).href);
const mainSource=process.env.RESTORE_UI_SOURCE??resolve('web/main.js');
const controlIds=['play','stepBtn','speed','chatInput','chatSend','reset','saveRun','resumeRun','importRun'];
export function restoreFixture({ended=false,mismatch=false}={}){
 const source=fs.readFileSync(mainSource,'utf8');
 const restore=source.match(/^async function restoreRun\([^\n]*\{[\s\S]*?\n\}/m)?.[0];
 const controls=source.match(/^function renderControls\([^\n]*\{[\s\S]*?\n\}/m)?.[0]??'';
 const renderEnd=source.indexOf('  const over = $("gameOver");');assert.ok(renderEnd>0&&restore);
 // Select the actual control call by identity; later visual updates may follow it.
 const renderStatement=source.match(/^  renderControls\(w\);$/m)?.[0];assert.ok(renderStatement);
 const nodes:any={};for(const id of [...controlIds,'gameApp','battlefield','msg','restoreOverlay','restoreProgressText','cancelRestore','runState'])nodes[id]={disabled:false,textContent:id==='play'?'재개':'',inert:false,dataset:{mode:'race'},focus:()=>{},style:{display:'none'},hidden:true};
 // Existing input-region roots, supplied as native inert targets. #msg and its
 // ancestors are separate observations; actual browser/AT behavior is not mocked.
 const message=nodes.msg;message.childNodes=[];message.replaceChildren=(...items:any[])=>{message.childNodes=items;};
 Object.defineProperty(message,'innerHTML',{get:()=>message.childNodes.map((node:any)=>node.html).join(''),set:(html:string)=>{message.childNodes=html?[{html}]:[];}});
 const inputAreas=Array.from({length:8},()=>({inert:false}));nodes.researchToggle={focus:()=>{}};nodes.savedRuns={selectedOptions:[{record:{compatible:true}}]};
 const visibility=source.match(/document[.]addEventListener\("visibilitychange",[\s\S]*?\n\}\);/)?.[0];assert.ok(visibility);
 const timers:Array<()=>void>=[],messages:string[]=[],chunks:number[]=[];let onVisibility:()=>void=()=>{};
 let release:()=>void=()=>{},running:Promise<void>|null=null;
 const makeWorld=()=>({sim:{tickCount:0,stateHash:()=> 'abcdef01',getUnit:()=>undefined},sourceVersion:'fixture-source',runtimeCrashes:[],inputLog:[],gameOver:ended?{winner:null}:null});
 const trace={format:'uzmap-ui-input-v1',build:'aaaaaaaaaaaaaaaa',seed:6,tick:5000,stateHash:mismatch?'fedcba98':'abcdef01',sourceVersion:'fixture-source',sourceState:{round:40,life:100},actions:[],camera:{cx:10,cy:20,zoom:.2},selectedGemId:null};
 const context:any={lifeHud:{clear(){}},world:makeWorld(),restoring:false,restoreCancelled:false,playing:true,runtimeFailed:false,loadingRun:false,replayBuild:null,checkpointRun(){},isRunCompatible,performance:{now:()=>0},prevHp:new Map(),prevGold:[10],textTags:[],goldTags:[],lastPos:new Map(),attackFx:[],waveNum:3,prevCreeps:2,waveFlashUntil:0,rectEntered:4,deaths:5,gatePassed:6,renderChatHelp:()=>{},sessionSeed:6,commitSessionSeed:()=>{},contentBuild:'aaaaaaaaaaaaaaaa',cam:{cx:0,cy:0,zoom:.2},$:(id:string)=>nodes[id],document:{hidden:false,querySelectorAll:()=>inputAreas,addEventListener:(_type:string,callback:()=>void)=>{onVisibility=callback;}},validateInputReplay,restoredRunId,flash:(text:string)=>messages.push(text),setDrawer:()=>{},frameClock:{reset:()=>{}},gemTowerPlayerState:()=>({round:40,life:100}),setTimeout:(resolve:()=>void)=>timers.push(resolve),stepN:(w:any,n:number)=>{w.sim.tickCount+=n;},replayInputBatch:(w:any,t:any,cursor:number,advance:(n:number)=>void,maxTicks:number)=>{const n=Math.min(maxTicks,t.tick-w.sim.tickCount);chunks.push(n);advance(n);return cursor;}};
 const paint=()=>{context.w=context.world;
 vm.runInNewContext(renderStatement,context);};
 context.render=paint;const originalWorld=context.world,originalCam={...context.cam};
 context.loadFromUrl=async()=>{context.world=makeWorld();context.textTags=[];context.goldTags=[];context.attackFx=[];context.playing=true;paint();await new Promise<void>(resolve=>{release=resolve;});};
 context.trainingInterruptionText=trainingInterruptionText;context.drag={on:false};const interruption=['clearPlacement','interruptUiOrders'].map(name=>source.match(new RegExp('^function '+name+'\\([^\\n]*\\{[\\s\\S]*?\\n\\}','m'))?.[0]??'').join('\n');
 const helpers=['captureRunView','restoreRunView','cancelRestore'].map(name=>source.match(new RegExp('^function '+name+'\\([^\\n]*\\{[\\s\\S]*?\\n\\}','m'))?.[0]??'').join('\n');
 vm.runInNewContext(interruption+'\n'+helpers+'\n'+controls+'\n'+restore+'\n'+visibility,context);
 const settle=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
 const capture=()=>({disabled:Object.fromEntries(controlIds.map(id=>[id,nodes[id].disabled])),label:nodes.play.textContent,inert:inputAreas.map(a=>a.inert),msgInert:nodes.msg.inert,appInert:nodes.gameApp.inert,battlefieldInert:nodes.battlefield.inert,restoring:context.restoring,overlayHidden:nodes.restoreOverlay.hidden,cancelDisabled:nodes.cancelRestore.disabled});
 return {source,context,trace,nodes,originalWorld,originalCam,messages,chunks,inputAreas,paint,capture,hide(){context.document.hidden=true;onVisibility();},begin(options?:unknown){running=context.restoreRun(trace,options);},async firstChunk(){release();await settle();paint();return capture();},async finish(){release();for(let i=0;i<100;i++){await settle();if(!context.restoring)break;const timer=timers.shift();assert.ok(timer,'the actual replay loop must yield between chunks');timer();}await running;}};
}
