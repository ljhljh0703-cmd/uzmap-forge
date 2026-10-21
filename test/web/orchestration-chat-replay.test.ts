import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {resolve} from 'node:path';
import * as requireActions from '../../web/gem-actions.js';
import {validateInputReplay,replayInputBatch} from '../../web/gem-actions.js';
import {readScriptMap,createSession} from '../../src/runtime/session.ts';
import {createGemTowerSourceDefs} from '../../src/runtime/maps/gemtower.ts';
import {parseUnitAbilityProfile} from '../../src/formats/stock-unit-abilities.ts';
import {parseMiscConstants} from '../../src/formats/misc.ts';
import {GEMTOWER_BALANCE as cfg,GEMTOWER_SOLO_SLOTS} from '../../src/sim/balance/configs/gemtower.ts';
const main=fs.readFileSync(process.env.SAVE_UI_SOURCE??resolve('web/main.js'),'utf8');
const sendChat=main.match(/^function sendChat\([^\n]*\{[\s\S]*?^\}/m)?.[0];
const recordInput=main.match(/^function recordInput\([^\n]*$/m)?.[0];
assert.ok(sendChat&&recordInput);
const source=readScriptMap(new Uint8Array(fs.readFileSync('fixtures/maps/GemTower_Max_7C.w3x')),'map');
const profile=parseUnitAbilityProfile(JSON.parse(fs.readFileSync('fixtures/stock/unit-abilities.json','utf8')));
function start():any{
 const s=createSession(source.ir,{seed:6,defStore:createGemTowerSourceDefs(profile.units,source.ir.objectMods).defStore,stockUnits:profile.units,stockAbilities:profile.abilities,pathing:source.pathing,pathingTextures:profile.pathingTextures,playerSlots:GEMTOWER_SOLO_SLOTS,gc:parseMiscConstants(source.archive.read('war3mapMisc.txt'),cfg.armorTypeColumnOrder,profile.gameplayConstants),bountyMode:cfg.bountyMode,life:cfg.life,researchConfig:cfg.researches});
 const dialog=s.vm.handles.get((s.vm.getGlobal('Ne') as any).v)!;
 return {...s,modeDialog:{dialogId:dialog.id,classicButtonId:dialog.data.buttons[0],raceButtonId:dialog.data.buttons[1],clicked:false},inputLog:[] as any[],pendingBuilds:[],pendingCasts:[]};
}
function step(w:ReturnType<typeof start>,n:number){for(let i=0;i<n;i++){w.sim.step();w.sim.drainEvents();w.vm.drainEvents();}}
function enterRace(w:ReturnType<typeof start>){
 step(w,2);const a={tick:2,kind:'dialog',playerId:0,dialogId:w.modeDialog.dialogId,buttonId:w.modeDialog.raceButtonId};w.inputLog.push(a);w.sim.injectDialogClick(0,a.buttonId);step(w,30);
 const dialog=w.vm.handles.get((w.vm.getGlobalIndexed('MA',1) as any).v)!;const b={tick:32,kind:'dialog',playerId:0,dialogId:dialog.id,buttonId:dialog.data.buttons[0]};w.inputLog.push(b);w.sim.injectDialogClick(0,b.buttonId);step(w,1);
}
function contextRecord(w:any,a:any){w.inputLog.push({tick:w.sim.tickCount,...a});}
function chatContext(world:any,text:string){
 const lines:any[]=[],input={value:text},log={prepend:(line:any)=>lines.unshift(line),innerHTML:''};
 const context:any={world,$:(id:string)=>id==='chatInput'?input:log,document:{createElement:()=>({textContent:''})}};
 vm.runInNewContext(recordInput+'\n'+sendChat,context);
 return {context,lines,input,log};
}
it('paused ordinary source chat survives save and replay at its exact pending-input tick',()=>{
 const original=start();enterRace(original);
 const {context}=chatContext(original,'-길찾기');context.sendChat();
 assert.equal(original.inputLog.at(-1)?.kind,'chat','the actual UI must record the accepted ordinary intent');
 const trace=validateInputReplay({format:'uzmap-ui-input-v1',seed:6,tick:original.sim.tickCount,stateHash:original.sim.stateHash(),actions:original.inputLog});
 const resumed=start();let cursor=0;while(resumed.sim.tickCount<trace.tick||cursor<trace.actions.length)cursor=replayInputBatch(resumed,trace,cursor,(n:number)=>step(resumed,n));
 assert.equal(resumed.sim.stateHash(),trace.stateHash);
 step(original,5);step(resumed,5);assert.equal(resumed.sim.stateHash(),original.sim.stateHash(),'queued chat must still follow the original trigger path after resume');
});
it('chat replay preserves original text, order, exact ticks and older records without chat',()=>{
 const text=' <img src=x onerror=alert(1)> & "한글" '+ '긴문장'.repeat(2000);
 const actions=[{tick:0,kind:'chat',playerId:0,text},{tick:2,kind:'chat',playerId:0,text:''}];
 const trace=validateInputReplay({format:'uzmap-ui-input-v1',seed:6,tick:3,stateHash:'1234abcd',actions});
 const seen:any[]=[],w={sim:{tickCount:0,injectChat:(p:number,t:string)=>seen.push([w.sim.tickCount,p,t])}};
 replayInputBatch(w,trace,0,()=>{w.sim.tickCount++;});
 assert.deepEqual(seen,[[0,0,text],[2,0,'']]);
 assert.deepEqual(validateInputReplay({...trace,actions:[]}).actions,[]);
 for(const bad of [{...actions[0],text:null},{...actions[0],text:1},{...actions[0],playerId:1}])assert.throws(()=>validateInputReplay({...trace,actions:[bad]}));
});
it('the actual chat log renders player text without parsing it as HTML and records the original bytes',()=>{
 const requests:any[]=[],world={sim:{tickCount:7,injectChat:(...args:any[])=>requests.push(args)},inputLog:[] as any[]};
 const text='<img src=x onerror=alert(1)> &lt;svg/onload=alert(2)&gt; "한글"';
 const f=chatContext(world,text);f.context.sendChat();
 assert.deepEqual(requests,[[0,text]]);assert.equal(f.lines.length,1);assert.equal(f.lines[0].textContent,'› '+text);assert.equal(f.log.innerHTML,'');assert.equal(f.input.value,'');
 assert.equal(world.inputLog[0]?.text,text);assert.equal(world.inputLog[0]?.tick,7);
});

it('a queued mode choice cannot be saved until the original two-tick flush records the actual dialog input',()=>{
 const w=start();const calls:any[]=[],messages:string[]=[];let snapshots=0;
 const save=main.match(/^\$\("saveRun"\)[.]onclick[^\n]*$/m)?.[0];assert.ok(save);
 const context:any={world:w,restoring:false,$:()=>({}),flash:(text:string)=>messages.push(text),validateInputReplay:(t:any)=>t,runSnapshot:()=>{snapshots++;return {};},saveRunRecord:()=>{calls.push('save');return {trace:{},key:'slot'};},refreshReplayOutput(){},refreshSavedRuns(){},localStorage:{}};
 const button:any={};context.$=(id:string)=>id==='saveRun'?button:{};vm.runInNewContext(save,context);
 const {requestModeChoice,flushModeChoice}=requireActions;
 w.recordInput=(a:any)=>contextRecord(w,a);
 assert.equal(requestModeChoice(w,'race'),true);
 button.onclick();assert.equal(snapshots,0,'do not claim a restorable save before the source input was recorded');assert.equal(calls.length,0);assert.match(messages.at(-1)??'',/선택|처리/);
 step(w,1);flushModeChoice(w);button.onclick();assert.equal(snapshots,0);
 step(w,1);flushModeChoice(w);assert.equal(w.modeDialog.pendingButtonId,undefined);assert.equal(w.inputLog.at(-1)?.tick,2);
 button.onclick();assert.equal(snapshots,1);assert.equal(calls.length,1);
});
