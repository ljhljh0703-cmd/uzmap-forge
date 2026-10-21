/** Narrow, caller-local stock intake. No Blizzard table is bundled.
 * 1.28.5.7680 UnitMetaData.slk maps uabi -> UnitAbilities.abilList.
 * heroAbilList is a learnable pool and is deliberately NOT granted at level 1. */
import type {GameConstants} from "../sim/balance/config.ts";
import type { ObjectMod } from "../ir/types.ts";
import { parseSlk } from "./slk.ts";

/** Minimal declared stock fields, read from the caller-owned 1.28.5.7680 War3x.mpq.
 * Members: Units\\AbilityData.slk and Units\\AbilityMetaData.slk; hashes below.
 * Evidence: source-passives-data/STOCK-FOUR-FAMILIES.json. Blank cells stay absent.
 * These are four scoped declarations, not a bundled table or a profile rewrite. */
const SOURCE_128_PASSIVE_PROVENANCE={"sourceVersion":"1.28.5.7680","sourceSha256":"156052e0f5c7d8b69c2e299a8d975d94bffd64731b65fbac194a712a706e9410","dataSha256":"ddc360800784f808219bbc2518b16b0f12413082aada2755cc00944adcc31cec","metadataSha256":"42249bc577463896a9b1fece959c6bd5f815eb42c4899b8c899620b547a5b3f6"};
const SOURCE_128_PASSIVES:ReadonlyArray<ObjectMod>=[
 {kind:"ability",baseId:"AHbh",newId:null,mods:[
  {"field":"alev","value":3,"level":0,"column":0},
  {"field":"Hbh1","value":20,"level":1,"column":1},
  {"field":"Hbh1","value":30,"level":2,"column":1},
  {"field":"Hbh1","value":40,"level":3,"column":1},
  {"field":"Hbh2","value":0,"level":1,"column":2},
  {"field":"Hbh2","value":0,"level":2,"column":2},
  {"field":"Hbh2","value":0,"level":3,"column":2},
  {"field":"Hbh3","value":25,"level":1,"column":3},
  {"field":"Hbh3","value":25,"level":2,"column":3},
  {"field":"Hbh3","value":25,"level":3,"column":3},
  {"field":"Hbh4","value":0,"level":1,"column":4},
  {"field":"Hbh4","value":0,"level":2,"column":4},
  {"field":"Hbh4","value":0,"level":3,"column":4},
  {"field":"adur","value":2,"level":1,"column":0},
  {"field":"adur","value":2,"level":2,"column":0},
  {"field":"adur","value":2,"level":3,"column":0},
  {"field":"ahdu","value":1,"level":1,"column":0},
  {"field":"ahdu","value":1,"level":2,"column":0},
  {"field":"ahdu","value":1,"level":3,"column":0},
  {"field":"atar","value":"ground,air","level":1,"column":0},
  {"field":"atar","value":"ground,air","level":2,"column":0},
  {"field":"atar","value":"ground,air","level":3,"column":0},
  {"field":"abuf","value":"BPSE","level":1,"column":0},
  {"field":"abuf","value":"BPSE","level":2,"column":0},
  {"field":"abuf","value":"BPSE","level":3,"column":0},
  {"field":"aare","value":0,"level":1,"column":0},
  {"field":"aare","value":0,"level":2,"column":0},
  {"field":"aare","value":0,"level":3,"column":0},
 ]},
 {kind:"ability",baseId:"Aliq",newId:null,mods:[
  {"field":"alev","value":1,"level":0,"column":0},
  {"field":"liq1","value":8,"level":1,"column":1},
  {"field":"liq2","value":0,"level":1,"column":2},
  {"field":"liq3","value":0.8,"level":1,"column":3},
  {"field":"liq4","value":0,"level":1,"column":4},
  {"field":"adur","value":3,"level":1,"column":0},
  {"field":"ahdu","value":3,"level":1,"column":0},
  {"field":"atar","value":"structure,enemy,neutral","level":1,"column":0},
  {"field":"abuf","value":"Bliq","level":1,"column":0},
  {"field":"aare","value":0,"level":1,"column":0},
 ]},
 {kind:"ability",baseId:"Aven",newId:null,mods:[
  {"field":"alev","value":1,"level":0,"column":0},
  {"field":"Poi1","value":4,"level":1,"column":1},
  {"field":"Poi2","value":0,"level":1,"column":2},
  {"field":"Poi3","value":0,"level":1,"column":3},
  {"field":"Poi4","value":1,"level":1,"column":4},
  {"field":"adur","value":25,"level":1,"column":0},
  {"field":"ahdu","value":1,"level":1,"column":0},
  {"field":"atar","value":"air,ground,organic","level":1,"column":0},
  {"field":"abuf","value":"Bpoi,Bpsd","level":1,"column":0},
 ]},
 {kind:"ability",baseId:"AUts",newId:null,mods:[
  {"field":"alev","value":3,"level":0,"column":0},
  {"field":"Uts1","value":0.15,"level":1,"column":1},
  {"field":"Uts1","value":0.25,"level":2,"column":1},
  {"field":"Uts1","value":0.35,"level":3,"column":1},
  {"field":"Uts2","value":1,"level":1,"column":2},
  {"field":"Uts2","value":1,"level":2,"column":2},
  {"field":"Uts2","value":1,"level":3,"column":2},
  {"field":"Uts3","value":3,"level":1,"column":3},
  {"field":"Uts3","value":5,"level":2,"column":3},
  {"field":"Uts3","value":7,"level":3,"column":3},
  {"field":"adur","value":0,"level":1,"column":0},
  {"field":"ahdu","value":0,"level":1,"column":0},
  {"field":"atar","value":"_","level":1,"column":0},
  {"field":"atar","value":"_","level":2,"column":0},
  {"field":"atar","value":"_","level":3,"column":0},
  {"field":"abuf","value":"BUts","level":1,"column":0},
  {"field":"abuf","value":"BUts","level":2,"column":0},
  {"field":"abuf","value":"BUts","level":3,"column":0},
 ]},
];

