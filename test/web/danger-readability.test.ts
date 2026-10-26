import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as view from '../../web/battlefield-readability.js';

const bounds=Object.freeze({minX:-3200,minY:5400,maxX:-2400,maxY:7000});
const exit=Object.freeze({x:-256,y:5632});
const threat=()=>({id:12,alive:true,owner:11,orderActive:1,x:-2816,y:5632,orderX:exit.x,orderY:exit.y});
const api=(name:string)=>{assert.equal(typeof (view as any)[name],'function',name+' export is required');return (view as any)[name];};
const statusSnapshot=(map:Map<string,any>)=>JSON.stringify([...map].map(([key,effect])=>[key,effect]));

test('exit threat follows the observed final goal, including field edges, without modifying entities or geometry',()=>{
 const isThreat=api('isExitThreat');
 for(const [x,y]of [[-2816,5632],[bounds.minX,bounds.minY],[bounds.maxX,bounds.maxY]]){
  const entity=Object.freeze({...threat(),x,y}),input=Object.freeze({bounds,exit}),before=JSON.stringify({entity,input});
  assert.equal(isThreat(entity,input),true);assert.equal(JSON.stringify({entity,input}),before);
 }
});

test('a nearby enemy is not a threat until its actual order is the exit, and another field never leaks into the overlay',()=>{
 const isThreat=api('isExitThreat'),input={bounds,exit};
 for(const change of [{alive:false},{owner:0},{owner:10},{orderActive:0},{orderX:exit.x+1},{orderY:exit.y+1},{x:bounds.minX-1},{x:bounds.maxX+1},{y:bounds.minY-1},{y:bounds.maxY+1},{x:2816,y:5632}]){
  const entity=Object.freeze({...threat(),...change}),before=JSON.stringify(entity);
  assert.equal(isThreat(entity,input),false,JSON.stringify(change));assert.equal(JSON.stringify(entity),before);
 }
});

test('actual DOT provenance keeps poison and fire distinct while frost, slow and stun stay deduplicated',()=>{
 const icons=api('creepStatusIcons'),status=new Map<string,any>([
  ['dot',Object.freeze({kind:'dot',perTick:1,remainingTicks:30})],
  ['venom:BPse:4',Object.freeze({kind:'dot',perTick:0,perSecondPm:1000,remainingTicks:20})],
  ['liquid:BLif',Object.freeze({kind:'dot',perTick:0,perSecondPm:2000,remainingTicks:20})],
  ['burn:9',Object.freeze({kind:'dot',perTick:0,pulseDamagePm:1000,remainingTicks:2})],
  ['slow',Object.freeze({kind:'slow',magnitudePm:100,remainingTicks:20})],
  ['frost',Object.freeze({kind:'slow',magnitudePm:200,remainingTicks:10})],
  ['stun',Object.freeze({kind:'stun',remainingTicks:2})],
  ['armor:BIcb',Object.freeze({kind:'armorReduction',amount:10,remainingTicks:60})]
 ]),before=statusSnapshot(status),result=icons(status);
 assert.deepEqual([...result].sort(),['fire','poison','slow','stun']);assert.equal(new Set(result).size,result.length);assert.equal(statusSnapshot(status),before);
 for(const [key,kind]of [['dot','poison'],['venom:BPse:4','poison'],['liquid:BLif','fire'],['burn:9','fire']]){
  const isolated=new Map([[key,status.get(key)]]);assert.deepEqual(icons(isolated),[kind],key);
 }
});

test('expired, unknown and absent statuses are quiet; an observed slow aura adds only one slow icon',()=>{
 const icons=api('creepStatusIcons'),status=new Map([
  ['dot',{kind:'dot',remainingTicks:0}],['venom:BPse:4',{kind:'dot',remainingTicks:-1}],
  ['frost',{kind:'slow',remainingTicks:0}],['stun',{kind:'stun',remainingTicks:0}],
  ['unknown',{kind:'dot',remainingTicks:5}],['armor:BIcb',{kind:'armorReduction',remainingTicks:5}]
 ]),before=statusSnapshot(status);
 assert.deepEqual(icons(status),[]);assert.deepEqual(icons(new Map()),[]);
 assert.deepEqual(icons(status,true),['slow']);
 assert.deepEqual(icons(new Map([['frost',{kind:'slow',magnitudePm:100,remainingTicks:1}]]),true),['slow']);
 assert.equal(statusSnapshot(status),before);
});

