import {it} from 'node:test';
import assert from 'node:assert/strict';
import {qualityFrameForName,roundSlotModels,createNoticeState,approvedButtonMaterial,qualityMaterialForFrame} from '../../web/ui-skin.js';
it('six source grades retain their full name while the two highest grades share the gold frame',()=>{
 const names=['최하급 루비','하급 루비','중급 루비','상급 루비','최상급 루비','퍼펙트 루비'];
 assert.deepEqual(names.map(qualityFrameForName),[0,1,2,3,4,4]);
 assert.equal(qualityFrameForName('완벽한 루비'),4);
 assert.equal(names.at(-1),'퍼펙트 루비');
});
it('round slots preserve source slot numbers, hide stale previous hands at count zero and never infer from a retained roster',()=>{
 const candidates=[{slot:1,id:40,name:'하급 에메랄드',alive:true},{slot:3,id:42,name:'중급 루비',alive:true}];
 const before=structuredClone(candidates);
 const hand=roundSlotModels({round:6,buildCount:3,chosen:false,candidates});
 assert.equal(hand.length,5);assert.equal(hand[0].id,40);assert.equal(hand[1].id,null);assert.equal(hand[2].id,42);
 assert.ok(roundSlotModels({round:7,buildCount:0,chosen:false,candidates}).every(x=>x.id===null));
 assert.deepEqual(candidates,before);
});
it('one notice merges repeated identical events and starts a fresh count after expiry',()=>{
 const notices=createNoticeState(1800);assert.deepEqual(notices.push('저장했습니다',0),{text:'저장했습니다',count:1,until:1800});
 assert.deepEqual(notices.push('저장했습니다',100),{text:'저장했습니다',count:2,until:1900});
 assert.deepEqual(notices.push('조합 완료',200),{text:'조합 완료',count:1,until:2000});
 assert.deepEqual(notices.push('조합 완료',2100),{text:'조합 완료',count:1,until:3900});
});

it('approved button artwork uses all three colors and source disabled overrides a held press',()=>{
 const states=[{}, {pressed:true}, {disabled:true,pressed:true}];
 assert.deepEqual(states.map(state=>approvedButtonMaterial({id:'startGame',primary:true,...state})),['button-gold-normal','button-gold-pressed','button-gold-disabled']);
 assert.deepEqual(states.map(state=>approvedButtonMaterial({id:'castA007',...state})),['button-green-normal','button-green-pressed','button-green-disabled']);
 assert.deepEqual(states.map(state=>approvedButtonMaterial({id:'castA008',...state})),['button-green-normal','button-green-pressed','button-green-disabled']);
 assert.equal(approvedButtonMaterial({id:'researchToggle'}),null);
});
it('the five quality frames use five approved source PNGs without replacing the six source grades',()=>{
 assert.deepEqual([0,1,2,3,4].map(qualityMaterialForFrame),['slot-grey','slot-green','slot-blue','slot-purple','slot-gold']);
 assert.equal(qualityMaterialForFrame(qualityFrameForName('퍼펙트 루비')),'slot-gold');
 assert.equal(qualityMaterialForFrame(qualityFrameForName('최상급 루비')),'slot-gold');
});

it('only one meaningful current action gets gold while pause and close remain neutral',async()=>{
 const skin=await import('../../web/ui-skin.js');assert.equal(skin.primaryActionId({chosen:true,combatActive:true},['castA009','speedCycle']),'speedCycle');assert.equal(skin.primaryActionId({chosen:false},['castA009','speedCycle']),'castA009');assert.equal(skin.primaryActionId({},['startGame','castA009']),'startGame');assert.equal(skin.approvedButtonMaterial({id:'play',primary:true}),null);for(const id of ['drawerClose','cancelPoint','cancelRestore'])assert.equal(skin.approvedButtonMaterial({id}),null);assert.equal(skin.approvedButtonMaterial({id:'reset'}),'button-red-normal');
});

it('the direct research purchase reuses approved green action artwork in normal, pressed and disabled states',()=>{assert.equal(approvedButtonMaterial({id:'quickResearch'}),'button-green-normal');assert.equal(approvedButtonMaterial({id:'quickResearch',pressed:true}),'button-green-pressed');assert.equal(approvedButtonMaterial({id:'quickResearch',pressed:true,disabled:true}),'button-green-disabled');assert.equal(approvedButtonMaterial({id:'quickRecipes'}),null);});
