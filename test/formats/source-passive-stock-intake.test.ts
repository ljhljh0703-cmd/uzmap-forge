import {it} from 'node:test';
import assert from 'node:assert/strict';
import {parseUnitAbilityProfile} from '../../src/formats/stock-unit-abilities.ts';
import {resolveObjectFields} from '../../src/formats/objects.ts';
const families=['AHbh','Aliq','Aven','AUts'];
function profile():any{return {format:'uzmap-unit-abilities-v1',sourceVersion:'1.28.5.7680',sourceSha256:'156052e0f5c7d8b69c2e299a8d975d94bffd64731b65fbac194a712a706e9410',units:{hfoo:''},abilitySource:{dataSha256:'ddc360800784f808219bbc2518b16b0f12413082aada2755cc00944adcc31cec',metadataSha256:'42249bc577463896a9b1fece959c6bd5f815eb42c4899b8c899620b547a5b3f6'},abilityData:{ACct:[{field:'Ocr1',value:5,level:1,column:1}]}};}
const mods=(p:any,id:string)=>parseUnitAbilityProfile(p).abilities.find(o=>o.baseId===id)?.mods;
it('the exact existing profile provenance supplements only the four missing stock families with source field coordinates',()=>{
 const p=profile(),out=parseUnitAbilityProfile(p);assert.equal(out.sourceVersion,p.sourceVersion);
 for(const id of families)assert.ok(out.abilities.some(o=>o.baseId===id),id);
 assert.deepEqual(mods(p,'AHbh')?.filter(m=>m.field==='Hbh1').map(m=>[m.value,m.level,m.column]),[[20,1,1],[30,2,1],[40,3,1]]);
 assert.deepEqual(mods(p,'Aliq')?.find(m=>m.field==='liq3'),{field:'liq3',value:.8,level:1,column:3});
 assert.deepEqual(mods(p,'Aven')?.find(m=>m.field==='atar'),{field:'atar',value:'air,ground,organic',level:1,column:0});
 assert.deepEqual(mods(p,'AUts')?.filter(m=>m.field==='Uts2').map(m=>[m.value,m.level,m.column]),[[1,1,2],[1,2,2],[1,3,2]]);
});
it('a different version or any missing/different provenance hash cannot receive those declared stock defaults',()=>{
 const candidates=[{sourceVersion:'1.28.5.7699'},{sourceSha256:'a'.repeat(64)},{abilitySource:undefined},{abilitySource:null},{abilitySource:[]},{abilitySource:{...profile().abilitySource,dataSha256:'a'.repeat(64)}},{abilitySource:{...profile().abilitySource,metadataSha256:'a'.repeat(64)}}];
 for(const changed of candidates){const p={...profile(),...changed};assert.equal(parseUnitAbilityProfile(p).abilities.some(o=>families.includes(o.baseId)),false);}
});
it('provided stock bases and their fields are never filled or overwritten while missing siblings still resolve',()=>{
 const p=profile();p.abilityData.AHbh=[{field:'Hbh1',value:77,level:1,column:1}];const original=JSON.stringify(p);
 const out=parseUnitAbilityProfile(p);assert.deepEqual(out.abilities.find(o=>o.baseId==='AHbh')?.mods,p.abilityData.AHbh);assert.ok(out.abilities.some(o=>o.baseId==='Aliq'));assert.equal(JSON.stringify(p),original);
 assert.deepEqual(out.abilities.find(o=>o.baseId==='ACct')?.mods,p.abilityData.ACct);
});
it('blank source fields remain absent rather than being invented as zero or false',()=>{
 const p=profile();assert.ok(mods(p,'AHbh'));
 assert.equal(mods(p,'AHbh')?.some(m=>m.field==='Hbh5'),false);assert.equal(mods(p,'AHbh')?.some(m=>m.field==='aran'),false);
 assert.equal(mods(p,'Aven')?.some(m=>m.field==='aare'),false);
 assert.equal(mods(p,'AUts')?.some(m=>m.field==='adur'&&m.level===2),false);
});
it('each parse returns independent stock records without mutating input or leaking changes to later parses',()=>{
 const p=profile(),before=JSON.stringify(p),first=parseUnitAbilityProfile(p),family=first.abilities.find(o=>o.baseId==='AHbh');assert.ok(family);
 family.mods[0]!.value=999;family.mods.push({field:'Hbh5',value:0,level:1,column:5});
 const next=parseUnitAbilityProfile(p).abilities.find(o=>o.baseId==='AHbh')!;assert.notEqual(next.mods[0]!.value,999);assert.equal(next.mods.some(m=>m.field==='Hbh5'),false);assert.equal(JSON.stringify(p),before);
});
it('source custom deltas retain the existing field/level/column precedence over supplied defaults',()=>{
 const stock=parseUnitAbilityProfile(profile()).abilities;
 const fields=resolveObjectFields('ability','BASH',stock,[{kind:'ability',baseId:'AHbh',newId:'BASH',mods:[{field:'Hbh1',value:66,level:1,column:1}]}]);
 assert.deepEqual(fields.find(m=>m.field==='Hbh1'&&m.level===1),{field:'Hbh1',value:66,level:1,column:1});assert.equal(fields.some(m=>m.field==='Hbh5'),false);
});
