import {it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as ui from '../../web/play-ui.js';
it('fits every source battle waypoint with padding after phone resize and panel opening',()=>{
 const rects=[{minX:-3872,minY:8160,maxX:-3808,maxY:8224},{minX:-1824,minY:6624,maxX:-1760,maxY:6688},{minX:-2848,minY:5600,maxX:-2784,maxY:5664}];
 for(const [width,height] of [[335,300],[360,340],[390,460],[480,500],[740,220]]){
  const c=ui.battlefieldCamera(rects,width,height,20);
  for(const r of rects)for(const x of [r.minX-128,r.maxX+128])for(const y of [r.minY-128,r.maxY+128]){
   const px=(x-c.cx)*c.zoom+width/2,py=-(y-c.cy)*c.zoom+height/2;
   assert.ok(px>=19.99&&px<=width-19.99&&py>=19.99&&py<=height-19.99,JSON.stringify({width,height,px,py}));
  }
 }
});
it('a field tab switch changes only the view and rejects a third player',()=>{
 const source=readFileSync(new URL('../../web/main.js',import.meta.url),'utf8');const fn=source.match(/function switchField\([^\n]*\{[\s\S]*?\n\}/)?.[0];assert.ok(fn,'real field handler exists');
 let fit=0,render=0;const w:any={viewPlayerId:0,selectedGemId:73,pendingPointAbility:{abilityId:'A02J'},sim:{tickCount:500},inputLog:[{kind:'place'}]};
 const ctx:any={drag:{on:false,cell:null},fitPlayerField:()=>fit++,render:()=>render++,MAX_FIELD_PLAYERS:2};vm.runInNewContext(fn!,ctx);
 const before=JSON.stringify([w.sim,w.inputLog,w.selectedGemId,w.pendingPointAbility]);ctx.switchField(w,1);assert.equal(w.viewPlayerId,1);assert.equal(w.cameraMode,'fit');assert.equal(fit,1);assert.equal(render,1);assert.equal(JSON.stringify([w.sim,w.inputLog,w.selectedGemId,w.pendingPointAbility]),before);
 ctx.switchField(w,2);assert.equal(w.viewPlayerId,1);assert.equal(fit,1);ctx.switchField(w,0);assert.equal(w.viewPlayerId,0);
});
it('the actual placement entry refuses input while observing the other field',()=>{
 const source=readFileSync(new URL('../../web/main.js',import.meta.url),'utf8');const fn=source.match(/function placeTower\([^\n]*\{[\s\S]*?\n\}/)![0];let messages:string[]=[];
 const ctx:any={flash:(s:string)=>messages.push(s)};vm.runInNewContext(fn,ctx);assert.equal(ctx.placeTower({viewPlayerId:1},10,20),false);assert.ok(messages[0].includes('관전'));
});

it('the real field fitter keeps my existing edge towers visible without fitting the other player',()=>{
 const source=readFileSync(new URL('../../web/main.js',import.meta.url),'utf8'),fn=source.match(/function fitPlayerField\([^\n]*\{[\s\S]*?\n\}/)![0];
 const ctx:any={cam:{},cv:{width:390,height:500},battlefieldCamera:ui.battlefieldCamera,battlefieldBounds:ui.battlefieldBounds,gemTowerPlayerGemIds:()=>[],defOf:()=>({meta:{role:{kind:'tower'}}})};vm.runInNewContext(source.match(/function sourceIndexedRect\([^\n]*\{[\s\S]*?\n\}/)![0]+'\n'+fn,ctx);
 const w:any={viewPlayerId:0,fieldRects:[[{minX:-3872,minY:5600,maxX:-1760,maxY:8224}]],knownGemIds:new Set(),sim:{entities:new Map([[1,{id:1,alive:true,owner:0,typeId:'gem',x:-5000,y:7000}],[2,{id:2,alive:true,owner:1,typeId:'gem',x:6000,y:7000}]])}};
 ctx.fitPlayerField(w);const x=(-5000-ctx.cam.cx)*ctx.cam.zoom+195;assert.ok(x>=20&&x<=370,'existing edge tower remains visible');assert.ok(ctx.cam.cx<-3000,'other field does not widen mine');
});

it('context actions hide only a missing ability and retain acquired but temporarily blocked commands',()=>{
 assert.equal(ui.showGemAction({reason:'missing-ability'}),false);
 for(const reason of [null,'prereq-unmet','not-owner','game-over','busy'])assert.equal(ui.showGemAction({reason}),true);
});
