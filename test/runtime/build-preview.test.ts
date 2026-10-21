import {it} from 'node:test';
import assert from 'node:assert/strict';
import {createBuildPreview} from '../../src/runtime/build-preview.ts';
import {DefStore} from '../../src/sim/def-store.ts';
import {createEntity} from '../../src/sim/unit-entity.ts';
import {GridNavigation} from '../../src/sim/navigation.ts';
import {Sim} from '../../src/sim/sim.ts';
import {FLAG_NO_BUILD,FLAG_NO_WALK} from '../../src/ir/pathing.ts';

function fixture(width=9,height=7,originX=0,originY=0){
 const grid={width,height,cellSize:32,originX,originY,cells:new Uint8Array(width*height)};
 const defs=new DefStore(undefined,{resolve:(id)=>({movementType:id==='fly1'?'fly':'foot',...((id==='h006'||id==='h007')?{pathing:{width:1,height:1,cells:[FLAG_NO_BUILD|FLAG_NO_WALK]}}:{})})});
 const bounds={minX:originX,maxX:originX+(width-1)*32,minY:originY,maxY:originY+(height-1)*32};
 const start={x:originX+32,y:originY+96},waypoints=[{x:originX+(width-2)*32,y:originY+96}];
 const preview=createBuildPreview({grid,defs});
 return {grid,defs,bounds,start,waypoints,preview,entities:[],pending:[],candidate:{typeId:'h006',x:originX+128,y:originY+96}};
}
function input(f:ReturnType<typeof fixture>){return {bounds:f.bounds,start:f.start,waypoints:f.waypoints,entities:f.entities,pending:f.pending,candidate:f.candidate};}
function block(f:ReturnType<typeof fixture>,id:number,x:number,y:number,typeId='h006'){
 return createEntity(f.defs.getDef(typeId),{id,owner:0,x,y,facing:0});
}
it('shows a deterministic ground detour around the proposed source footprint',()=>{
 const f=fixture(),r=f.preview.evaluate(input(f));
 assert.equal(r.status,'open');assert.equal(r.reason,'route-open');assert.equal(r.movement,'ground');assert.equal(r.flightPredicted,false);
 assert.equal(r.legsReached,1);assert.equal(r.failedLeg,null);assert.deepEqual(r.points[0],f.start);
 assert.deepEqual(r.points.at(-1),f.waypoints[0]);assert.ok(r.points.every(p=>p.x!==128||p.y!==96));assert.ok(r.points.some(p=>p.y!==96));
});
it('does not bypass a closed candidate wall outside the cropped field',()=>{
 const f=fixture();for(let y=0;y<7;y++)if(y!==3)f.grid.cells[y*9+4]=FLAG_NO_WALK;
 const r=f.preview.evaluate(input(f));assert.equal(r.status,'blocked');assert.equal(r.reason,'unreachable-leg');assert.equal(r.failedLeg,0);assert.equal(r.legsReached,0);assert.deepEqual(r.points,[f.start]);
});
it('rejects occupied, terrain-prohibited and pending-overlapped cells like canBuild',()=>{
 const f=fixture(),wall=block(f,10,128,96);
 assert.equal(f.preview.evaluate({...input(f),entities:[wall]}).status,'invalid');
 assert.equal(f.preview.evaluate({...input(f),pending:[{typeId:'h006',x:128,y:96}]}).reason,'occupied-or-unbuildable');
 f.grid.cells[3*9+4]=FLAG_NO_BUILD;f.preview.clear();assert.equal(f.preview.evaluate(input(f)).status,'invalid');
});
it('pending requests affect the route before a candidate is committed',()=>{
 const f=fixture(),pending=[{typeId:'h006',x:128,y:96}];
 const r=f.preview.evaluate({...input(f),candidate:null,pending});assert.equal(r.status,'open');assert.ok(r.points.every(p=>p.x!==128||p.y!==96));
});
it('cache reuses only the last result and invalidates on blocker type, position, alive state and identity',()=>{
 const f=fixture(),wall=block(f,10,128,64),a={...input(f),entities:[wall]};
 const first=f.preview.evaluate(a);assert.equal(f.preview.evaluate(a),first);assert.equal(f.preview.stats.computations,1);
 for(const delta of [{x:160},{typeId:'h007'},{alive:false},{id:11}]){f.preview.evaluate({...a,entities:[{...wall,...delta}]});}
 assert.equal(f.preview.stats.computations,5);f.preview.evaluate(a);assert.equal(f.preview.stats.computations,6);
});
it('cache invalidates for pending state, candidate, waypoint geometry and bounds',()=>{
 const f=fixture(),a=input(f);f.preview.evaluate(a);
 f.preview.evaluate({...a,pending:[{typeId:'h006',x:160,y:160}]});
 f.preview.evaluate({...a,candidate:{...a.candidate,x:160}});
 f.preview.evaluate({...a,waypoints:[{x:192,y:96}]});
 f.preview.evaluate({...a,bounds:{...a.bounds,minY:32}});
 assert.equal(f.preview.stats.computations,5);f.preview.clear();f.preview.evaluate(a);assert.equal(f.preview.stats.computations,6);
});
it('reports reached legs and failing leg while preserving the successful route prefix',()=>{
 const f=fixture();for(let y=0;y<7;y++)f.grid.cells[y*9+5]=FLAG_NO_WALK;
 const r=f.preview.evaluate({...input(f),candidate:null,waypoints:[{x:96,y:96},{x:224,y:96}]});
 assert.equal(r.status,'blocked');assert.equal(r.legsReached,1);assert.equal(r.failedLeg,1);assert.deepEqual(r.points.at(-1),{x:96,y:96});
});
it('returned cached arrays and points cannot be modified by a caller',()=>{
 const f=fixture(),r=f.preview.evaluate(input(f));assert.ok(Object.isFrozen(r));assert.ok(Object.isFrozen(r.points));assert.ok(r.points.every(Object.isFrozen));
 assert.throws(()=>{(r.points as Array<{x:number;y:number}>).push({x:0,y:0});},TypeError);
 assert.throws(()=>{(r.points[0] as {x:number}).x=999;},TypeError);assert.equal(f.preview.evaluate(input(f)),r);
});
it('never predicts flight through an otherwise blocked ground wall',()=>{
 const f=fixture();for(let y=0;y<7;y++)f.grid.cells[y*9+4]=FLAG_NO_WALK;
 const fly=block(f,50,32,96,'fly1'),r=f.preview.evaluate({...input(f),candidate:null,entities:[fly]});
 assert.equal(r.status,'blocked');assert.equal(r.flightPredicted,false);assert.equal(r.movement,'ground');
});
it('cropping preserves negative world coordinates and cell-center alignment at a field edge',()=>{
 const f=fixture(20,20,-640,-640),bounds={minX:-592,maxX:-368,minY:-592,maxY:-368};
 const r=f.preview.evaluate({...input(f),bounds,start:{x:-576,y:-512},waypoints:[{x:-384,y:-512}],candidate:{typeId:'h006',x:-480,y:-512}});
 assert.equal(r.status,'open');assert.ok(r.points.every(p=>p.x>=bounds.minX&&p.x<=bounds.maxX&&p.y>=bounds.minY&&p.y<=bounds.maxY));assert.equal(f.preview.stats.cropCells,49);
 assert.equal(f.preview.evaluate({...input(f),bounds,start:{x:-576,y:-512},waypoints:[{x:-384,y:-512}],candidate:{typeId:'h006',x:-608,y:-512}}).reason,'outside-field');
});
it('out-of-grid geometry and nonfinite candidates return invalid without searching',()=>{
 const f=fixture();assert.equal(f.preview.evaluate({...input(f),candidate:{typeId:'h006',x:NaN,y:96}}).status,'invalid');
 assert.equal(f.preview.evaluate({...input(f),start:{x:-32,y:96}}).reason,'invalid-geometry');
 assert.equal(f.preview.evaluate({...input(f),bounds:{...f.bounds,maxX:-1}}).reason,'invalid-geometry');
});
it('clearing invalidates a changed static WPM snapshot without touching the source',()=>{
 const f=fixture(),a={...input(f),candidate:null};assert.equal(f.preview.evaluate(a).status,'open');
 for(let y=0;y<7;y++)f.grid.cells[y*9+4]=FLAG_NO_WALK;
 f.preview.clear();assert.equal(f.preview.evaluate(a).status,'blocked');assert.equal(f.preview.stats.computations,2);
});
it('preview leaves active Sim, entities, RNG, WPM, pending inputs and live navigation cache byte-for-byte unchanged',()=>{
 const f=fixture(),ir={irVersion:1,info:{},terrain:{},placedUnits:[],objectMods:[],regions:[],script:{source:'',nativesUsed:{}},meta:{}} as any;
 const sim=new Sim(ir,6);sim.defStore=f.defs;const mover=block(f,1,32,96,'u000'),wall=block(f,2,128,64);sim.spawnUnit(mover);sim.spawnUnit(wall);
 mover.orderX=224;mover.orderY=96;mover.orderActive=1;sim.navigation=new GridNavigation(f.grid,()=>sim.entities.values(),f.defs);sim.navigation.waypoint(mover);
 const pending=[{typeId:'h006',x:160,y:160}],before={hash:sim.stateHash(),entities:structuredClone([...sim.entities]),grid:[...f.grid.cells],pending:structuredClone(pending),nav:structuredClone({blocks:(sim.navigation as any).blocks,signature:(sim.navigation as any).signature,cache:(sim.navigation as any).cache})};
 f.preview.evaluate({...input(f),entities:sim.entities.values(),pending});
 assert.equal(sim.stateHash(),before.hash);assert.deepEqual([...sim.entities],before.entities);assert.deepEqual([...f.grid.cells],before.grid);assert.deepEqual(pending,before.pending);assert.deepEqual(structuredClone({blocks:(sim.navigation as any).blocks,signature:(sim.navigation as any).signature,cache:(sim.navigation as any).cache}),before.nav);
});

