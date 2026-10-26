import * as domState from '../../web/dom-state.js';
/** Standalone review regression. Can also be copied to test/web/*.test.ts unchanged.
 * Only a synthetic map is used; no product or private original files are written. */
import {sourceDifficultyLabel} from '../../web/first-minute.js';
import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createSession} from '../../src/runtime/session.ts';
import {DefStore} from '../../src/sim/def-store.ts';
import {makeNeutralGameConstants} from '../../src/sim/balance/config.ts';
import {validateInputReplay,replayInputBatch} from '../../web/gem-actions.js';

const main=fs.readFileSync(new URL('../../web/main.js',import.meta.url),'utf8');
const handlerStart=main.indexOf('$("sourceDialogButtons").addEventListener');
const handlerEnd=main.indexOf('$("sourceDialog").addEventListener',handlerStart);
const clickSource=main.slice(handlerStart,handlerEnd);
const paintStart=main.indexOf('  const dialog=w.registry.dialogIds');
const paintEnd=main.indexOf('  refreshReplayOutput(w);',paintStart);
const paintSource=main.slice(paintStart,paintEnd);
const successStart=main.indexOf('  world.runId=restoredRunId(trace)');
const successEnd=main.indexOf(' }catch(error)',successStart);
const finalRestoreRender=main.slice(successStart,successEnd).match(/render\(world(?:,true)?\)/)?.[0];
assert.ok(handlerStart>0&&paintStart>0&&finalRestoreRender,'actual source surfaces must exist');

function start(reopen=false){
 const source=`globals
dialog d=null
button first=null
button second=null
integer one=0
integer two=0
endglobals
function Pick takes nothing returns nothing
if GetClickedButton()==first then
set one=one+1
else
set two=two+1
endif
${reopen?'call TriggerSleepAction(.1)\ncall DialogDisplay(Player(0),d,true)':''}
endfunction
function main takes nothing returns nothing
local trigger t=CreateTrigger()
set d=DialogCreate()
set first=DialogAddButton(d,"one",0)
set second=DialogAddButton(d,"two",0)
call TriggerRegisterDialogEvent(t,d)
call TriggerAddAction(t,function Pick)
call DialogDisplay(Player(0),d,true)
endfunction`;
 const ir={irVersion:1,info:{name:'pending source dialog',author:'',suggestedPlayers:'1',playableWidth:1,playableHeight:1,formatVersion:25},terrain:{tileset:'A',width:1,height:1,tiles:[{ground:0,height:0,waterHeight:null,flags:0}]},placedUnits:[],objectMods:[],regions:[],script:{source,nativesUsed:{}},meta:{sourceFile:'synthetic',fileInventory:[],parsedAt:''}};
 return {...createSession(ir,{seed:6,defStore:new DefStore(),gc:makeNeutralGameConstants(),bountyMode:'script'}),inputLog:[]};
}
function surface(world){
 const host={children:[],replaceChildren(){this.children=[];},append(b){this.children.push(b);},querySelector(){return this.children[0];},addEventListener(_kind,fn){this.click=fn;}};
 const nodes={sourceDialog:{},sourceDialogTitle:{},sourceDialogButtons:host};
 const context={world,w:world,preservePendingDialog:false,sourceDifficultyLabel:(_w,d,b,f)=>f,$:id=>nodes[id],sourceText:(_w,text)=>text,document:{createElement:()=>({dataset:{},focus(){}})},recordInput:(w,a)=>w.inputLog.push({tick:w.sim.tickCount,...a}),render(){}};
 vm.runInNewContext(clickSource,Object.assign(context,domState));
 return {context,host,paint(preserve=false){context.preservePendingDialog=preserve;vm.runInNewContext("(()=>{\n"+paintSource+"\n})()",Object.assign(context,domState));},paintRestored(){context.render=(w,preserve)=>{assert.equal(w,world);this.paint(preserve);};vm.runInNewContext(finalRestoreRender,Object.assign(context,domState));},click(id){const d=world.vm.getGlobal('d').v;host.click({target:{closest:()=>({dataset:{dialogId:String(d),dialogButton:String(id)}})}});}};
}
function tick(w,n=1,ui){for(let i=0;i<n;i++){w.sim.step();ui?.paint();}}
function saveTrace(w){return validateInputReplay({format:'uzmap-ui-input-v1',seed:6,tick:w.sim.tickCount,stateHash:w.sim.stateHash(),actions:w.inputLog});}
function replay(trace,reopen=false,mode=false){const w=start(reopen);if(mode)w.modeDialog={dialogId:w.vm.getGlobal('d').v,classicButtonId:-1,raceButtonId:w.vm.getGlobal('first').v,clicked:false};let cursor=0;while(w.sim.tickCount<trace.tick||cursor<trace.actions.length)cursor=replayInputBatch(w,trace,cursor,n=>tick(w,n));w.inputLog=trace.actions.map(a=>({...a}));assert.equal(w.sim.stateHash(),trace.stateHash);return w;}

