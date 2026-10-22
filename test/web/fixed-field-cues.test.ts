import {it} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import vm from 'node:vm';import * as ui from '../../web/play-ui.js';import {readScriptMap} from '../../src/runtime/session.ts';
const source=readFileSync(new URL('../../web/main.js',import.meta.url),'utf8');
it('the mobile play view exposes no map movement or zoom controls',()=>{const html=readFileSync(new URL('../../web/index.html',import.meta.url),'utf8');assert.doesNotMatch(html,/id="(?:cameraToggle|focusPlayer|focusCombat|zoomIn|zoomOut)"|class="camera-menu"/);});
it('a swipe cancels a tap and never moves the camera, even for a legacy free-view state',()=>{
 const handlers=new Map<string,Function>(),cam={cx:0,cy:0,zoom:1};const cv={width:200,height:200,addEventListener:(k:string,f:Function)=>handlers.set(k,f),getBoundingClientRect:()=>({left:0,top:0,width:200,height:200}),setPointerCapture:()=>{}};
 const ctx:any={surface:cv,cv,cam,classifyMapGesture:ui.classifyMapGesture,drag:{on:false},world:{pm:null,cameraMode:'free'},mouseScreen:{},gemNear:()=>null,S2WX:(n:number)=>n,S2WY:(n:number)=>n};
 const a=source.indexOf('surface.addEventListener("pointerdown"'),b=source.indexOf('function focusPlayer(w)',a);vm.runInNewContext(source.slice(a,b),ctx);
 handlers.get('pointerdown')!({target:cv,isPrimary:true,button:0,pointerId:1,clientX:10,clientY:10});handlers.get('pointermove')!({isPrimary:true,pointerId:1,clientX:50,clientY:50});assert.deepEqual(cam,{cx:0,cy:0,zoom:1});assert.equal(ctx.drag.moved,true);assert.equal(handlers.has('wheel'),false);
});
it('entry and outward mine-route markers do not overlap the world, including their rotated 16px boxes',()=>{
 const box={left:20,top:20,width:250,height:300};
 for(const [from,to] of [[{x:-30,y:70},{x:25,y:70}],[{x:310,y:70},{x:260,y:70}],[{x:100,y:-20},{x:100,y:30}],[{x:100,y:350},{x:100,y:310}]]){
  const p=ui.ingressMarker(from,to,box),r=p.angle*Math.PI/180,half=8*(Math.abs(Math.cos(r))+Math.abs(Math.sin(r)));
  assert.ok(p.x+half<=box.left||p.x-half>=box.left+box.width||p.y+half<=box.top||p.y-half>=box.top+box.height,'entry overlaps the combat world');
 }
 const out=ui.ingressMarker({x:100,y:290},{x:400,y:290},box,true);assert.ok(out.x-8>=box.left+box.width);assert.equal(out.angle,0);
});
it('the approved fitted framing is unchanged',()=>{const c=ui.battlefieldCamera([{minX:-3872,minY:5600,maxX:-1760,maxY:8224}],476,650);assert.deepEqual(c,{cx:-2816,cy:6912,zoom:436/2368});});
it('life feedback reports a real decrease, without invented minus-one loss or initial-load warnings',()=>{assert.equal(ui.lifeLossFeedback(undefined,15),null);assert.equal(ui.lifeLossFeedback(15,15),null);assert.equal(ui.lifeLossFeedback(15,16),null);assert.equal(ui.lifeLossFeedback(15,12),'광산 도달 · 생명 3 감소');});
const map=new URL('../../fixtures/maps/GemTower_Max_7C.w3x',import.meta.url);
it('the mine-route cue is tied to the actual source life-loss gate rather than the last local turn',{skip:!existsSync(map)},()=>{const {ir}=readScriptMap(new Uint8Array(readFileSync(map)),'GemTower_Max_7C.w3x'),s=ir.script.source.replace(/\r/g,'\n');assert.match(s,/TriggerRegisterEnterRectSimple\(in,Do\)/);assert.match(s,/TriggerAddAction\(in,function p4\)/);const p4=s.match(/function p4 takes[\s\S]*?endfunction/)![0];assert.ok(p4.includes('set C[1]=(C[1]-GetUnitPointValue(GetTriggerUnit()))'));assert.match(s,/function b5 takes[\s\S]*?GetRectCenter\(Do\)/);});
