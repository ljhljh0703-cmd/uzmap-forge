import {it} from 'node:test';
import assert from 'node:assert/strict';
import {playerCamera,keyboardBuildPoint} from '../../web/play-ui.js';
it('centers the source player start intersection and nearby build cells in narrow and wide battlefields',()=>{
 for(const [width,height] of [[360,420],[600,530],[1440,680]]){
  const b={x:-2816,y:6656};const c=playerCamera(b,width,height);assert.equal(c.cx,b.x);assert.equal(c.cy,b.y);
  for(const p of [b,{x:b.x+384,y:b.y+384},{x:b.x-384,y:b.y-384}]){
   const sx=(p.x-c.cx)*c.zoom+width/2,sy=-(p.y-c.cy)*c.zoom+height/2;
   assert.ok(sx>=24&&sx<=width-24&&sy>=24&&sy<=height-24,JSON.stringify({width,height,sx,sy}));
  }
  assert.deepEqual(b,{x:-2816,y:6656});
 }
});
it('keyboard building uses the same two-cell grid centres as pointer input without changing the world',()=>{
 const pm={originX:-8192,originY:-8192,cellSize:32};const b={x:-2816,y:6656};
 const p=keyboardBuildPoint(pm,b,null,'ArrowRight');
 assert.equal((p.x-pm.originX)/32%2,.5);assert.equal((p.y-pm.originY)/32%2,.5);
 const q=keyboardBuildPoint(pm,b,p,'ArrowRight');assert.equal(q.x-p.x,64);assert.equal(q.y,p.y);
 const up=keyboardBuildPoint(pm,b,q,'ArrowUp');assert.equal(up.y-q.y,64);
});
it('attack text reflects the actual one-sided roll and fixed-step cooldown instead of inventing a plus/minus range',async()=>{
 const {attackDisplay}=await import('../../web/play-ui.js');
 assert.deepEqual(attackDisplay({dmgBase:17,dmgSpread:6,cooldownTicks:20},1/20),{damage:'17 ~ 23',interval:'1.00초'});
 assert.deepEqual(attackDisplay({dmgBase:22,dmgSpread:0,cooldownTicks:10},1/20),{damage:'22',interval:'0.50초'});
 assert.deepEqual(attackDisplay(null,1/20),{damage:'—',interval:'—'});
});

it('keyboard construction uses the source footprint when supplied',async()=>{
 const {keyboardBuildPoint}=await import('../../web/play-ui.js');
 const pm={originX:0,originY:0,cellSize:32};
 const p=keyboardBuildPoint(pm,{x:0,y:0},null,'',4);
 const next=keyboardBuildPoint(pm,{x:0,y:0},p,'ArrowRight',4);
 assert.equal(next.x-p.x,128);assert.equal((p.x-48)%128,0);assert.equal((p.y-48)%128,0);
});

it('self armor keeps its signed source value and is never mislabeled as poison',async()=>{
 const {combatEffectLabels}=await import('../../web/play-ui.js');
 const labels=combatEffectLabels([{kind:'selfArmor',flatBonus:-25},{kind:'selfArmor',flatBonus:10}],1/20);
 assert.ok(labels[0].includes('-25'));assert.ok(labels[1].includes('+10'));
 assert.ok(labels.every((s:string)=>!/(NaN|undefined|독)/.test(s)));
});

it('enemy movement aura labels preserve nominal percent and radius without poison fallback',async()=>{
 const {combatEffectLabels}=await import('../../web/play-ui.js');const label=combatEffectLabels([{kind:'enemySlowAura',slowPm:800,radiusU:500,targetsMask:3}],1/20)[0];
 assert.ok(label.includes('80%')&&label.includes('500'));assert.ok(!/(NaN|undefined|독)/.test(label));
});

it('upgrade and combination conditions explain source validation without inventing recipes or affordable costs',async()=>{const ui=await import('../../web/play-ui.js');assert.match(ui.upgradeConditionText('insufficient-gold',0),/골드/);assert.match(ui.upgradeConditionText('not-owner',9),/남긴 뒤/);assert.match(ui.upgradeConditionText('prereq-unmet',0),/보석이나 연구/);assert.equal(ui.upgradeConditionText(null,0),'강화 가능');const actions=[{abilityId:'A007',label:'보석 조합',disabled:false,reason:null},{abilityId:'A00R',label:'스페셜 조합',disabled:true,reason:'missing-ability'}];const before=JSON.stringify(actions);assert.deepEqual(ui.gemActionConditions(actions),['보석 조합 · 사용 가능']);assert.equal(JSON.stringify(actions),before);assert.match(ui.gemActionConditions([{...actions[0],disabled:true,reason:'not-owner'}])[0],/조종/);});

it('range is expressed in actual placement cells without changing the supplied source distance',async()=>{
 const ui=await import('../../web/play-ui.js');assert.equal(ui.rangeInBuildCells(600,128),'4.7칸');assert.equal(ui.rangeInBuildCells(600,64),'9.4칸');assert.equal(ui.rangeInBuildCells(0,128),'0칸');assert.equal(ui.rangeInBuildCells(undefined,128),'—');assert.equal(ui.rangeInBuildCells(600,0),'—');
});
