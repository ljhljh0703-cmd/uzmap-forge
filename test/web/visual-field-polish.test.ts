import {it} from 'node:test';
import assert from 'node:assert/strict';
const art=await import(new URL('../../web/field-art.js',import.meta.url).href);
const ground=art as any;
function grid(){return {width:4,height:3,cellSize:32,originX:16,originY:16,cells:new Uint8Array([0,8,8,2,0,8,0,2,0,0,0,10])};}
const bounds={minX:0,minY:0,maxX:128,maxY:96};
it('ground decoration uses source-cell classes and puts a border only inside non-buildable terrain',()=>{
 const g=grid(),before=[...g.cells],p=ground.fieldGroundPlan(g,bounds);
 assert.deepEqual(p.world,bounds);assert.equal(p.width,32);assert.equal(p.height,24);
 const area=(kind:string)=>p.runs.filter((r:any)=>r.kind===kind).reduce((sum:number,r:any)=>sum+r.width*r.height,0);
 assert.equal(area('build'),6*64);assert.equal(area('path'),3*64);assert.equal(area('wall'),3*64);
 assert.ok(p.edges.length>0);assert.ok(p.edges.every((edge:any)=>edge.kind!=='build'));
 for(const edge of p.edges){assert.ok(edge.x>=0&&edge.y>=0&&edge.x+edge.width<=p.width&&edge.y+edge.height<=p.height);}
 assert.deepEqual([...g.cells],before);
 // The joined path cells share no decorative seam; the exposed south edge remains.
 assert.ok(!p.edges.some((e:any)=>e.kind==='path'&&e.side==='east'&&e.col===1&&e.row===0));
 assert.ok(p.edges.some((e:any)=>e.kind==='path'&&e.side==='south'&&e.col===1&&e.row===0));
});
it('source origin, partial view bounds and empty/invalid areas never fabricate extra ground cells',()=>{
 const g={...grid(),originX:-48,originY:80},b={minX:-50,minY:90,maxX:20,maxY:140},p=ground.fieldGroundPlan(g,b);
 assert.deepEqual(p.world,{minX:-64,minY:64,maxX:32,maxY:160});
 assert.ok(p.runs.every((r:any)=>r.col>=0&&r.col<3&&r.row>=0&&r.row<3));
 for(const b of [null,{minX:0,minY:0,maxX:0,maxY:1},{minX:NaN,minY:0,maxX:1,maxY:1},{minX:200,minY:200,maxX:300,maxY:300}])assert.equal(ground.fieldGroundPlan(grid(),b),null);
});
it('existing atlas is cached below units without scanning or rasterizing again while only projection changes',()=>{
 const old=(globalThis as any).document;let canvases=0,tiles=0,blits=0,texture:any={src:'tiles.png',image:{},spec:{frame:{x:0,y:0,w:32,h:32}}};
 const alphas:number[]=[],clips:any[]=[],paint:any={globalAlpha:1,save(){},restore(){},beginPath(){},rect(){},clip(){},fillRect(){},drawImage(){tiles++;alphas.push(this.globalAlpha);}};
 const ctx:any={save(){},restore(){},beginPath(){},rect(...v:any[]){clips.push(v);},clip(){},drawImage(){blits++;}};
 (globalThis as any).document={createElement:()=>{canvases++;return {width:0,height:0,getContext:()=>paint};}};
 try{
  const g=grid(),sprites={get:(key)=>key==='terrain:stone'?texture:null},project=(p:any)=>({x:p.x/2,y:100-p.y/2});
  ground.drawFieldGround(ctx,{grid:g,bounds,project,sprites});const first=tiles;assert.ok(first>0);assert.equal(canvases,1);assert.equal(blits,1);
  // A getter detects accidental frame-time WPM reads, rather than merely checking equal output.
  Object.defineProperty(g,'cells',{get(){throw Error('static WPM scanned during redraw');}});
  for(let i=0;i<20;i++)ground.drawFieldGround(ctx,{grid:g,bounds,project:(p:any)=>({x:p.x/3,y:200-p.y/3}),sprites});
  assert.equal(tiles,first);assert.equal(canvases,1);assert.equal(blits,21);assert.ok(alphas.every(a=>a>0&&a<=.5));
  assert.deepEqual(clips[0],[0,52,64,48]);
  const g2=grid();ground.drawFieldGround(ctx,{grid:g2,bounds,project,sprites});assert.equal(canvases,2);
  texture={...texture,image:{},src:'tiles.png?build=new'};ground.drawFieldGround(ctx,{grid:g2,bounds,project,sprites});assert.equal(canvases,3);
 }finally{if(old===undefined)delete (globalThis as any).document;else (globalThis as any).document=old;}
});
it('a missing atlas adds no procedural fallback picture and can recover after the real atlas loads',()=>{
 const old=(globalThis as any).document;let texture:any=null,tiles=0,blits=0;
 const paint:any={globalAlpha:1,save(){},restore(){},beginPath(){},rect(){},clip(){},fillRect(){},drawImage(){tiles++;}};
 (globalThis as any).document={createElement:()=>({getContext:()=>paint})};
 try{const g=grid(),sprites={get:(key)=>key==='terrain:stone'?texture:null},ctx:any={save(){},restore(){},beginPath(){},rect(){},clip(){},drawImage(){blits++;}},options={grid:g,bounds,project:(p:any)=>({x:p.x,y:-p.y}),sprites};
  ground.drawFieldGround(ctx,options);assert.equal(tiles,0);assert.equal(blits,0);
  texture={src:'tiles.png',image:{},spec:{frame:{x:0,y:0,w:32,h:32}}};ground.drawFieldGround(ctx,options);assert.ok(tiles>0);assert.equal(blits,1);
 }finally{if(old===undefined)delete (globalThis as any).document;else (globalThis as any).document=old;}
});

it('new grass variants cover only source build ground and remain cached while the camera changes',()=>{
 const old=globalThis.document,images=Array.from({length:4},(_,i)=>({i})),oldTexture={src:'old',image:{old:true},spec:{frame:{x:0,y:0,w:32,h:32}}},draws:any[]=[],clips:any[]=[],paint:any={globalAlpha:1,save(){},restore(){},beginPath(){},rect(...a){clips.push(a);},clip(){},fillRect(){},drawImage(...a){draws.push(a);}},ctx:any={save(){},restore(){},beginPath(){},rect(){},clip(){},drawImage(){}};let canvases=0;globalThis.document={createElement:()=>{canvases++;return {getContext:()=>paint};}} as any;
 try{const g=grid(),sprites={get:key=>key==='terrain:stone'?oldTexture:key.startsWith('ground:grass:')?{src:key,image:images[Number(key.at(-1))],spec:{frame:{x:0,y:0,w:128,h:128}}}:null};ground.drawFieldGround(ctx,{grid:g,bounds,project:p=>p,sprites});assert.ok(draws.some(a=>images.includes(a[0])));const n=draws.length;for(let i=0;i<20;i++)ground.drawFieldGround(ctx,{grid:g,bounds,project:p=>p,sprites});assert.equal(draws.length,n);assert.equal(canvases,1);}finally{globalThis.document=old;}
});