it('final-tick queued native dialog preserves the ordinary input lock through the actual final restore render',()=>{
 const original=start(),oldUI=surface(original);tick(original,2,oldUI);oldUI.click(original.vm.getGlobal('first').v);
 const trace=saveTrace(original),resumed=replay(trace),newUI=surface(resumed);newUI.paintRestored();
 assert.equal(resumed.nativeDialogPendingId,resumed.vm.getGlobal('d').v);
 assert.ok(newUI.host.children.every(b=>b.disabled),'saved pending choice remains touch-locked');
 oldUI.click(original.vm.getGlobal('second').v);newUI.click(resumed.vm.getGlobal('second').v);tick(original);tick(resumed);
 assert.equal(original.vm.getGlobal('one').v,1);assert.equal(original.vm.getGlobal('two').v,0);
 assert.equal(resumed.vm.getGlobal('one').v,1);assert.equal(resumed.vm.getGlobal('two').v,0);
 assert.equal(resumed.inputLog.length,original.inputLog.length);
});

it('an earlier processed choice does not leave the same dialog falsely locked when the source reopens it',()=>{
 const original=start(true),oldUI=surface(original);tick(original,2,oldUI);oldUI.click(original.vm.getGlobal('first').v);tick(original,3,oldUI);
 assert.equal(original.sim.tickCount,5);assert.equal(original.nativeDialogPendingId,null);
 const trace=saveTrace(original),resumed=replay(trace,true),newUI=surface(resumed);newUI.paintRestored();
 assert.equal(resumed.nativeDialogPendingId??null,null);assert.ok(newUI.host.children.every(b=>!b.disabled));
 newUI.click(resumed.vm.getGlobal('second').v);tick(resumed);assert.equal(resumed.vm.getGlobal('two').v,1);
});

it('other ordinary final-tick inputs after the choice do not clear its pending native-dialog lock',()=>{
 const original=start(),oldUI=surface(original);tick(original,2,oldUI);oldUI.click(original.vm.getGlobal('first').v);
 original.sim.injectChat(0,'ordinary');original.inputLog.push({tick:2,kind:'chat',playerId:0,text:'ordinary'});
 const trace=saveTrace(original),resumed=replay(trace),newUI=surface(resumed);newUI.paintRestored();
 assert.equal(resumed.nativeDialogPendingId,resumed.vm.getGlobal('d').v);assert.ok(newUI.host.children.every(b=>b.disabled));
});

it('the final-tick initial mode click keeps its existing mode state without becoming a native dialog lock',()=>{
 const original=start(),oldUI=surface(original);tick(original,2,oldUI);oldUI.click(original.vm.getGlobal('first').v);
 const resumed=replay(saveTrace(original),false,true),newUI=surface(resumed);newUI.paintRestored();
 assert.equal(resumed.modeDialog.clicked,true);assert.equal(resumed.nativeDialogPendingId,null);
});
