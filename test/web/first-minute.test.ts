import {it} from 'node:test';
import assert from 'node:assert/strict';
import * as ui from '../../web/first-minute.js';
it('keep result reports only rocks actually observed at the other current-hand positions',()=>{
 const hand=[{id:1,x:0,y:0},{id:2,x:128,y:0},{id:3,x:256,y:0}],before=JSON.stringify(hand),rocks=[{x:128,y:0},{x:999,y:999}];
 assert.equal(ui.keepResultNotice('다이아몬드',1,hand,rocks),'다이아몬드를 남겼어요 · 나머지 1개는 바위');assert.equal(ui.keepResultNotice('에메랄드',1,hand,[]),'에메랄드를 남겼어요');assert.equal(JSON.stringify(hand),before);
});

function startup(){
 const dialogs=new Map([[10,{id:10,kind:'dialog',data:{buttons:[11,12,13],visibleTo:[]}}],[11,{kind:'button',data:{text:'이지 [레벨 코드 10이하]'}}],[12,{kind:'button',data:{text:'노멀 [레벨 코드 90이하]'}}],[13,{kind:'button',data:{text:'하드 [레벨 코드 90이상]'}}]]),orders:any[]=[],log:any[]=[];
 const w:any={vm:{handles:dialogs,getGlobalIndexed:(name:string,index:number)=>({t:'handle',v:name==='MA'&&index===1?10:null})},sim:{tickCount:0,injectDialogClick:(playerId:number,buttonId:number)=>orders.push({playerId,buttonId})},modeDialog:{dialogId:20,classicButtonId:21,raceButtonId:22,clicked:false},recordInput:(a:any)=>log.push(a)};
 return {w,dialogs,orders,log};
}
it('startup exposes the original three button identities with friendly names and no source level codes',()=>{
 const f=startup(),before=JSON.stringify([...f.dialogs]);assert.deepEqual(ui.sourceDifficultyChoices(f.w).map(c=>[c.label,c.buttonId]),[['쉬움',11],['보통',12],['어려움',13]]);assert.equal(JSON.stringify([...f.dialogs]),before);assert.equal(ui.sourceDifficultyLabel(f.w,10,12,'old'),'보통');assert.equal(ui.sourceDifficultyLabel(f.w,99,12,'other'),'other');
});
it('one startup selection queues ordinary source choices, waits for visible difficulty and injects it once',()=>{
 const f=startup();assert.equal(ui.requestStartupChoice(f.w,'race',0),true);assert.equal(f.w.modeDialog.pendingButtonId,22);assert.deepEqual(f.orders,[]);assert.equal(ui.advanceStartupChoice(f.w),false);delete f.w.modeDialog.pendingButtonId;assert.equal(ui.advanceStartupChoice(f.w),false);f.dialogs.get(10).data.visibleTo=[0];assert.equal(ui.advanceStartupChoice(f.w),true);assert.deepEqual(f.orders,[{playerId:0,buttonId:11}]);assert.deepEqual(f.log,[{kind:'dialog',playerId:0,buttonId:11,dialogId:10}]);assert.equal(ui.advanceStartupChoice(f.w),false);
});
it('invalid or duplicate startup choices dispatch no source input',()=>{
 const f=startup();assert.equal(ui.requestStartupChoice(f.w,'race',9),false);assert.equal(f.w.modeDialog.clicked,false);assert.equal(ui.requestStartupChoice(f.w,'classic',2),true);assert.equal(ui.requestStartupChoice(f.w,'race',0),false);assert.deepEqual(f.orders,[]);
});

it('the source creates difficulty buttons at its own delayed timer, so UI choice waits without inventing IDs',()=>{
 const f=startup();f.dialogs.get(10).data.buttons=[];assert.equal(ui.requestStartupChoice(f.w,'race',0),true);delete f.w.modeDialog.pendingButtonId;assert.equal(ui.advanceStartupChoice(f.w),false);f.dialogs.get(10).data.buttons=[11,12,13];f.dialogs.get(10).data.visibleTo=[0];assert.equal(ui.advanceStartupChoice(f.w),true);assert.equal(f.orders[0].buttonId,11);
});

it('keep feedback is immediate only after the cast and all current-hand source conversions are observed',()=>{
 const request={abilityId:'A009',unitId:1,spellTick:10,hand:[{id:1,x:0,y:0},{id:2,x:128,y:0}]},kept={id:1,alive:true,owner:0};const input={request,kept,chosen:true,name:'루비',rocks:[{x:128,y:0}]};assert.equal(ui.completedKeepNotice(input),'루비를 남겼어요 · 나머지 1개는 바위');assert.equal(ui.completedKeepNotice({...input,rocks:[]}),null);assert.equal(ui.completedKeepNotice({...input,chosen:false}),null);assert.equal(ui.completedKeepNotice({...input,kept:{...kept,owner:9}}),null);assert.equal(ui.completedKeepNotice({...input,request:{...request,spellTick:undefined}}),null);
});
