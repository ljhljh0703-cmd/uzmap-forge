import {it} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createCombatAbilityCatalog} from '../../src/runtime/ability-effects.ts';
import {rawCodeOf} from '../../src/ir/fourcc.ts';
import {parseUnitAbilityProfile} from '../../src/formats/stock-unit-abilities.ts';
import {readScriptMap} from '../../src/runtime/session.ts';
import type {ObjectMod} from '../../src/ir/types.ts';
const m=(field:string,value:number|string,level=1)=>({field,value,level,column:0});
function fixture(family:'Aven'|'Aliq',overrides:ObjectMod['mods']=[]){
 const common=[m('alev',2,0),m('adur',1.1),m('ahdu',1.1),m('atar','air,enemies,ground')];
 const fields=family==='Aven'?[m('Poi1',10),m('Poi2',0),m('Poi3',0),m('Poi4',1),m('abuf','Bpoi,Bpsd')]:[m('liq1',50),m('liq2',0),m('liq3',0),m('liq4',0),m('abuf','Bliq')];
 const stock:ObjectMod[]=[{kind:'ability',baseId:family,newId:null,mods:[...common,...fields]}];
 return createCombatAbilityCatalog(stock,[{kind:'ability',baseId:family,newId:'TEST',mods:overrides}]);
}
const grants=(level=1)=>new Map([[rawCodeOf('TEST'),level]]);
it('damage-only envenomed spears resolves its canonical stacking buff and source DPS with a separate effect kind',()=>{
 const c=fixture('Aven');assert.deepEqual(c.effects(grants()),[{kind:'venom',damagePerSecondPm:10000,durationTicks:22,targetsMask:3,buffId:'Bpsd'}]);assert.deepEqual(c.unresolvedFor?.(grants()),[]);
});
it('liquid fire without speed/repair changes resolves its own canonical buff and source magnitude',()=>{
 const c=fixture('Aliq',[m('liq1',-50),m('adur',4.099999904632568),m('ahdu',4.099999904632568)]);assert.deepEqual(c.effects(grants()),[{kind:'liquidFire',damagePerSecondPm:50000,durationTicks:82,targetsMask:3,buffId:'Bliq'}]);
});
it('unsupported venom stacking, speed, buff, duration, target and missing fields stay visible as unresolved',()=>{
 for(const mods of [[m('Poi4',0)],[m('Poi4',9)],[m('Poi2',.1)],[m('Poi3',.1)],[m('abuf','Bxxx')],[m('ahdu',2)],[m('atar','air,enemies,ground,organic')],[m('adur',0),m('ahdu',0)]]){const c=fixture('Aven',mods);assert.deepEqual(c.effects(grants()),[],JSON.stringify(mods));assert.deepEqual(c.unresolvedFor?.(grants()),['TEST']);}
 assert.deepEqual(createCombatAbilityCatalog([],[{kind:'ability',baseId:'Aven',newId:'TEST',mods:[]}]).effects(grants()),[]);
});
it('unsupported liquid fire speed, repair, buff and target variants remain unresolved',()=>{
 for(const mods of [[m('liq2',.1)],[m('liq3',.8)],[m('liq4',1)],[m('abuf','Bxxx')],[m('atar','structure,enemy,neutral')],[m('ahdu',3)]]){const c=fixture('Aliq',mods);assert.deepEqual(c.effects(grants()),[]);assert.deepEqual(c.unresolvedFor?.(grants()),['TEST']);}
});
it('current grant level and removal resolve supported DOT values without mutating earlier descriptors',()=>{
 const c=fixture('Aven',[m('Poi1',-7,2)]),ids=grants(),l1=c.effects(ids);assert.equal((l1[0] as any).damagePerSecondPm,10000);ids.set(rawCodeOf('TEST'),2);assert.equal((c.effects(ids)[0] as any).damagePerSecondPm,7000);assert.equal((l1[0] as any).damagePerSecondPm,10000);ids.delete(rawCodeOf('TEST'));assert.deepEqual(c.effects(ids),[]);assert.deepEqual(c.unresolvedFor?.(ids),[]);
});
it('all eleven original venom and fire levels resolve only through the unchanged approved profile and real map',{skip:!fs.existsSync('fixtures/maps/GemTower_Max_7C.w3x')||!fs.existsSync('fixtures/stock/unit-abilities.json')},()=>{
 const raw=fs.readFileSync('fixtures/stock/unit-abilities.json'),map=fs.readFileSync('fixtures/maps/GemTower_Max_7C.w3x'),p=parseUnitAbilityProfile(JSON.parse(raw.toString())),{ir}=readScriptMap(new Uint8Array(map),'dot-catalog'),c=createCombatAbilityCatalog(p.abilities,ir.objectMods);
 const venom=[1000,2500,5000,7500,10000,20000,40000,80000,100000,130000,150000],fire=[50,100,200,300,400,500,600,700,800,900,1000];
 for(let level=1;level<=11;level++)for(const [id,kind,damage,duration,buff] of [['A05T','venom',venom[level-1]*1000,22,'Bpsd'],['A098','liquidFire',fire[level-1]*1000,82,'Bliq']] as const){const ids=new Map([[rawCodeOf(id),level]]);assert.deepEqual(c.effects(ids),[{kind,damagePerSecondPm:damage,durationTicks:duration,targetsMask:3,buffId:buff}],id+':'+level);assert.deepEqual(c.unresolvedFor?.(ids),[]);}
 assert.equal(raw.equals(fs.readFileSync('fixtures/stock/unit-abilities.json')),true);assert.equal(map.equals(fs.readFileSync('fixtures/maps/GemTower_Max_7C.w3x')),true);
});

it('DOT descriptors reject damage budgets and durations that cannot be represented by safe integer state',()=>{for(const family of ['Aven','Aliq'] as const)for(const fields of [[m(family==='Aven'?'Poi1':'liq1',Number.MAX_VALUE)],[m('adur',Number.MAX_VALUE),m('ahdu',Number.MAX_VALUE)],[m('adur',.001),m('ahdu',.001)]]){const c=fixture(family,fields);assert.deepEqual(c.effects(grants()),[]);assert.deepEqual(c.unresolvedFor?.(grants()),['TEST']);}});
