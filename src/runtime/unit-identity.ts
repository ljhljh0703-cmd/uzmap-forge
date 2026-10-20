/** Identity adapter only: balance remains the caller's existing DefaultsProvider.
 * Reuses resolveObjectFields for stock patches/custom ancestry/field replacement. */
import type {PathingFootprint} from "../formats/stock-unit-abilities.ts";
import type { ObjectMod } from "../ir/types.ts";
import {sourceUnitWeapon} from './unit-stats.ts';
import {secondsToTicks} from "../sim/ticks.ts";
import type {UnitUpgradeIdentity, UnitIdentityProvider } from "../sim/def-store.ts";
import { resolveObjectFields } from "../formats/objects.ts";
import { abilityCodes } from "../formats/stock-unit-abilities.ts";

export function createUnitIdentityProvider(
  stockUnits: ReadonlyArray<ObjectMod>, mapObjects: ReadonlyArray<ObjectMod>,
  pathingTextures:Readonly<Record<string,PathingFootprint>>={},
): UnitIdentityProvider {
  // Snapshot inputs so later caller mutations cannot change uncached definitions.
  const copy = (list: ReadonlyArray<ObjectMod>) => list.filter(o => o.kind === "unit")
    .map(o => ({...o, mods: o.mods.map(m => ({...m}))}));
  const stock = copy(stockUnits), patches = copy(mapObjects);
  const represented = new Set([...stock, ...patches].map(o => o.newId ?? o.baseId));
  return {
    resolve(typeId) {
      if (!represented.has(typeId)) return {}; // remains unknown; no invented stock object
      const fields = resolveObjectFields("unit", typeId, stock, patches);
      const identity: {name?: string; abilities?: ReadonlyArray<string>; pointValue?: number; movementType?:string; pathing?:PathingFootprint}&UnitUpgradeIdentity = {};
      const value=(id:string)=>fields.find(m=>m.field===id)?.value;
      const minimum=value('umis'),maximum=value('umas'),collision=value('ucol');
      for(const v of [minimum,maximum])if(v!==undefined&&(typeof v!=='number'||!Number.isSafeInteger(v)||v<0))throw Error('invalid source movement bound');
      if(typeof minimum==='number'&&typeof maximum==='number'&&maximum>0&&minimum>maximum)throw Error('invalid source movement bounds');
      if(typeof minimum==='number')Object.assign(identity,{sourceMinMoveSpeedU:minimum});
      if(typeof maximum==='number')Object.assign(identity,{sourceMaxMoveSpeedU:maximum});
      if(collision!==undefined){if(typeof collision!=='number'||!Number.isFinite(collision)||collision<0||!Number.isSafeInteger(Math.round(collision)))throw Error('invalid source collision');Object.assign(identity,{sourceCollisionU:Math.round(collision)});}
      const enabled=value('uaen');
      if(typeof enabled==='number'&&(enabled&2)){
        const second=sourceUnitWeapon(fields,2);if(second.attack)Object.assign(identity,{secondaryAttack:second.attack});
        if(!(enabled&1))Object.assign(identity,{primaryAttackDisabled:true});
      }
      const trains=value('utra'),lumber=value('ulum'),food=value('ufoo');
      if(typeof trains==='string')Object.assign(identity,{trainingOptions:Object.freeze(abilityCodes(trains))});
      if(typeof lumber==='number'&&Number.isSafeInteger(lumber)&&lumber>=0)Object.assign(identity,{sourceLumberCost:lumber});
      if(typeof food==='number'&&Number.isSafeInteger(food)&&food>=0)Object.assign(identity,{sourceFoodCost:food});
      const acquire=value('uacq');if(typeof acquire==='number'&&Number.isFinite(acquire)&&acquire>=0)Object.assign(identity,{sourceAcquireRangeU:Math.round(acquire)});
      const bountyFields=['ubba','ubdi','ubsi'].map(value);
      if(bountyFields.every(v=>v!==undefined)){
        if(bountyFields.some(v=>typeof v!=='number'||!Number.isSafeInteger(v)||v<0))throw Error('invalid source bounty');
        const [base,dice,sides]=bountyFields as number[];
        if(dice!>1000||sides!>1000000||dice!>0&&sides!<1)throw Error('invalid source bounty dice');
        Object.assign(identity,{sourceBounty:Object.freeze({base:base!,dice:dice!,sides:sides!})});
      }
      const targets=value('uupt'),gold=value('ugol'),time=value('ubld'),requires=value('ureq'),counts=value('urqa');
      if(typeof targets==='string')Object.assign(identity,{upgradesTo:Object.freeze(abilityCodes(targets).filter(id=>id!==typeId))});
      if(typeof gold==='number'&&Number.isInteger(gold)&&gold>=0)Object.assign(identity,{sourceGoldCost:gold});
      if(typeof time==='number'&&Number.isFinite(time)&&time>=0)Object.assign(identity,{buildTimeTicks:secondsToTicks(time)});
      if(typeof requires==='string'){
        const ids=abilityCodes(requires),amounts=typeof counts==='string'?counts.split(',').map(Number):[];
        Object.assign(identity,{techRequirements:Object.freeze(ids.map((techId,i)=>({techId,count:amounts[i]&&Number.isInteger(amounts[i])&&amounts[i]!>0?amounts[i]!:1})))});
      }
      for (const mod of fields) {
        if(mod.field==="umvt"&&typeof mod.value==="string")identity.movementType=mod.value;
        else if(mod.field==="upat"&&typeof mod.value==="string"){
          const f=pathingTextures[mod.value.toLowerCase()];if(f)identity.pathing=f;
        }
        else if (mod.field === "unam") {
          if (typeof mod.value !== "string") throw new Error("invalid unit name");
          identity.name = mod.value;
        } else if(mod.field === "upoi") {
          if(typeof mod.value!=="number" || !Number.isInteger(mod.value) || mod.value<0)throw new Error("invalid unit point value");
          identity.pointValue=mod.value;
        } else if (mod.field === "uabi") {
          if (typeof mod.value !== "string") throw new Error("invalid unit ability list");
          identity.abilities = Object.freeze(abilityCodes(mod.value));
        }
      }
      return identity;
    },
  };
}
