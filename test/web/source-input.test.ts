import {it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parseUnitAbilityProfile} from '../../src/formats/stock-unit-abilities.ts';
import {isLocalGameHost,readPlayFiles,sourceGemPresentation,MAP_SHA256,PROFILE_SHA256} from '../../web/source-input.js';
import {readScriptMap} from '../../src/runtime/session.ts';
import {createGemTowerSourceDefs} from '../../src/runtime/maps/gemtower.ts';
const map=new URL('../../fixtures/maps/GemTower_Max_7C.w3x',import.meta.url),profile=new URL('../../fixtures/stock/unit-abilities.json',import.meta.url);
function file(body:Uint8Array){return {size:body.length,arrayBuffer:async()=>body.buffer.slice(body.byteOffset,body.byteOffset+body.byteLength)};}
it('only exact loopback hosts can automatically load private server inputs',()=>{for(const h of ['localhost','127.0.0.1','::1','[::1]'])assert.equal(isLocalGameHost(h),true);for(const h of ['ljhljh0703-cmd.github.io','localhost.example.com','127.0.0.1.example.com','192.168.1.2',''])assert.equal(isLocalGameHost(h),false);});
it('missing or oversized source files fail before attempting game boot',async()=>{await assert.rejects(()=>readPlayFiles(null,null,parseUnitAbilityProfile),/두 파일/);await assert.rejects(()=>readPlayFiles({size:100e6},file(new Uint8Array(1)),parseUnitAbilityProfile),/크기/);});
it('wrong map and stock bytes are rejected instead of silently entering degraded play',async()=>{
 let parseCalls=0;const fake=file(new TextEncoder().encode('{}')),parse=()=>{parseCalls++;};
 await assert.rejects(()=>readPlayFiles(fake,fake,parse),/맵.*다릅/);
 assert.equal(parseCalls,0);
});
it('source names and gem identities come from provided data while retaining existing presentation',()=>{const input={names:{h001:'existing'},gemIds:new Set(['h001'])};const out=sourceGemPresentation(input,[{kind:'unit',newId:'h002',baseId:'hfoo'},{kind:'unit',newId:'n001',baseId:'hfoo'}],id=>({name:'TRIGSTR_100',attack:null,meta:{role:{kind:id==='h002'?'tower':'creep'}}}));assert.deepEqual([...out.gemIds],['h001','h002']);assert.equal(out.names.h002,'TRIGSTR_100');assert.equal(input.names.h002,undefined);assert.equal(input.gemIds.size,1);});
it('exact local test inputs reuse the existing parser and retain every source gem identity',{skip:!existsSync(map)||!existsSync(profile)},async()=>{
 const mb=readFileSync(map),pb=readFileSync(profile),mhash=createHash('sha256').update(mb).digest('hex'),phash=createHash('sha256').update(pb).digest('hex');
 assert.equal(mhash,MAP_SHA256);assert.equal(phash,PROFILE_SHA256);
 const got=await readPlayFiles(file(mb),file(pb),parseUnitAbilityProfile);assert.equal(got.stockProfile.sourceVersion,'1.28.5.7680');assert.equal(createHash('sha256').update(new Uint8Array(got.mapBytes)).digest('hex'),mhash);
 await assert.rejects(()=>readPlayFiles(file(mb),file(new TextEncoder().encode('{}')),parseUnitAbilityProfile),/능력 자료.*다릅/);
 const loaded=readScriptMap(new Uint8Array(got.mapBytes),'GemTower_Max_7C.w3x'),defs=createGemTowerSourceDefs(got.stockProfile.units,loaded.ir.objectMods);
 const out=sourceGemPresentation({names:{},gemIds:new Set()},loaded.ir.objectMods,id=>defs.defStore.getDef(id));
 const census=new URL('../../docs/dissection/towers_full.json',import.meta.url);if(existsSync(census)){const raw=JSON.parse(readFileSync(census,'utf8'));for(const g of [...raw.grid,...raw.beyondGrid])assert.ok(out.gemIds.has(g.id),g.id+' source gem identity missing');}
 assert.ok(out.gemIds.size>=70);assert.equal(createHash('sha256').update(pb).digest('hex'),phash);
});
