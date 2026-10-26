import {it} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import {createFrameClock} from "../../src/sim/ticks.ts";

it("the actual browser startup uses one rAF timestamp source, even when the first paint predates bootstrap", () => {
  const source=fs.readFileSync(new URL("../../web/main.js",import.meta.url),"utf8");
  const loop=source.match(/function loop[^\n]*\{[\s\S]*?\n\}/)?.[0];
  const start=source.match(/^resize\(\);.*loadFromUrl\([^;]*\);$/m)?.[0];
  assert.ok(loop && start);
  const pending:Array<(time:number)=>void>=[];let quiets=0;
  const context={quietActionFeedback:()=>quiets++,world:null,playing:false,restoring:false,runtimeFailed:false,loadingRun:false,checkpointRun(){},window:{showErr:(_where:string,error:Error)=>{throw error;}},tps:1,frameClock:createFrameClock(),
    performance:{now:()=>100},sessionSeed:6,launchChallenge:null,resize:()=>{},loadFromUrl:()=>{},
    requestAnimationFrame:(callback:(time:number)=>void)=>pending.push(callback)};
  // The former mixed-clock bootstrap really fails under this timing.
  const oldPending:Array<(time:number)=>void>=[];
  vm.runInNewContext(loop+"\nresize(); loop(); loadFromUrl();",{
    ...context,frameClock:createFrameClock(),requestAnimationFrame:(callback:(time:number)=>void)=>oldPending.push(callback)});
  assert.throws(()=>oldPending[0]!(90),/invalid frame time/);assert.equal(quiets,1,'the intentional mixed-clock failure silences view feedback');
  vm.runInNewContext(loop+"\n"+start,context);
  const first=pending.shift();assert.ok(first);
  assert.doesNotThrow(()=>first(90));assert.equal(quiets,1,'correct rAF startup does not silence valid audio');
});

it('restoring frames do no hidden game rendering or stepping, retain scheduling and never catch up restoration time',()=>{
 const source=fs.readFileSync(new URL('../../web/main.js',import.meta.url),'utf8'),loop=source.match(/function loop[^\n]*\{[\s\S]*?\n\}/)?.[0];assert.ok(loop);let renders=0,steps=0,scheduled=0,quiets=0;const context={quietActionFeedback:()=>quiets++,world:{},playing:true,restoring:true,runtimeFailed:false,loadingRun:false,checkpointRun(){},window:{showErr:(_where:string,error:Error)=>{throw error;}},tps:1,frameClock:createFrameClock(),performance:{now:()=>0},stepN:(_w,n)=>steps+=n,render:()=>renders++,requestAnimationFrame:()=>scheduled++};vm.runInNewContext(loop,context);for(let frame=0;frame<=200;frame++)context.loop(frame*50);assert.equal(renders,0);assert.equal(steps,0);assert.equal(scheduled,201);context.restoring=false;context.loop(10050);assert.equal(renders,1);assert.equal(steps,1,'only the new frame interval advances after restoration');context.playing=false;context.loop(10100);assert.equal(renders,2);assert.equal(steps,1);assert.equal(quiets,0);
});

it('a real render failure pauses normal stepping, preserves the actual Error and keeps the frame callback alive',()=>{const source=fs.readFileSync(new URL('../../web/main.js',import.meta.url),'utf8'),loop=source.match(/function loop[^\n]*\{[\s\S]*?\n\}/)?.[0];assert.ok(loop);const original=new TypeError('owned frame failure'),reported:any[]=[];let scheduled=0,renders=0,quiets=0;const context:any={quietActionFeedback:()=>quiets++,world:{},playing:true,restoring:false,runtimeFailed:false,loadingRun:false,checkpointRun(){},tps:1,frameClock:createFrameClock(),stepN:()=>{throw Error('unexpected game step');},render:()=>{renders++;throw original;},requestAnimationFrame:()=>scheduled++,window:{showErr:(where,error)=>reported.push({where,error})}};vm.runInNewContext(loop!,context);context.loop(0);assert.equal(context.runtimeFailed,true);assert.equal(context.playing,false);assert.equal(reported[0].error,original);context.loop(50);assert.equal(scheduled,2);assert.equal(renders,1);assert.equal(quiets,1,'one real fatal frame stops audio once');});

it('the newly booted startup clock may finish its original delay while required art is still loading; pre-boot paused loads never advance',()=>{const source=fs.readFileSync(new URL('../../web/main.js',import.meta.url),'utf8'),loop=source.match(/function loop[^\n]*\{[\s\S]*?\n\}/)?.[0];assert.ok(loop);let steps=0;const c:any={world:{},playing:false,restoring:false,runtimeFailed:false,loadingRun:true,quietActionFeedback(){},checkpointRun(){},frameClock:createFrameClock(),tps:1,stepN:(_w:any,n:number)=>steps+=n,render(){},requestAnimationFrame(){},window:{showErr(_where:any,e:any){throw e;}}};vm.runInNewContext(loop,c);for(let i=0;i<=20;i++)c.loop(i*50);assert.equal(steps,0);c.playing=true;c.loop(1000);for(let i=21;i<=40;i++)c.loop(i*50);assert.equal(steps,20,'actual fixed-step source delay overlaps the required-art wait');c.playing=false;c.loop(2050);assert.equal(steps,20);});
