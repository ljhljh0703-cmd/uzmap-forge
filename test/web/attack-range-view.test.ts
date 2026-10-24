/** E2: view radii are compared with the real combat pipeline, never a copied
 * targeting predicate. Fixture shape reuses test/sim/combat-pipe.test.ts.
 * Original map/profile stay local; CI uses explicit source-semantic declarations. */
import {describe,it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as view from '../../web/battlefield-readability.js';
import {readScriptMap} from '../../src/runtime/session.ts';
import {createGemTowerSourceDefs} from '../../src/runtime/maps/gemtower.ts';
import {createUnitIdentityProvider} from '../../src/runtime/unit-identity.ts';
import {parseUnitAbilityProfile} from '../../src/formats/stock-unit-abilities.ts';
import {createEntity} from '../../src/sim/unit-entity.ts';
import {combatStep,type CombatCtx,type CombatEvent} from '../../src/sim/combat-pipe.ts';
import {makeNeutralGameConstants} from '../../src/sim/balance/config.ts';
import {GoldLedger} from '../../src/sim/balance/economy.ts';
import {Rng} from '../../src/sim/rng.ts';
import type {ObjectMod} from '../../src/ir/types.ts';

const declarations=[
 {id:'h030',acquire:700,mask:3,expected:[[1,700,3]]},
 {id:'h02A',acquire:1000,mask:3,expected:[[1,1000,3]]},
 {id:'n000',acquire:850,mask:1,second:[850,2],expected:[[1,130,1],[2,850,2]]},
 {id:'h02N',acquire:550,enabled:2,mask:3,second:[500,3],expected:[[2,500,3]]},
 {id:'h04S',acquire:800,enabled:2,mask:3,second:[700,3],expected:[[2,700,3]]},
 {id:'h004',acquire:800,mask:2,expected:[[1,800,2]]},
 {id:'h007',acquire:820,mask:2,expected:[[1,820,2]]},
 {id:'h008',acquire:620,mask:1,expected:[[1,620,1]]},
 {id:'h006',acquire:700,enabled:0,mask:3,expected:[]},
 {id:'h01Q',acquire:300,enabled:0,mask:3,expected:[]},
];
const stock:ObjectMod[]=[{kind:'unit',baseId:'hgtw',newId:null,mods:[
 {field:'uaen',value:1},{field:'ua1g',value:'ground,air'},
 {field:'ua1b',value:1},{field:'ua1d',value:1},{field:'ua1s',value:1},
 {field:'ua1c',value:1},{field:'ua1r',value:800},{field:'ua1t',value:'pierce'},
]}];
const maskText=(n:number)=>n===1?'ground':n===2?'air':'ground,air';
const fixedObjects:ObjectMod[]=declarations.map(row=>({kind:'unit',baseId:'hgtw',newId:row.id,mods:[
 {field:'uaen',value:row.enabled??(row.second?3:1)},
 {field:'uacq',value:row.acquire},{field:'ua1g',value:maskText(row.mask)},
 // The range slate's primary weapon is a source-filled hole in this provider.
 ...(row.id==='n000'?[{field:'ua1r',value:130},{field:'uabi',value:'A02J'}]:[]),
 ...(row.second?[
 {field:'ua2b',value:11},{field:'ua2d',value:1},{field:'ua2s',value:1},
 {field:'ua2c',value:1},{field:'ua2r',value:row.second[0]},
 {field:'ua2t',value:'normal'},{field:'ua2g',value:maskText(row.second[1]!)},
 ]:[]),
]}));
const mapPath=new URL('../../fixtures/maps/GemTower_Max_7C.w3x',import.meta.url);
const profilePath=new URL('../../fixtures/stock/unit-abilities.json',import.meta.url);
const hasOriginal=fs.existsSync(mapPath)&&fs.existsSync(profilePath);
function sourceDefs(){
 if(!hasOriginal)return createGemTowerSourceDefs(stock,fixedObjects).defStore.withIdentity(createUnitIdentityProvider(stock,fixedObjects));
 const {ir}=readScriptMap(new Uint8Array(fs.readFileSync(mapPath)),'E2 source range');
 const profile=parseUnitAbilityProfile(JSON.parse(fs.readFileSync(profilePath,'utf8')));
 return createGemTowerSourceDefs(profile.units,ir.objectMods).defStore.withIdentity(createUnitIdentityProvider(profile.units,ir.objectMods));
}
const defs=sourceDefs();
function models(entity:any,def:any,options:any={}){
 assert.equal(typeof view.attackRangeModels,'function','E2 must export its read-only range model');
 return view.attackRangeModels(entity,def,options);
}
const tower=(id:string)=>{const def=defs.getDef(id);return {def,entity:createEntity(def,{id:1,owner:0,x:0,y:0,facing:0}),state:{targetId:null as number|null}};};
function fires(id:string,distance:number,targetMask:number,options:{forced?:boolean;acquire?:number}={}){
 const t=tower(id);if(options.acquire!==undefined)t.entity.acquireRangeU=options.acquire;
 const def={...defs.getDef('h00D'),hpMax:1_000_000,armorType:'none',armorValue:0,attack:null,secondaryAttack:undefined};
 const target=createEntity(def,{id:2,owner:11,x:distance,y:0,facing:0});
 if(options.forced)t.entity.attackTargetId=target.id;
 const events:CombatEvent[]=[],ctx={towers:[t],creeps:[{def,entity:target,pathProgress:1,targetsMask:targetMask}],rng:new Rng(6),gc:makeNeutralGameConstants(),ledger:new GoldLedger(),bountyMode:'script',minDamage:1,emit:(event:CombatEvent)=>events.push(event)} as CombatCtx;
 combatStep(ctx);
 return events.some(event=>event.kind==='Attacked'&&event.targetUnitId===target.id);
}

describe('E2 actual combat range and target display ('+(hasOriginal?'local original identity':'fixed source identity')+')',()=>{
 for(const row of declarations)it(row.id+' displays its source-enabled weapon slots and effective automatic radii',()=>{
  const t=tower(row.id),result=models(t.entity,t.def);
  assert.deepEqual(result.map((r:any)=>[r.weaponSlot,r.radiusU,r.targetsMask]),row.expected);
  assert.ok(result.every((r:any)=>r.mode==='auto'));
  if(!result.length)for(const mask of [1,2])assert.equal(fires(row.id,1,mask),false,row.id+' has no normal weapon');
  for(const model of result){
   // Each target starts fresh so target retention and the other mask cannot
   // accidentally satisfy the boundary assertion. Read the actual attack event.
   const matching=model.targetsMask===3?[1,2]:[model.targetsMask];
   for(const mask of matching)for(const delta of [-1,0,1]){
    const distance=model.radiusU+delta;
    const covered=result.some((r:any)=>(r.targetsMask&mask)&&distance<=r.radiusU);
    assert.equal(fires(row.id,distance,mask),covered,`${row.id} mask=${mask}, radius=${model.radiusU}, delta=${delta}`);
   }
   if(model.targetsMask!==3)assert.equal(fires(row.id,1,model.targetsMask===1?2:1),result.some((r:any)=>r.targetsMask&(model.targetsMask===1?2:1)),row.id+' rejects unsupported target class');
  }
 });
 it('n000 never uses its long air radius to describe ground reach',()=>{
  const t=tower('n000'),result=models(t.entity,t.def);
  assert.equal(result.find((r:any)=>r.targetsMask===1)?.radiusU,130);
  assert.equal(result.find((r:any)=>r.targetsMask===2)?.radiusU,850);
  assert.equal(fires('n000',131,1),false);assert.equal(fires('n000',131,2),true);
 });
 it('runtime acquisition changes refresh the view and match combat without changing the weapon',()=>{
  const t=tower('h030'),original=t.def.attack!.rangeU;
  t.entity.acquireRangeU=250;assert.equal(models(t.entity,t.def)[0].radiusU,250);
  assert.equal(fires('h030',251,1,{acquire:250}),false);
  t.entity.acquireRangeU=500;assert.equal(models(t.entity,t.def)[0].radiusU,500);
  assert.equal(fires('h030',500,1,{acquire:500}),true);assert.equal(fires('h030',501,1,{acquire:500}),false);
  assert.equal(t.def.attack!.rangeU,original);
 });
 it('an explicit order displays weapon reach and agrees with real ordered combat beyond auto acquisition',()=>{
  for(const id of ['h030','h02A']){
   const t=tower(id);t.entity.acquireRangeU=250;
   const result=models(t.entity,t.def,{forced:true});
   assert.deepEqual(result.map((r:any)=>[r.weaponSlot,r.radiusU,r.mode]),[[1,t.def.attack!.rangeU,'ordered']]);
   const radius=result[0].radiusU;
   assert.equal(fires(id,radius,1,{forced:true,acquire:250}),true);
   assert.equal(fires(id,radius+1,1,{forced:true,acquire:250}),false);
   assert.equal(fires(id,radius,1,{acquire:250}),false);
  }
 });
 it('an absent runtime value falls back to weapon acquisition, including zero without truthy replacement',()=>{
  const t=tower('h030');delete t.entity.acquireRangeU;
  assert.equal(models(t.entity,t.def)[0].radiusU,Math.min(t.def.attack!.rangeU,t.def.attack!.acquireU));
  t.entity.acquireRangeU=0;assert.equal(models(t.entity,t.def)[0].radiusU,0);
  assert.equal(fires('h030',1,1,{acquire:0}),false);
 });
 it('invalid ranges or empty target classes are omitted rather than replaced by invented radius',()=>{
  const t=tower('h030');
  for(const value of [NaN,-1]){
   assert.deepEqual(models(t.entity,{...t.def,attack:{...t.def.attack!,rangeU:value}}),[]);
   assert.deepEqual(models({...t.entity,acquireRangeU:value},t.def),[]);
  }
  // Infinity in one cap still produces the other finite cap in combatStep.
  // Only the resulting non-finite reach is undisplayable.
  assert.equal(models(t.entity,{...t.def,attack:{...t.def.attack!,rangeU:Infinity}})[0].radiusU,t.entity.acquireRangeU);
  assert.equal(models({...t.entity,acquireRangeU:Infinity},t.def)[0].radiusU,t.def.attack!.rangeU);
  assert.deepEqual(models({...t.entity,acquireRangeU:Infinity},{...t.def,attack:{...t.def.attack!,rangeU:Infinity}}),[]);
  assert.deepEqual(models(t.entity,{...t.def,attack:{...t.def.attack!,targetsMask:0}}),[]);
  assert.deepEqual(models(t.entity,{...t.def,attack:{...t.def.attack!,targetsMask:4}}),[]);
 });
 it('repeated presentation leaves entity, source definition, RNG and command records untouched',()=>{
  const t=tower('n000'),rng=new Rng(6),inputLog:any[]=[];
  const before=structuredClone({entity:t.entity,def:t.def,rng:rng.getState(),inputLog});
  for(let i=0;i<40;i++)models(t.entity,t.def);
  assert.deepEqual({entity:t.entity,def:t.def,rng:rng.getState(),inputLog},before);
 });
});