export function abilityCodes(value: string): string[] {
  if (value === "" || value === "_") return [];
  const ids = value.split(",").map(id => id.trim());
  if (ids.some(id => !/^[\x20-\x7e]{4}$/.test(id))) throw new Error("invalid unit ability list");
  return [...new Set(ids)];
}
function object(id: string, value: string): ObjectMod {
  if (!/^[\x20-\x7e]{4}$/.test(id)) throw new Error("invalid stock unit id");
  return {kind: "unit", baseId: id, newId: null, mods: [{field: "uabi", value: abilityCodes(value).join(",")}]};
}
export function parseUnitAbilitySlk(text: string): ObjectMod[] {
  const rows = parseSlk(text), header = rows[0] ?? [];
  const idColumn = header.indexOf("unitAbilID"), abilitiesColumn = header.indexOf("abilList");
  if (idColumn < 0 || abilitiesColumn < 0) throw new Error("invalid UnitAbilities table header");
  const result: ObjectMod[] = [], seen = new Set<string>();
  for (const row of rows.slice(1)) {
    if (!row) continue;
    const id = row[idColumn];
    if (id === undefined || seen.has(id)) throw new Error("missing or duplicate stock unit id");
    seen.add(id);
    result.push(object(id, row[abilitiesColumn] ?? ""));
  }
  if (!result.length) throw new Error("empty UnitAbilities table");
  return result;
}

/** Private normalized profile, generated by scripts/import-unit-abilities.mjs.
 * Validate unknown JSON before handing anything to the existing ObjectMod resolver. */
