import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCombatAbilityCatalog} from '../../src/runtime/ability-effects.ts';
import {rawCodeOf} from '../../src/ir/fourcc.ts';
import {parseUnitAbilityProfile} from '../../src/formats/stock-unit-abilities.ts';
import {readScriptMap} from '../../src/runtime/session.ts';
import type {ObjectMod} from '../../src/ir/types.ts';
const mod=(field:string,value:number|string,level=1)=>({field,value,level,column:0});
const ability=(baseId:string,newId:string|null,mods:ObjectMod['mods']):ObjectMod=>({kind:'ability',baseId,newId,mods});
function bash(overrides:ObjectMod['mods']=[]){return createCombatAbilityCatalog([ability('AHbh',null,[mod('alev',1,0),mod('Hbh1',20),mod('Hbh2',0),mod('Hbh3',0),mod('Hbh4',0),mod('adur',2),mod('ahdu',2),mod('atar','air,enemies,ground')])],[ability('AHbh','B001',overrides)]);}
it('the source zero-bonus no-miss Bash subset resolves chance, neutral multiplier and stun without inventing Hbh5',()=>{
 const c=bash(),effects=c.effects(new Map([[rawCodeOf('B001'),1]]));assert.deepEqual(effects,[{kind:'bash',chancePm:200,multiplierPm:1000,durationTicks:40,heroDurationTicks:40,targetsMask:3}]);assert.deepEqual(c.unresolvedFor?.(new Map([[rawCodeOf('B001'),1]])),[]);
});
it('Bash source damage multipliers and normal/hero-equal durations use existing tick rounding',()=>{
 const effects=bash([mod('Hbh1',2),mod('Hbh2',30),mod('adur',1.100000023841858),mod('ahdu',1.100000023841858)]).effects(new Map([[rawCodeOf('B001'),1]]));assert.equal(effects[0]?.kind,'bash');assert.equal((effects[0] as any).chancePm,20);assert.equal((effects[0] as any).multiplierPm,30000);assert.equal((effects[0] as any).durationTicks,22);
});
it('unproven bonus/miss/hero-duration combinations remain unresolved rather than partially applying',()=>{
 for(const fields of [[mod('Hbh3',1)],[mod('Hbh4',.2)],[mod('ahdu',1)],[mod('Hbh2',.5)],[mod('atar','air,enemies,ground,structure')]]){const c=bash(fields);assert.deepEqual(c.effects(new Map([[rawCodeOf('B001'),1]])),[]);assert.deepEqual(c.unresolvedFor?.(new Map([[rawCodeOf('B001'),1]])),['B001']);}
});
it('neutral-factor carapace uses current levels as existing self armor and refuses unproven reflection/reduction',()=>{
 const stock=ability('AUts',null,[mod('alev',3,0),mod('Uts1',.15),mod('Uts2',1),mod('Uts3',3),mod('Uts2',1,2),mod('Uts2',1,3)]);
 const own=ability('AUts','C001',[mod('alev',20,0),...Array.from({length:20},(_,i)=>[mod('Uts1',0,i+1),mod('Uts3',-10*i,i+1)]).flat()]);const c=createCombatAbilityCatalog([stock],[own]);
 for(const level of [1,2,20,99]){const effect=c.effects(new Map([[rawCodeOf('C001'),level]]));assert.deepEqual(effect,[{kind:'selfArmor',flatBonus:-10*(Math.min(level,20)-1)}]);}
 const incomplete=createCombatAbilityCatalog([stock],[]);assert.deepEqual(incomplete.effects(new Map([[rawCodeOf('AUts'),1]])),[]);assert.deepEqual(incomplete.unresolvedFor?.(new Map([[rawCodeOf('AUts'),1]])),['AUts']);
});
it('current-level diagnostics are not the historical unresolved set and dummy families are not automatically missing combat',()=>{
 const c=createCombatAbilityCatalog([ability('AHbh',null,[mod('alev',2,0),mod('Hbh1',10),mod('Hbh2',0),mod('Hbh3',1),mod('Hbh3',0,2),mod('Hbh4',0),mod('adur',1),mod('ahdu',1),mod('atar','ground,enemies')])],[]),ids=new Map([[rawCodeOf('AHbh'),1]]);
 assert.deepEqual(c.unresolvedFor?.(ids),['AHbh']);ids.set(rawCodeOf('AHbh'),2);assert.equal(c.effects(ids)[0]?.kind,'bash');assert.deepEqual(c.unresolvedFor?.(ids),[]);ids.set(rawCodeOf('AHbh'),1);assert.deepEqual(c.unresolvedFor?.(ids),['AHbh']);assert.deepEqual(c.unresolvedFor?.(new Map([[rawCodeOf('Adts'),1]])),[]);
});
it('source venom and liquid-fire families stay explicitly unresolved until their damage timing and stacking are implemented',()=>{
 const c=createCombatAbilityCatalog([ability('Aven',null,[mod('alev',1,0)]),ability('Aliq',null,[mod('alev',1,0)])],[]),ids=new Map([[rawCodeOf('Aven'),1],[rawCodeOf('Aliq'),1]]);assert.deepEqual(c.effects(ids),[]);assert.deepEqual(c.unresolvedFor?.(ids),['Aven','Aliq']);
});
it('the original map/profile resolves twelve Bash grants and neutral-factor carapace without modifying approved inputs',{skip:!fs.existsSync('fixtures/maps/GemTower_Max_7C.w3x')||!fs.existsSync('fixtures/stock/unit-abilities.json')},()=>{
 const map=fs.readFileSync('fixtures/maps/GemTower_Max_7C.w3x'),bytes=fs.readFileSync('fixtures/stock/unit-abilities.json'),profile=parseUnitAbilityProfile(JSON.parse(bytes.toString())),{ir}=readScriptMap(new Uint8Array(map),'source-passive-catalog'),c=createCombatAbilityCatalog(profile.abilities,ir.objectMods);
 const entries=ir.objectMods.filter(o=>o.kind==='ability'&&['AHbh','AUts'].includes(o.baseId));assert.equal(entries.filter(o=>o.baseId==='AHbh').length,12);assert.equal(entries.filter(o=>o.baseId==='AUts').length,1);
 for(const entry of entries){const id=entry.newId??entry.baseId,level=id==='A02K'?20:1;assert.equal(c.effects(new Map([[rawCodeOf(id),level]]))[0]?.kind,id==='A02K'?'selfArmor':'bash',id);assert.deepEqual(c.unresolvedFor?.(new Map([[rawCodeOf(id),level]])),[],id);}
 assert.equal(fs.readFileSync('fixtures/stock/unit-abilities.json').equals(bytes),true);assert.equal(fs.readFileSync('fixtures/maps/GemTower_Max_7C.w3x').equals(map),true);
});
