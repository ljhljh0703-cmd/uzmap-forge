import {it} from 'node:test';import assert from 'node:assert/strict';
import {GridNavigation} from '../../src/sim/navigation.ts';import {DefStore} from '../../src/sim/def-store.ts';import {createEntity} from '../../src/sim/unit-entity.ts';import {Sim} from '../../src/sim/sim.ts';import {installMovement} from '../../src/sim/movement.ts';
const ir=()=>({irVersion:1,info:{name:'test',author:'',suggestedPlayers:'',playableWidth:0,playableHeight:0,formatVersion:0},terrain:{tileset:'',width:1,height:1,tiles:[{ground:0,height:0,waterHeight:null,flags:0}]},placedUnits:[],objectMods:[],regions:[],script:{source:'',nativesUsed:{}},meta:{sourceFile:'test',fileInventory:[],parsedAt:''}} as any);
function arena(){const grid={width:9,height:7,cellSize:32,originX:0,originY:0,cells:new Uint8Array(63)};for(let y=1;y<=5;y++)grid.cells[y*9+4]=2;return grid;}
const bounds={minX:16,maxX:240,minY:16,maxY:176};
it('ops-5/9: an arena-spanning wall cannot be bypassed through off-board terrain',()=>{const nav=new GridNavigation(arena(),()=>[],new DefStore());assert.ok(nav.route({x:32,y:96},{x:224,y:96}));assert.equal(nav.route({x:32,y:96},{x:224,y:96},false,0,bounds),null);});
it('ops-5/7: identical fixed ticks across supported 1x–6x and 8x stress never cross a closed arena wall',()=>{const traces=[];for(const batch of [1,2,3,4,5,6,8]){const s=new Sim(ir(),6),ds=new DefStore();s.defStore=ds;const e=createEntity(ds.getDef('u000'),{id:1,owner:11,x:32,y:96,facing:0});e.moveSpeedU=522;e.orderX=224;e.orderY=96;e.orderActive=1;s.spawnUnit(e);s.navigation=new GridNavigation(arena(),()=>s.entities.values(),ds,()=>bounds);installMovement(s);for(let n=0;n<120;n+=batch)for(let i=0;i<batch;i++){s.step();assert.ok(e.x<112,'blocked creature escaped the wall through a hidden outer lane');assert.ok(e.y>=bounds.minY&&e.y<=bounds.maxY);}traces.push(s.stateHash());}assert.equal(new Set(traces).size,1);});
it('a deliberate maze opening stays usable within the exact same bounds',()=>{const grid=arena();grid.cells[2*9+4]=0;const nav=new GridNavigation(grid,()=>[],new DefStore());const route=nav.route({x:32,y:96},{x:224,y:96},false,0,bounds);assert.ok(route);assert.ok(route.every(p=>p.x>=bounds.minX&&p.x<=bounds.maxX&&p.y>=bounds.minY&&p.y<=bounds.maxY));assert.ok(route.some(p=>p.x===128&&p.y===64));});
it('flight keeps its authored no-fly layer when arena bounds constrain ground travel',()=>{const nav=new GridNavigation(arena(),()=>[],new DefStore());assert.ok(nav.route({x:32,y:96},{x:224,y:96},true,0,bounds));});


it('an explicit exit corridor permits its outside goal while retaining the other three arena edges',()=>{
 const grid={width:13,height:9,cellSize:32,originX:0,originY:0,cells:new Uint8Array(117)},b={minX:16,maxX:240,minY:16,maxY:240,corridors:[{minX:224,maxX:336,minY:112,maxY:144}]},nav=new GridNavigation(grid,()=>[],new DefStore()),from={x:32,y:128},to={x:320,y:128};
 const path=nav.route(from,to,false,0,b);assert.ok(path);assert.deepEqual(path.at(-1),to);assert.ok(path.every(p=>p.y>=b.minY&&p.y<=b.maxY));
 for(let y=1;y<=7;y++)grid.cells[y*13+4]=2;
 const blocked=new GridNavigation(grid,()=>[],new DefStore());assert.ok(blocked.route(from,to));assert.equal(blocked.route(from,to,false,0,b),null);
});
it('waypoint cache includes exit-corridor geometry and cannot retain a stale outside route',()=>{
 const grid={width:13,height:9,cellSize:32,originX:0,originY:0,cells:new Uint8Array(117)},defs=new DefStore(),e=createEntity(defs.getDef('u000'),{id:1,owner:11,x:32,y:128,facing:0});e.orderX=320;e.orderY=128;e.orderActive=1;
 let corridor={minX:224,maxX:336,minY:112,maxY:144};const nav=new GridNavigation(grid,()=>[e],defs,()=>({minX:16,maxX:240,minY:16,maxY:240,corridors:[corridor]}));
 assert.ok(nav.waypoint(e));corridor={...corridor,minY:16,maxY:48};assert.equal(nav.waypoint(e),null);
});
