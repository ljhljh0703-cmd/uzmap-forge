import {it} from 'node:test';import assert from 'node:assert/strict';import * as view from '../../web/battlefield-readability.js';
it('range painter uses exact world radii after camera projection and reuses target icons for each weapon',()=>{
 const arcs:any[]=[],icons:any[]=[];const ctx:any={save(){},restore(){},beginPath(){},arc(...a:any[]){arcs.push(a);},fill(){},stroke(){},setLineDash(){},fillText(){}};
 const models=[{radiusU:130,targetsMask:1,weaponSlot:1,mode:'auto'},{radiusU:850,targetsMask:2,weaponSlot:2,mode:'auto'}];const before=JSON.stringify(models);
 for(const zoom of [.2,.5]){arcs.length=0;(view as any).drawAttackRanges(ctx,{models,x:70,y:210,zoom,sprites:{draw:(_c:any,key:string)=>{icons.push(key);return true;}}});assert.deepEqual(arcs.map(a=>a[2]).sort((a,b)=>a-b),[130*zoom,850*zoom]);}
 assert.ok(icons.includes('effect:ground'));assert.ok(icons.includes('effect:air'));assert.equal(JSON.stringify(models),before);
});
it('a support or unknown weapon never receives an invented attack ring',()=>{let arcs=0;const ctx:any={save(){},restore(){},beginPath(){},arc(){arcs++;},fill(){},stroke(){},setLineDash(){}};(view as any).drawAttackRanges(ctx,{models:[],x:0,y:0,zoom:1});assert.equal(arcs,0);});
