import {it} from 'node:test';
import assert from 'node:assert/strict';
import {battlefieldBounds,battlefieldCamera,gemSpriteSize,visibleGemChoices} from '../../web/play-ui.js';
const {createPrecisionCamera}=await import('../../web/precision-camera.js');
const config={enabled:true,fit:{cx:0,cy:0,zoom:.2},bounds:{minX:-1000,minY:-1000,maxX:1000,maxY:1000},width:400,height:400};
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const point=(camera:any,x:number,y:number)=>({x:(x-200)/camera.zoom+camera.cx,y:-(y-200)/camera.zoom+camera.cy});
function setup(extra:any={}){const c=createPrecisionCamera();c.sync({...config,...extra});return c;}

it('fit is the default and disabled precision never zooms, pans or retains pointers',()=>{
 const c=setup({enabled:false});assert.deepEqual(c.snapshot(),{camera:config.fit,scale:1,zoomed:false,pointerCount:0});
 assert.deepEqual(c.zoomAt({x:200,y:200},2),{consumed:false,changed:false});assert.deepEqual(c.panBy(10,20),{consumed:false,changed:false});assert.deepEqual(c.down({id:1,point:{x:10,y:20}}),{consumed:false,changed:false});assert.equal(c.snapshot().pointerCount,0);
});
it('absolute zoom keeps its pointed world position and clamps scale to one through 2.5',()=>{
 const c=setup(),anchor=point(c.snapshot().camera,250,230);
 assert.deepEqual(c.zoomAt({x:250,y:230},2),{consumed:true,changed:true});near(c.snapshot().scale,2);const after=point(c.snapshot().camera,250,230);near(after.x,anchor.x);near(after.y,anchor.y);
 c.zoomAt({x:200,y:200},90);assert.equal(c.snapshot().scale,2.5);c.zoomAt({x:200,y:200},-20);assert.deepEqual(c.snapshot().camera,config.fit);assert.equal(c.snapshot().scale,1);
});
it('single finger panning uses the same inverted Y convention as current screen/world transforms',()=>{
 const c=setup();assert.deepEqual(c.panBy(50,40),{consumed:false,changed:false});c.zoomAt({x:200,y:200},2);
 assert.deepEqual(c.panBy(20,12),{consumed:true,changed:true});near(c.snapshot().camera.cx,-50);near(c.snapshot().camera.cy,30);
});
it('large pans keep the visible viewport inside source bounds and fit-sized axes remain centered',()=>{
 const c=setup();c.zoomAt({x:200,y:200},2);c.panBy(1e6,-1e6);assert.deepEqual(c.snapshot().camera,{cx:-500,cy:-500,zoom:.4});c.panBy(-2e6,2e6);assert.deepEqual(c.snapshot().camera,{cx:500,cy:500,zoom:.4});
 const wide=setup({fit:{cx:0,cy:0,zoom:.1},width:400,height:200});wide.zoomAt({x:200,y:100},1.5);wide.panBy(500,500);assert.equal(wide.snapshot().camera.cx,0);
});
it('identical sync values preserve zoom/pan while copied fit values and snapshots cannot mutate the controller',()=>{
 const source=structuredClone(config),c=createPrecisionCamera();c.sync(source);c.zoomAt({x:200,y:200},2);c.panBy(20,10);const before=c.snapshot();assert.deepEqual(c.sync(structuredClone(config)),before);
 source.fit.cx=999;source.bounds.minX=999;before.camera.cx=888;assert.notEqual(c.snapshot().camera.cx,888);assert.notEqual(c.snapshot().camera.cx,999);
});
it('new source bounds or disabled state safely reset camera and all active pointers',()=>{
 for(const change of [{bounds:{minX:-999,minY:-1000,maxX:1000,maxY:1000}},{enabled:false}]){
  const c=setup();c.zoomAt({x:200,y:200},2);c.down({id:1,point:{x:200,y:200}});const next={...config,...change};const state=c.sync(next);assert.equal(state.scale,1);assert.equal(state.pointerCount,0);assert.deepEqual(state.camera,next.fit);
 }
});
it('placement confirmation appearing preserves zoom and world center when canvas height changes from 584 to 482',()=>{
 const bounds={minX:-1000,minY:-2000,maxX:1000,maxY:2000},fitFor=(height:number)=>({cx:0,cy:0,zoom:Math.min((390-40)/2000,(height-40)/4000)}),c=setup({bounds,width:390,height:584,fit:fitFor(584)});
 c.zoomAt({x:260,y:270},2.5);const before=c.snapshot(),after=c.sync({enabled:true,bounds,width:390,height:482,fit:fitFor(482)});
 assert.equal(after.scale,2.5);assert.equal(after.zoomed,true);near(after.camera.cx,before.camera.cx);near(after.camera.cy,before.camera.cy);near(after.camera.zoom,fitFor(482).zoom*2.5);
 const restored=c.sync({enabled:true,bounds,width:390,height:584,fit:fitFor(584)});near(restored.camera.cx,before.camera.cx);near(restored.camera.cy,before.camera.cy);near(restored.camera.zoom,before.camera.zoom);
 c.reset();assert.deepEqual(c.snapshot().camera,fitFor(584));
});
it('same-field fit or viewport changes reproject the camera and rebase active pointers without a ghost tap',()=>{
 for(const change of [{width:390},{height:390},{fit:{cx:0,cy:0,zoom:.21}}]){
  const c=setup();c.zoomAt({x:200,y:200},2);c.panBy(20,10);c.down({id:1,point:{x:200,y:200}});const before=c.snapshot(),next={...config,...change},state=c.sync(next);
  assert.equal(state.scale,2);assert.equal(state.pointerCount,1);near(state.camera.zoom,next.fit.zoom*2);near(state.camera.cx,before.camera.cx);near(state.camera.cy,before.camera.cy);
  assert.deepEqual(c.move({id:1,point:{x:200,y:200}}),{consumed:true,changed:false});assert.equal(c.up({id:1}).consumed,true);
 }
});
it('a stationary primary pointer remains a tap without changing camera',()=>{
 const c=setup();assert.deepEqual(c.down({id:1,point:{x:100,y:100}}),{consumed:false,changed:false});assert.equal(c.snapshot().pointerCount,1);assert.deepEqual(c.move({id:1,point:{x:104,y:104}}),{consumed:false,changed:false});assert.deepEqual(c.up({id:1}),{consumed:false,changed:false});assert.equal(c.snapshot().pointerCount,0);
});
it('at exactly eight pixels a drag is consumed even at fit and release can never become a tap',()=>{
 const c=setup();c.down({id:1,point:{x:100,y:100}});assert.deepEqual(c.move({id:1,point:{x:108,y:100}}),{consumed:true,changed:false});assert.deepEqual(c.snapshot().camera,config.fit);assert.equal(c.move({id:1,point:{x:100,y:100}}).consumed,true);assert.equal(c.up({id:1}).consumed,true);
 c.down({id:2,point:{x:100,y:100}});assert.equal(c.up({id:2}).consumed,false);
});
it('a zoomed single pointer pans from its original anchor rather than accumulating move deltas',()=>{
 const c=setup();c.zoomAt({x:200,y:200},2);c.down({id:1,point:{x:100,y:100}});c.move({id:1,point:{x:110,y:100}});c.move({id:1,point:{x:120,y:108}});near(c.snapshot().camera.cx,-50);near(c.snapshot().camera.cy,20);assert.equal(c.up({id:1}).consumed,true);
});
it('pinch zoom anchors its world midpoint and both releases stay consumed',()=>{
 const c=setup();c.down({id:1,point:{x:150,y:200}});assert.equal(c.down({id:2,point:{x:250,y:200}}).consumed,true);assert.equal(c.move({id:2,point:{x:350,y:200}}).changed,true);const state=c.snapshot();assert.equal(state.scale,2);const anchored=point(state.camera,250,200);near(anchored.x,0);near(anchored.y,0);
 assert.equal(c.up({id:1}).consumed,true);assert.equal(c.up({id:2}).consumed,true);assert.equal(c.snapshot().pointerCount,0);
});
it('two pinching fingers can translate at an existing scale without ratio drift',()=>{
 const c=setup();c.zoomAt({x:200,y:200},2);c.down({id:1,point:{x:100,y:200}});c.down({id:2,point:{x:200,y:200}});c.move({id:2,point:{x:220,y:200}});c.move({id:1,point:{x:120,y:200}});
 assert.equal(c.snapshot().scale,2);near(c.snapshot().camera.cx,-50);near(c.snapshot().camera.cy,0);
});
it('lifting one pinching finger rebases the remaining pan without a camera jump or ghost tap',()=>{
 const c=setup();c.down({id:1,point:{x:100,y:200}});c.down({id:2,point:{x:200,y:200}});c.move({id:2,point:{x:300,y:200}});c.up({id:2});const before=c.snapshot().camera;c.move({id:1,point:{x:100,y:200}});assert.deepEqual(c.snapshot().camera,before);c.move({id:1,point:{x:110,y:200}});near(c.snapshot().camera.cx,before.cx-10/before.zoom);assert.equal(c.up({id:1}).consumed,true);
});
it('cancels, lost captures and third fingers retain consumption until every pointer is lifted',()=>{
 const c=setup();for(const id of [1,2,3])c.down({id,point:{x:100+id*50,y:200}});assert.equal(c.up({id:1,cancelled:true}).consumed,true);assert.equal(c.up({id:3,cancelled:true}).consumed,true);assert.equal(c.up({id:2}).consumed,true);assert.equal(c.snapshot().pointerCount,0);
 c.down({id:4,point:{x:100,y:100}});assert.equal(c.up({id:4,cancelled:true}).consumed,true);c.down({id:5,point:{x:100,y:100}});assert.equal(c.up({id:5}).consumed,false);
});
it('external wheel zoom during a pointer sequence consumes it and rebases further pan',()=>{
 const c=setup();c.down({id:1,point:{x:200,y:200}});c.zoomAt({x:200,y:200},2);assert.equal(c.move({id:1,point:{x:200,y:200}}).changed,false);assert.equal(c.up({id:1}).consumed,true);
});
it('reset returns exact fit and forgets pointer state for confirm, cancel, toggle-off or wave adapters',()=>{
 const c=setup();c.zoomAt({x:210,y:210},2);c.down({id:1,point:{x:100,y:100}});assert.deepEqual(c.reset(),{consumed:true,changed:true});assert.deepEqual(c.snapshot(),{camera:config.fit,scale:1,zoomed:false,pointerCount:0});assert.deepEqual(c.reset(),{consumed:false,changed:false});
});
it('invalid coordinates, untracked pointers and degenerate pinch distances cannot introduce NaN',()=>{
 const c=setup();assert.deepEqual(c.zoomAt({x:NaN,y:0},2),{consumed:false,changed:false});assert.deepEqual(c.zoomAt({x:0,y:0},NaN),{consumed:false,changed:false});assert.deepEqual(c.panBy(Infinity,0),{consumed:false,changed:false});assert.equal(c.move({id:7,point:{x:100,y:100}}).changed,false);
 c.down({id:1,point:{x:200,y:200}});c.down({id:2,point:{x:200,y:200}});c.move({id:2,point:{x:220,y:200}});c.move({id:2,point:{x:240,y:200}});assert.ok(Object.values(c.snapshot().camera).every(Number.isFinite));assert.ok(c.snapshot().scale>=1&&c.snapshot().scale<=2.5);
});
it('390px source field geometry enlarges the existing gem helper to at least 30px at two times fit',()=>{
 const rects=[{minX:-3872,minY:8160,maxX:-3808,maxY:8224},{minX:-1824,minY:6624,maxX:-1760,maxY:6688},{minX:-2848,minY:5600,maxX:-2784,maxY:5664}],width=390,height=460,fit=battlefieldCamera(rects,width,height),bounds=battlefieldBounds(rects),c=setup({fit,bounds,width,height});
 c.zoomAt({x:width/2,y:height/2},2);const drawn=gemSpriteSize(128*c.snapshot().camera.zoom);assert.ok(drawn>=30,`only ${drawn}px`);assert.equal(c.snapshot().scale,2);assert.equal(gemSpriteSize(128*c.snapshot().camera.zoom),35);
});
it('existing world placement and visual picking use the same original coordinates after zoom and pan',()=>{
 const c=setup(),units=[{id:1,x:40,y:60,typeId:'gem'},{id:2,x:168,y:60,typeId:'gem'}],before=structuredClone(units);c.zoomAt({x:200,y:200},2);c.panBy(20,15);const camera=c.snapshot().camera;
 const sx=(units[0].x-camera.cx)*camera.zoom+200,sy=-(units[0].y-camera.cy)*camera.zoom+200,world=point(camera,sx,sy);near(world.x,units[0].x);near(world.y,units[0].y);
 assert.deepEqual(visibleGemChoices(units,world.x,world.y,{zoom:camera.zoom,footprintPixels:128*camera.zoom}).map(unit=>unit.id),[1]);assert.deepEqual(units,before);
});