function recorder(){
 const strokes:any[]=[],texts:any[]=[],paint:any[]=[],state:any[]=[];let path:any[]=[];
 const ctx:any={fillStyle:'#000000',strokeStyle:'#000000',lineWidth:1,globalAlpha:1,
  save(){state.push({fillStyle:this.fillStyle,strokeStyle:this.strokeStyle,lineWidth:this.lineWidth,globalAlpha:this.globalAlpha});},
  restore(){Object.assign(this,state.pop()??{});},beginPath(){path=[];},closePath(){},setLineDash(){},
  moveTo(x:number,y:number){path.push([x,y]);},lineTo(x:number,y:number){path.push([x,y]);},
  rect(x:number,y:number,w:number,h:number){path.push([x,y],[x+w,y+h]);},roundRect(x:number,y:number,w:number,h:number){this.rect(x,y,w,h);},
  arc(x:number,y:number,r:number){path.push([x-r,y-r],[x+r,y+r]);},
  stroke(){strokes.push({points:[...path],color:this.strokeStyle,width:this.lineWidth});},
  strokeRect(x:number,y:number,w:number,h:number){strokes.push({points:[[x,y],[x+w,y+h]],color:this.strokeStyle,width:this.lineWidth});},
  fill(){paint.push({points:[...path],color:this.fillStyle});},fillRect(x:number,y:number,w:number,h:number){paint.push({points:[[x,y],[x+w,y+h]],color:this.fillStyle});},
  fillText(text:string,x:number,y:number){texts.push({text,x,y,color:this.fillStyle});},strokeText(text:string,x:number,y:number){texts.push({text,x,y,color:this.strokeStyle});}
 };
 return{ctx,strokes,texts,paint};
}

test('status artwork reuses each B4 icon above both the body and the whole health rail, including bosses',()=>{
 const draw=api('drawCreepStatus');
 for(const boss of [false,true])for(const size of [30,56,84]){
  const calls:any[]=[],p=recorder(),kinds=Object.freeze(['poison','fire','slow','stun']),sprites={draw(_ctx:any,key:string,x:number,y:number,s:number,options:any){calls.push({key,x,y,size:s,options});return true;}},input=Object.freeze({sprites,kinds,x:100.4,y:160.6,size,boss});
  draw(p.ctx,input);assert.deepEqual(calls.map(call=>call.key).sort(),['effect:fire','effect:poison','effect:slow','effect:stun']);
  for(const call of calls){
   assert.ok(call.size>0&&call.size<=12);assert.equal(call.options?.shadow,false);
   assert.ok(call.y+call.size/2<160.6-size/2,'status art stays above the body');
   assert.ok(call.y+call.size/2<Math.round(160.6-size*.8-6)-1,'status art stays above the health outline');
  }
  assert.deepEqual(kinds,['poison','fire','slow','stun']);
 }
});

test('no active status causes no sprite or geometric paint',()=>{
 const draw=api('drawCreepStatus'),p=recorder();let calls=0;
 draw(p.ctx,{sprites:{draw(){calls++;return true;}},kinds:[],x:100,y:160,size:30});
 assert.equal(calls,0);assert.deepEqual(p.strokes,[]);assert.deepEqual(p.paint,[]);assert.deepEqual(p.texts,[]);
});

function redDominates(value:string){
 if(value==='red')return true;
 const hex=value.match(/^#([0-9a-f]{6})$/i),rgb=value.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
 const [r,g,b]=hex?[0,2,4].map(index=>parseInt(hex[1].slice(index,index+2),16)):rgb?rgb.slice(1,4).map(Number):[0,0,0];
 return r>g&&r>b;
}

test('exit danger is an outer red boundary plus a literal warning, so it does not rely on colour or cover the body',()=>{
 const draw=api('drawExitThreat'),p=recorder(),input=Object.freeze({x:100,y:160,size:40});draw(p.ctx,input);
 assert.ok(p.texts.some(mark=>mark.text==='!'),'a visible exclamation communicates danger without colour');
 assert.ok(p.strokes.some(mark=>{
  if(!redDominates(mark.color)||!mark.points.length)return false;
  const xs=mark.points.map((point:any)=>point[0]),ys=mark.points.map((point:any)=>point[1]);
  return Math.min(...xs)-mark.width/2<80&&Math.max(...xs)+mark.width/2>120&&Math.min(...ys)-mark.width/2<140&&Math.max(...ys)+mark.width/2>180;
 }),'a red outline surrounds the complete existing sprite box');
 assert.ok(!p.paint.some(mark=>{
  if(!mark.points.length)return false;const xs=mark.points.map((point:any)=>point[0]),ys=mark.points.map((point:any)=>point[1]);
  return Math.max(Math.min(...xs),80)<Math.min(Math.max(...xs),120)&&Math.max(Math.min(...ys),140)<Math.min(Math.max(...ys),180);
 }),'danger paint does not fill the monster body');
});
