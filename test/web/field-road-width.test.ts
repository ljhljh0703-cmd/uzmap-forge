import {it} from 'node:test';
import assert from 'node:assert/strict';
import {drawGroundRoute} from '../../web/field-ground.js';
import {fieldGroundPlan,drawFieldGround,terrainKind} from '../../web/field-art.js';
const atlas=Object.freeze({image:Object.freeze({b1:true}),spec:Object.freeze({frame:Object.freeze({x:20,y:30,w:160,h:160})})});
function roadContext(){
 const calls:any[]=[];return {calls,ctx:{save(){},restore(){},beginPath(){},closePath(){},moveTo(...v){calls.push(['move',...v]);},lineTo(...v){calls.push(['line',...v]);},arc(...v){calls.push(['arc',...v]);},clip(){calls.push(['clip']);},translate(...v){calls.push(['translate',...v]);},rotate(a){calls.push(['rotate',a]);},drawImage(...v){calls.push(['draw',...v]);}}};
}
it('requested dirt width matches a 30px ground picture rather than a projected 4.8px navigation cell',()=>{
 const points=Object.freeze([Object.freeze({x:0,y:0}),Object.freeze({x:32,y:0}),Object.freeze({x:64,y:0})]),preview=Object.freeze({status:'open',flightPredicted:false,points}),before=JSON.stringify(preview),{ctx,calls}=roadContext();
 const n=drawGroundRoute(ctx,{preview,project:p=>({x:10+p.x*.15,y:20-p.y*.15}),cellSize:32,widthPixels:30,sprites:{get:()=>atlas}} as any);
 assert.ok(n>0);const draws=calls.filter(c=>c[0]==='draw');assert.ok(draws.length>0);assert.ok(draws.every(c=>c.at(-1)===30),'actual dirt texture width is the requested screen width');
 assert.ok(draws.every(c=>c[4]<160),'sample only the dirt interior, not the green outer shoulders');
 assert.ok(calls.some(c=>c[0]==='clip'),'continuous corridor is clipped at its actual centers');assert.equal(JSON.stringify(preview),before);
});
it('wide diagonal road follows the exact projected route and keeps blocked partial endpoints unchanged',()=>{
 const points=Object.freeze([Object.freeze({x:-16,y:32}),Object.freeze({x:16,y:0}),Object.freeze({x:48,y:-32})]),preview=Object.freeze({status:'blocked',flightPredicted:false,points}),before=JSON.stringify(preview),{ctx,calls}=roadContext();
 drawGroundRoute(ctx,{preview,project:p=>({x:p.x/2,y:-p.y/2}),cellSize:32,widthPixels:46,sprites:{get:()=>atlas}} as any);
 const angles=calls.filter(c=>c[0]==='rotate').map(c=>c[1]);assert.ok(angles.length>0&&angles.every(a=>Math.abs(a-Math.PI/4)<1e-12));
 assert.ok(calls.filter(c=>c[0]==='draw').every(c=>c.at(-1)===46));
 const ends=calls.filter(c=>c[0]==='arc').map(c=>[c[1],c[2]]);assert.ok(ends.some(p=>p[0]===-8&&p[1]===-16));assert.ok(ends.some(p=>p[0]===24&&p[1]===16));assert.equal(JSON.stringify(preview),before);
});
it('wide road refuses airborne, invalid, nonfinite or zero-width requests without procedural art',()=>{
 for(const extra of [{widthPixels:0},{widthPixels:NaN},{widthPixels:30,flightPredicted:true},{widthPixels:30,status:'invalid'},{widthPixels:30,points:[{x:NaN,y:0},{x:1,y:2}]}]){
  const {ctx,calls}=roadContext(),preview={status:'open',points:[{x:0,y:0},{x:32,y:0}],...extra};
  const n=drawGroundRoute(ctx,{preview,project:p=>p,cellSize:32,widthPixels:extra.widthPixels,sprites:{get:()=>atlas}} as any);assert.equal(n,0);assert.equal(calls.length,0);
 }
});
const bounds={minX:0,minY:0,maxX:128,maxY:32};
const makeGrid=()=>({width:4,height:1,cellSize:32,originX:16,originY:16,cells:new Uint8Array([8,8,2,0])});
const landmarkRects=Object.freeze([Object.freeze({minX:0,minY:0,maxX:31,maxY:32}),Object.freeze({minX:64,minY:0,maxX:95,maxY:32})]);
it('landmark surface selection changes no source classes, no-build flags or ordinary walls',()=>{
 const grid=makeGrid(),before=[...grid.cells],plan=fieldGroundPlan(grid,bounds,{landmarkRects} as any);
 assert.equal(plan.runs.filter(r=>r.landmark).length,1);assert.equal(plan.runs.find(r=>r.col===0).kind,'path');assert.equal(plan.runs.find(r=>r.col===1).landmark,false);assert.equal(plan.runs.find(r=>r.col===2).kind,'wall');assert.equal(plan.runs.find(r=>r.col===2).landmark,false);
 assert.equal(terrainKind(grid.cells[0]),'path');assert.equal(terrainKind(grid.cells[2]),'wall');assert.deepEqual([...grid.cells],before);
});
it('localized landmark grass is opaque, ordinary source paving remains, and new masks invalidate the cache',()=>{
 const old=(globalThis as any).document,grass=Array.from({length:4},(_,i)=>({i})),stone={stone:true},calls:any[]=[],stack:any[]=[];
 const paint:any={globalAlpha:1,save(){stack.push(this.globalAlpha);},restore(){this.globalAlpha=stack.pop();},beginPath(){},rect(){},clip(){},fillRect(){},drawImage(image,...args){calls.push({image,alpha:this.globalAlpha,args});}};
 let canvases=0;(globalThis as any).document={createElement:()=>{canvases++;return {getContext:()=>paint};}};
 const ctx:any={save(){},restore(){},beginPath(){},rect(){},clip(){},drawImage(){}};
 const sprites={get:key=>({image:key==='terrain:stone'?stone:grass[Number(key.at(-1))],spec:{frame:{x:0,y:0,w:128,h:128}}})};
 try{
  const grid=makeGrid(),options={grid,bounds,project:p=>p,sprites,landmarkRects};drawFieldGround(ctx,options as any);
  assert.ok(calls.some(c=>grass.includes(c.image)&&c.alpha===1),'opaque real grass covers the obsolete base raster');assert.ok(calls.some(c=>c.image===stone&&c.alpha===.48),'ordinary non-buildable paving is preserved');
  const n=calls.length;drawFieldGround(ctx,options as any);assert.equal(calls.length,n);assert.equal(canvases,1);
  drawFieldGround(ctx,{...options,landmarkRects:[]} as any);assert.equal(canvases,2,'landmark mask belongs to the static cache key');
 }finally{if(old===undefined)delete (globalThis as any).document;else (globalThis as any).document=old;}
});
it('wide-road clip quads and round caps use matching winding so overlapping joints cannot punch holes',()=>{
 const {ctx,calls}=roadContext();drawGroundRoute(ctx,{preview:{status:'open',points:[{x:0,y:0},{x:32,y:0},{x:32,y:32}]},project:p=>p,cellSize:32,widthPixels:30,sprites:{get:()=>atlas}} as any);
 const points=calls.filter(c=>c[0]==='move'||c[0]==='line').slice(0,4).map(c=>[c[1],c[2]]);const area=points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p[0]*q[1]-q[0]*p[1];},0);
 assert.ok(area>0,'positive quad winding matches clockwise Canvas arc defaults');
 assert.ok(calls.filter(c=>c[0]==='arc').every(c=>c[5]===Math.PI*2&&c[6]!==true));
});
