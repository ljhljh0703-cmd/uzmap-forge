import {it} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {combatEffectLabels,attackDisplay,attackTargetLabel} from '../../web/play-ui.js';
import {rawCodeOf} from '../../src/ir/fourcc.ts';import {resolveWtsText} from '../../src/formats/wts.ts';
it('Bash displays its chance, neutral-zero damage multiplier and normal/hero stun durations explicitly',()=>{
 const labels=combatEffectLabels([{kind:'bash',chancePm:250,multiplierPm:0,durationTicks:20,heroDurationTicks:10,targetsMask:3}],.05);
 assert.match(labels[0],/강타.*25%/);assert.match(labels[0],/피해.*1배/);assert.match(labels[0],/기절.*1초/);assert.match(labels[0],/영웅.*0.5초/);assert.doesNotMatch(labels[0],/독|NaN|undefined/);
});
it('equal stun durations do not invent a different hero duration and unknown descriptors use a safe fallback',()=>{
 const labels=combatEffectLabels([{kind:'bash',chancePm:100,multiplierPm:2000,durationTicks:30,heroDurationTicks:30,targetsMask:1},{kind:'future-effect'}],.05);
 assert.match(labels[0],/기절.*1.5초/);assert.doesNotMatch(labels[0],/영웅/);assert.match(labels[1],/확인|지원/);assert.ok(labels.every((s:string)=>!/(독|NaN|undefined)/.test(s)));
});
function selectedEffects(){
 const source=fs.readFileSync(new URL('../../web/main.js',import.meta.url),'utf8'),start=source.indexOf('    const effects=combatEffectLabels('),end=source.indexOf('    const upgrades=',start);assert.ok(start>0&&end>start);
 const sourceText=source.match(/^function sourceText\([^\n]*$/m)?.[0];assert.ok(sourceText);
 const historical=new Set(['FIRE','Adts']),abilities=new Map([[rawCodeOf('FIRE'),1],[rawCodeOf('Adts'),1]]),node:any={hidden:true,textContent:''},catalog={effects:()=>[],unresolved:historical,unresolvedFor:(current:Map<number,number>)=>(current.get(rawCodeOf('FIRE'))??0)===1?['FIRE']:[]};
 const w={sim:{abilityEffects:catalog,mapIr:{objectMods:[{kind:'ability',baseId:'Aliq',newId:'FIRE',mods:[{field:'anam',value:'TRIGSTR_42'}]}]}},strings:new Map([[42,'|cffff0000원작의 불꽃|r']])};
 const context:any={w,d:{},selected:{abilities},DT:.05,$:()=>node,combatEffectLabels,attackDisplay,attackTargetLabel,resolveWtsText};vm.runInNewContext(sourceText,context);
 return {paint:()=>vm.runInNewContext('{\n'+source.slice(start,end)+'\n}',context),abilities,node,catalog,w};
}
it('selected-unit unsupported warnings use current grant/level and original WTS names, not the historical global unresolved set',()=>{
 const f=selectedEffects();f.paint();assert.equal(f.node.hidden,false);assert.match(f.node.textContent,/원작의 불꽃/);assert.match(f.node.textContent,/미지원|지원하지|확인 중/);assert.doesNotMatch(f.node.textContent,/FIRE|Adts|TRIGSTR|NaN|undefined/);
 f.abilities.set(rawCodeOf('FIRE'),2);f.paint();assert.equal(f.node.hidden,true,'a resolved current level must not retain the historical warning');
 f.abilities.delete(rawCodeOf('FIRE'));f.paint();assert.equal(f.node.hidden,true,'removed abilities and unknown dummy abilities must not advertise unsupported combat');
});
it('a catalog without the optional current-resolution API keeps existing labels, and an unnamed warning never exposes a raw ID',()=>{
 const f=selectedEffects();delete (f.catalog as any).unresolvedFor;f.paint();assert.equal(f.node.hidden,true);
 (f.catalog as any).unresolvedFor=()=>['FIRE'];f.w.sim.mapIr.objectMods[0].mods=[];f.paint();assert.equal(f.node.hidden,false);assert.doesNotMatch(f.node.textContent,/FIRE|undefined|NaN/);
});
