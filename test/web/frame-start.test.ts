import {it} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {createFrameClock} from "../../src/sim/ticks.ts";

it("the actual browser startup uses one rAF timestamp source, even when the first paint predates bootstrap", () => {
  const source=fs.readFileSync(new URL("../../web/main.js",import.meta.url),"utf8");
  const loop=source.match(/function loop[^\n]*\{[\s\S]*?\n\}/)?.[0];
  const start=source.match(/^resize\(\);.*loadFromUrl\(\);$/m)?.[0];
  assert.ok(loop && start);
  const pending:Array<(time:number)=>void>=[];
  const context={world:null,playing:false,restoring:false,runtimeFailed:false,loadingRun:false,checkpointRun(){},window:{showErr:(_where:string,error:Error)=>{throw error;}},tps:1,frameClock:createFrameClock(),
    performance:{now:()=>100},resize:()=>{},loadFromUrl:()=>{},
    requestAnimationFrame:(callback:(time:number)=>void)=>pending.push(callback)};
  // The former mixed-clock bootstrap really fails under this timing.
  const oldPending:Array<(time:number)=>void>=[];
  vm.runInNewContext(loop+"\nresize(); loop(); loadFromUrl();",{
    ...context,frameClock:createFrameClock(),requestAnimationFrame:(callback:(time:number)=>void)=>oldPending.push(callback)});
  assert.throws(()=>oldPending[0]!(90),/invalid frame time/);
  vm.runInNewContext(loop+"\n"+start,context);
  const first=pending.shift();assert.ok(first);
  assert.doesNotThrow(()=>first(90));
});

it('restoring frames do no hidden game rendering or stepping, retain scheduling and never catch up restoration time',()=>{
 const source=fs.readFileSync(new URL('../../web/main.js',import.meta.url),'utf8'),loop=source.match(/function loop[^\n]*\{[\s\S]*?\n\}/)?.[0];assert.ok(loop);let renders=0,steps=0,scheduled=0;const context={world:{},playing:true,restoring:true,runtimeFailed:false,loadingRun:false,checkpointRun(){},window:{showErr:(_where:string,error:Error)=>{throw error;}},tps:1,frameClock:createFrameClock(),performance:{now:()=>0},stepN:(_w,n)=>steps+=n,render:()=>renders++,requestAnimationFrame:()=>scheduled++};vm.runInNewContext(loop,context);for(let frame=0;frame<=200;frame++)context.loop(frame*50);assert.equal(renders,0);assert.equal(steps,0);assert.equal(scheduled,201);context.restoring=false;context.loop(10050);assert.equal(renders,1);assert.equal(steps,1,'only the new frame interval advances after restoration');context.playing=false;context.loop(10100);assert.equal(renders,2);assert.equal(steps,1);
});

it('a real render failure pauses normal stepping, preserves the actual Error and keeps the frame callback alive',()=>{const source=fs.readFileSync(new URL('../../web/main.js',import.meta.url),'utf8'),loop=source.match(/function loop[^\n]*\{[\s\S]*?\n\}/)?.[0];assert.ok(loop);const original=new TypeError('owned frame failure'),reported:any[]=[];let scheduled=0,renders=0;const context:any={world:{},playing:true,restoring:false,runtimeFailed:false,loadingRun:false,checkpointRun(){},tps:1,frameClock:createFrameClock(),stepN:()=>{throw Error('unexpected game step');},render:()=>{renders++;throw original;},requestAnimationFrame:()=>scheduled++,window:{showErr:(where,error)=>reported.push({where,error})}};vm.runInNewContext(loop!,context);context.loop(0);assert.equal(context.runtimeFailed,true);assert.equal(context.playing,false);assert.equal(reported[0].error,original);context.loop(50);assert.equal(scheduled,2);assert.equal(renders,1);});
