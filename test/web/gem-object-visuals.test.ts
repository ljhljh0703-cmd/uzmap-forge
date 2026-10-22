import {it} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as ui from '../../web/play-ui.js';
import {SpriteBank,spriteFrame} from '../../web/visual-assets.js';
import {readScriptMap,createSession} from '../../src/runtime/session.ts';
import {createGemTowerSourceDefs,gemTowerGemFamily} from '../../src/runtime/maps/gemtower.ts';
import {createUnitIdentityProvider} from '../../src/runtime/unit-identity.ts';
import {parseUnitAbilityProfile} from '../../src/formats/stock-unit-abilities.ts';
import {resolveWtsText} from '../../src/formats/wts.ts';
import {makeNeutralGameConstants} from '../../src/sim/balance/config.ts';
import {GEMTOWER_SOLO_SLOTS} from '../../src/sim/balance/configs/gemtower.ts';
import {rawCodeOf} from '../../src/ir/fourcc.ts';
import {vint,vreal} from '../../src/jass/vm.ts';
const object=()=>{assert.equal(typeof (ui as any).gemObjectPresentation,'function');return (ui as any).gemObjectPresentation;};
const manifest=JSON.parse(readFileSync(new URL('../../web/assets/manifest.json',import.meta.url),'utf8'));
const mapPath=new URL('../../fixtures/maps/GemTower_Max_7C.w3x',import.meta.url),profilePath=new URL('../../fixtures/stock/unit-abilities.json',import.meta.url),hasSource=existsSync(mapPath)&&existsSync(profilePath);
const loadSource=()=>{const loaded=readScriptMap(new Uint8Array(readFileSync(mapPath)),'map'),profile=parseUnitAbilityProfile(JSON.parse(readFileSync(profilePath,'utf8')));return {loaded,profile,defs:createGemTowerSourceDefs(profile.units,loaded.ir.objectMods).defStore.withIdentity(createUnitIdentityProvider(profile.units,loaded.ir.objectMods,profile.pathingTextures))};};

it('source slate identity overrides a stale special alias and never uses mutable entity ability maps',()=>{
 const view=object(),def=Object.freeze({abilities:Object.freeze(['A02P','A02J']),meta:Object.freeze({role:Object.freeze({kind:'static',archetype:'specialGem'})})});
 assert.deepEqual(view('n002',def,null,'special:n002'),{kind:'slate',label:'슬레이트',logical:'slate:n002'});
 assert.deepEqual(view('h00G',def,{line:'ruby'},'special:any'),{kind:'stone',label:'돌 블록',logical:'stone'});
 assert.notEqual(view('n002',{abilities:new Map([[rawCodeOf('A02J'),1]])},null,undefined).kind,'slate','a UnitEntity map is not an immutable source definition');
 assert.deepEqual(def.abilities,['A02P','A02J']);
});

it('normal gem aliases, palette line keys and previous special/unknown fallback stay intact',()=>{
 const view=object(),family={line:'ruby',grade:'최하급',lineLabel:'루비'};
 assert.deepEqual(view('h005',{meta:{role:{kind:'static',archetype:'specialGem'}}},family,'gem:ruby:0'),{kind:'gem',label:'보석',logical:'gem:ruby:0'});
 assert.equal(view('h007',{meta:{role:{kind:'tower',line:'amethyst',tier:2}}},null,undefined).logical,'gem:amethyst:2');
 assert.equal(view('h005',{},family,undefined).logical,'gem:ruby:*');
 assert.deepEqual(view('h01P',{meta:{role:{kind:'static',archetype:'specialGem'}}},null,'special:h01P'),{kind:'special',label:'특수 보석',logical:'special:h01P'});
 assert.deepEqual(view('ZZZZ',undefined,null,undefined),{kind:'unknown',label:'종류 확인 중',logical:'gem:unknown:0'});
});