import type {PathingFootprint} from "../ir/pathing.ts";
export type {PathingFootprint} from "../ir/pathing.ts";
export function parseUnitAbilityProfile(input: unknown): {sourceVersion: string; units: ObjectMod[]; abilities:ObjectMod[]; pathingTextures:Readonly<Record<string,PathingFootprint>>;gameplayConstants?:Pick<GameConstants,"relativeUpgradeCost"|"frostMoveSpeedDecreasePm"|"frostAttackSpeedDecreasePm">} {
  if (!input || typeof input !== "object") throw new Error("invalid stock ability profile");
  const p = input as Record<string, unknown>;
  if (p.format !== "uzmap-unit-abilities-v1" || typeof p.sourceVersion !== "string" ||
      !/^\d+\.\d+\.\d+\.\d+$/.test(p.sourceVersion) || typeof p.sourceSha256 !== "string" ||
      !/^[a-f0-9]{64}$/.test(p.sourceSha256) || !p.units || typeof p.units !== "object" || Array.isArray(p.units))
    throw new Error("invalid stock ability profile header");
  const entries = Object.entries(p.units);
  if (!entries.length || entries.length > 10_000) throw new Error("invalid stock unit count");
  const units = entries.map(([id, value]) => {
    if (typeof value !== "string") throw new Error("invalid stock ability value");
    return object(id, value);
  });
  const pathingTextures:Record<string,PathingFootprint>={};
  if(p.pathingTextures!==undefined){
    if(!p.pathingTextures||typeof p.pathingTextures!=="object"||Array.isArray(p.pathingTextures))throw new Error("invalid pathing textures");
    for(const [name,raw] of Object.entries(p.pathingTextures)){
      const f=raw as PathingFootprint;
      if(!f||!Number.isInteger(f.width)||!Number.isInteger(f.height)||f.width<1||f.height<1||f.width>64||f.height>64||!Array.isArray(f.cells)||f.cells.length!==f.width*f.height||f.cells.some(n=>!Number.isInteger(n)||n<0||n>255))throw new Error("invalid pathing footprint");
      pathingTextures[name.toLowerCase()]=Object.freeze({width:f.width,height:f.height,cells:Object.freeze([...f.cells])});
    }
  }
  if(p.unitData!==undefined){
    if(!p.unitData||typeof p.unitData!=="object"||Array.isArray(p.unitData))throw new Error("invalid stock movement data");
    for(const [id,raw] of Object.entries(p.unitData)){
      if(!/^[\x20-\x7e]{4}$/.test(id)||!raw||typeof raw!=="object")throw new Error("invalid stock movement unit");
      const d=raw as Record<string,unknown>;
      if(typeof d.movementType!=="string"||typeof d.pathTexture!=="string")throw new Error("invalid stock movement identity");
      let unit=units.find(u=>u.baseId===id);if(!unit){unit={kind:"unit",baseId:id,newId:null,mods:[]};units.push(unit);}
      unit.mods.push({field:"umvt",value:d.movementType},{field:"upat",value:d.pathTexture});
      if(d.fields!==undefined){
        const allowed=new Set(['uhpm','udef','udty','ugol','ubld','umpm','umvs','umis','umas','ucol','uaen','ua1b','ua1d','ua1s','ua1c','ua1r','ua1t','ua1w','ua1g','ua1f','ua1h','ua1q','ua1p','ua2b','ua2d','ua2s','ua2c','ua2r','ua2t','ua2w','ua2g','ua2f','ua2h','ua2q','ua2p','uacq','ubba','ubdi','ubsi','ureq','urqa','uupt','utra']);
        if(!Array.isArray(d.fields)||d.fields.length>100)throw new Error('invalid stock unit fields');
        for(const raw of d.fields){const m=raw as {field:string;value:number|string};if(!m||!allowed.has(m.field)||!((typeof m.value==='number'&&Number.isFinite(m.value))||(typeof m.value==='string'&&m.value.length<=4096)))throw new Error('invalid stock unit fields');unit.mods.push({field:m.field,value:m.value});}
      }
    }
  }
  const abilities:ObjectMod[]=[];
  if(p.abilityData!==undefined){
    if(!p.abilityData||typeof p.abilityData!=="object"||Array.isArray(p.abilityData))throw new Error("invalid stock ability data");
    for(const [id,raw] of Object.entries(p.abilityData)){
      if(!/^[\x20-\x7e]{4}$/.test(id)||!Array.isArray(raw)||raw.length>10_000)throw new Error("invalid stock ability fields");
      const mods=raw.map((m:Record<string,unknown>)=>{
        if(!m||typeof m.field!=="string"||m.field.length!==4||(["atar","abuf"].includes(m.field)?typeof m.value!=="string":typeof m.value!=="number"||!Number.isFinite(m.value))||!Number.isInteger(m.level)||Number(m.level)<0||!Number.isInteger(m.column)||Number(m.column)<0)throw new Error("invalid stock ability parameter");
        if(m.field==="abuf")abilityCodes(m.value as string);
        return {field:m.field,value:m.value as number|string,level:Number(m.level),column:Number(m.column)};
      });abilities.push({kind:"ability",baseId:id,newId:null,mods});
    }
  }
  const source=p.abilitySource;
  if(p.sourceVersion===SOURCE_128_PASSIVE_PROVENANCE.sourceVersion&&p.sourceSha256===SOURCE_128_PASSIVE_PROVENANCE.sourceSha256&&source&&typeof source==='object'&&!Array.isArray(source)&&
    (source as Record<string,unknown>).dataSha256===SOURCE_128_PASSIVE_PROVENANCE.dataSha256&&(source as Record<string,unknown>).metadataSha256===SOURCE_128_PASSIVE_PROVENANCE.metadataSha256){
    for(const base of SOURCE_128_PASSIVES)if(!abilities.some(ability=>ability.baseId===base.baseId))abilities.push({...base,mods:base.mods.map(field=>({...field}))});
  }
  let gameplayConstants:Pick<GameConstants,'relativeUpgradeCost'|'frostMoveSpeedDecreasePm'|'frostAttackSpeedDecreasePm'>|undefined;
  if(p.gameplayConstants!==undefined){const g=p.gameplayConstants as Record<string,unknown>;if(!g||typeof g!=='object'||typeof g.relativeUpgradeCost!=='boolean'||!['frostMoveSpeedDecreasePm','frostAttackSpeedDecreasePm'].every(k=>Number.isInteger(g[k])&&Number(g[k])>=0&&Number(g[k])<=1000))throw new Error('invalid gameplay constants');gameplayConstants={relativeUpgradeCost:g.relativeUpgradeCost,frostMoveSpeedDecreasePm:Number(g.frostMoveSpeedDecreasePm),frostAttackSpeedDecreasePm:Number(g.frostAttackSpeedDecreasePm)};}
  return {sourceVersion: p.sourceVersion, units, abilities, pathingTextures,...(gameplayConstants?{gameplayConstants}:{})};
}
