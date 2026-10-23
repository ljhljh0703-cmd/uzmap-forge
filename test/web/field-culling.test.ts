import {it} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';import * as ui from '../../web/play-ui.js';import {drawCreepHealth,drawAirborneMark} from '../../web/field-art.js';
import {drawMineCreep} from '../../web/field-units.js';
const source=readFileSync(new URL('../../web/main.js',import.meta.url),'utf8');
it('points outside the field never become visible merely because a large sprite overlaps it',()=>{
 const b={minX:0,minY:0,maxX:100,maxY:100};
 for(const p of [{x:-.01,y:50},{x:100.01,y:50},{x:50,y:-.01},{x:50,y:100.01},{x:NaN,y:50}])assert.equal(ui.pointInBattlefield(p,b),false);
 for(const p of [{x:0,y:0},{x:50,y:50},{x:100,y:100}])assert.equal(ui.pointInBattlefield(p,b),true);
 assert.equal(ui.pointInBattlefield({x:0,y:0},undefined),false);
});
it('the actual creep renderer rejects approach/return/other-field centres at every fitted scale, preserving global counts and entities',()=>{
 const fn=source.match(/^function renderCreeps\([^\n]*\{[\s\S]*?^\}/m)?.[0];assert.ok(fn,'one real creep renderer owns sprite and health-bar visibility');
 for(const scale of [.03,.08,.3]){
  const draws:any[]=[],bars:any[]=[],entities=[{id:1,typeId:'n001',owner:11,alive:true,x:50,y:50,hp:50,hpMax:100,orderX:51},{id:2,typeId:'n001',owner:11,alive:true,x:-.01,y:50,hp:50,hpMax:100,orderX:51},{id:3,typeId:'n001',owner:11,alive:true,x:200,y:50,hp:50,hpMax:100,orderX:51},{id:4,typeId:'n001',owner:11,alive:false,x:50,y:50,hp:0,hpMax:100,orderX:51},{id:5,typeId:'n001',owner:0,alive:true,x:50,y:50,hp:50,hpMax:100,orderX:51}];
  const before=JSON.stringify(entities),context:any={drawMineCreep,drawCreepHealth,drawAirborneMark,ctx:{save(){},restore(){},fillRect:(...a:any[])=>bars.push(a)},sprites:{get:()=>({spec:{frame:{x:0,y:0,w:128,h:128}}}),draw:(...a:any[])=>{draws.push(a);return true;}},W2SX:(x:number)=>x*scale,W2SY:(y:number)=>y*scale,clamp:(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n)),pointInBattlefield:ui.pointInBattlefield,creepVisualPresentation:ui.creepVisualPresentation,defOf:()=>({movementType:'foot'}),GEMTOWER_BALANCE:{roleTable:{n001:{kind:'creep',band:'ground'}}},reducedMotion:{matches:true}};
  vm.runInNewContext(fn!,context);const w={viewBounds:{minX:0,minY:0,maxX:100,maxY:100},pm:{cellSize:32},sim:{tickCount:10,entities:new Map(entities.map(e=>[e.id,e]))}};
  assert.equal(context.renderCreeps(w,128*scale,scale),3,'offscreen simulation count must remain intact');assert.equal(draws.length,1,'off-field sprite must not be submitted');assert.equal(draws[0][2],50*scale);assert.equal(bars.length,9,'only the on-field damaged creep has one outline, five background and three filled segments');assert.equal(JSON.stringify(entities),before);
 }
});