it('uses an asymmetric multi-cell source footprint and exact crop-edge validity',()=>{
 const f=fixture(),defs=new DefStore(undefined,{resolve:()=>({pathing:{width:4,height:2,cells:[10,10,10,10,10,10,10,10]}})});
 const preview=createBuildPreview({grid:f.grid,defs}),base={...input(f),candidate:{typeId:'h006',x:112,y:80}};
 const expected=new GridNavigation(f.grid,()=>[],defs);assert.equal(expected.canBuild('h006',112,80),true);
 const r=preview.evaluate(base);assert.equal(r.status,'open');assert.ok(r.points.every(p=>!(p.x>=64&&p.x<=160&&p.y>=64&&p.y<=96)));
 const candidate={typeId:'h006',x:0,y:80};assert.equal(expected.canBuild(candidate.typeId,candidate.x,candidate.y),false);assert.equal(preview.evaluate({...base,candidate}).status,'invalid');
});
it('retains source ground-only masks instead of treating every footprint flag as an impassable wall',()=>{
 const f=fixture(),defs=new DefStore(undefined,{resolve:()=>({pathing:{width:1,height:1,cells:[FLAG_NO_BUILD]}})});
 const r=createBuildPreview({grid:f.grid,defs}).evaluate(input(f));assert.equal(r.status,'open');assert.ok(r.points.some(p=>p.x===128&&p.y===96));
});
it('a moving non-blocker does not cause stationary previews to run another A*',()=>{
 const f=fixture(),mover=block(f,10,32,32,'u000'),r=f.preview.evaluate({...input(f),entities:[mover]});
 assert.equal(f.preview.evaluate({...input(f),entities:[{...mover,x:64}]}),r);assert.equal(f.preview.stats.computations,1);
});
it('all returned points follow a copied existing route and never jump to a solid goal center',()=>{
 const f=fixture(),goal=block(f,10,224,96),base={...input(f),entities:[goal],candidate:null};
 const r=f.preview.evaluate(base),expected=new GridNavigation(f.grid,()=>[goal],f.defs).route(f.start,f.waypoints[0],false,0,f.bounds);
 assert.equal(r.status,'blocked');assert.equal(r.reason,'waypoint-not-reached');assert.deepEqual(r.points,[f.start,...expected!]);assert.notDeepEqual(r.points.at(-1),f.waypoints[0]);assert.equal(r.legs[0]?.adjustedGoal,true);assert.deepEqual(r.legs[0]?.end,r.points.at(-1));
});