it('stone, slate and ground use their three exact native 16px source frames and never coin art',async()=>{
 const entries=manifest.entries,expected:any={'stone':{x:0,y:16,w:16,h:16},'slate:*':{x:16,y:0,w:16,h:16},'terrain:stone':{x:0,y:0,w:16,h:16}};
 let images=0;const bank=await new SpriteBank({fetch:async()=>({ok:true,json:async()=>({version:1,entries:Object.fromEntries(Object.keys(expected).map(key=>[key,entries[key]]))})}),loadImage:async()=>{images++;return {width:32,height:32};}}).load('http://local/assets/manifest.json');
 assert.deepEqual(bank.errors,[]);assert.equal(images,1,'three roles reuse the existing tile PNG cache');
 for(const [key,frame]of Object.entries(expected)){
  assert.equal(entries[key].src,'sprites/tiles.png',key);assert.deepEqual(spriteFrame(entries[key]),frame);assert.equal(entries[key].trim,undefined,'native full tile contains no coin trim');
  assert.equal(entries[key].frameProvenance.metadata,'codex-asset-forge/examples/agentforge-starter/atlas/tileset.json');assert.ok(entries[key].frameProvenance.limit);
 }
 assert.equal(entries.stone.frameProvenance.sourceId,'tile_wall_block');assert.equal(entries['slate:*'].frameProvenance.sourceId,'tile_floor_cracked');assert.equal(entries['terrain:stone'].frameProvenance.sourceId,'tile_floor_stone');
 assert.ok(bank.get('slate:n002'));assert.ok(bank.get('stone'));
});

it('all existing PNGs retain their original source-credit hashes',()=>{
 for(const credit of manifest.credits){const bytes=readFileSync(new URL('../../web/assets/'+credit.file,import.meta.url));assert.equal(createHash('sha256').update(bytes).digest('hex'),credit.sha256,credit.file);}
});

it('actual map/profile immutable source definitions classify all twelve slates and keep regular gems separate',{skip:!hasSource},()=>{
 const view=object(),{loaded,defs}=loadSource(),slates:string[]=[];
 for(const o of loaded.ir.objectMods.filter(o=>o.kind==='unit')){const id=o.newId??o.baseId;let def;try{def=defs.getDef(id);}catch{continue;}if(def.abilities?.includes('A02J')){assert.ok(Object.isFrozen(def.abilities));assert.equal(view(id,def,null,manifest.aliases[id]).kind,'slate');slates.push(id);}}
 assert.deepEqual(slates,['n000','n001','n002','n003','n004','n005','n008','n009','n00A','n00C','n00E','n00F']);
 for(const id of ['n002','n00E','n009'])assert.equal(view(id,defs.getDef(id),null,'special:'+id).logical,'slate:'+id);
 const ruby=defs.getDef('h005'),family=gemTowerGemFamily(resolveWtsText(ruby.name??'',loaded.strings));assert.ok(family);assert.equal(view('h005',ruby,family,manifest.aliases.h005).kind,'gem');assert.equal(view('h00G',defs.getDef('h00G'),null,null).kind,'stone');
});

/** Controlled original-callback integration; no claim of natural slate acquisition. */
it('a real one-use source slate move consumes the entity ability while its visual category and picture stay slate',{skip:!hasSource},()=>{
 const view=object(),{loaded,profile}=loadSource(),w=createSession(loaded.ir,{seed:6,defStore:createGemTowerSourceDefs(profile.units,loaded.ir.objectMods).defStore,stockUnits:profile.units,stockAbilities:profile.abilities,gc:makeNeutralGameConstants(),bountyMode:'source',playerSlots:GEMTOWER_SOLO_SLOTS});
 for(let i=0;i<4;i++)w.sim.step();const owner=w.vm.callFunctionSync('Player',[vint(0)]),id=w.vm.callFunctionSync('CreateUnit',[owner,vint(rawCodeOf('n002')),vreal(-3008),vreal(7000),vreal(0)]).v as number,def=w.defStore.getDef('n002');
 const first=view('n002',def,null,'special:n002'),before=w.sim.stateHash();assert.equal(first.kind,'slate');assert.equal(w.sim.stateHash(),before,'presentation never changes simulation');
 assert.equal(w.sim.issuePointAbilityOrder(0,id,'A02J',-2800,7400),true);for(let i=0;i<12;i++)w.sim.step();const entity=w.sim.getUnit(id)!;
 assert.equal(entity.x,-2800);assert.equal(entity.y,7400);assert.equal(entity.abilities.has(rawCodeOf('A02J')),false);assert.ok(def.abilities?.includes('A02J'));
 const after=w.sim.stateHash();assert.deepEqual(view(entity.typeId,w.defStore.getDef(entity.typeId),null,'special:n002'),first);assert.equal(w.sim.stateHash(),after);assert.equal(w.vm.drainEvents().some(e=>e.kind==='ThreadCrashed'),false);
});