it('accepts a perimeter endpoint only when it actually enters the source waypoint rectangle',()=>{
 const f=fixture(),goal=block(f,10,224,96),base={...input(f),entities:[goal],candidate:null,waypointBounds:[{minX:192,maxX:256,minY:64,maxY:128}]};
 const r=f.preview.evaluate(base);assert.equal(r.status,'open');assert.equal(r.legsReached,1);assert.equal(r.legs[0]?.adjustedGoal,true);assert.equal(r.legs[0]?.reached,true);assert.ok(Object.isFrozen(r.legs));assert.ok(Object.isFrozen(r.legs[0]));assert.ok(Object.isFrozen(r.legs[0]?.end));
});
it('a candidate covering the entire source enter-rect is blocked without changing placement permission',()=>{
 const f=fixture(),defs=new DefStore(undefined,{resolve:()=>({pathing:{width:3,height:3,cells:Array(9).fill(10)}})});
 const preview=createBuildPreview({grid:f.grid,defs});
 const r=preview.evaluate({...input(f),waypoints:[{x:192,y:96}],candidate:{typeId:'h006',x:192,y:96},waypointBounds:[{minX:160,maxX:224,minY:64,maxY:128}]});
 assert.equal(r.status,'blocked');assert.equal(r.reason,'waypoint-not-reached');assert.equal(r.canBuild,true);assert.equal(r.legsReached,0);assert.equal(r.failedLeg,0);assert.equal(r.legs[0]?.adjustedGoal,true);assert.equal(r.legs[0]?.reached,false);
});
it('source waypoint acceptance geometry participates in the one-result cache',()=>{
 const f=fixture(),base=input(f);f.preview.evaluate(base);f.preview.evaluate({...base,waypointBounds:[{minX:192,maxX:256,minY:64,maxY:128}]});assert.equal(f.preview.stats.computations,2);
});
it('a global 640-square WPM is copied only into the 72 by 88 field',()=>{
 const f=fixture(640,640,-10240,-10240),base={...input(f),bounds:{minX:-8000,maxX:-5728,minY:-8000,maxY:-5216},start:{x:-7968,y:-7904},waypoints:[{x:-5760,y:-5248}],candidate:{typeId:'h006',x:-7008,y:-7008}};
 const r=f.preview.evaluate(base);assert.equal(r.status,'open');assert.equal(f.preview.stats.cropCells,72*88);for(let i=0;i<120;i++)assert.equal(f.preview.evaluate(base),r);assert.equal(f.preview.stats.computations,1);
});
