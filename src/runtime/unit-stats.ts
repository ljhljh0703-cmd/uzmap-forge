/** Missing source unit facts only. Existing concrete balance stays in the caller provider. */
import type {ObjectMod} from '../ir/types.ts';import {resolveObjectFields} from '../formats/objects.ts';import {secondsToTicks} from '../sim/ticks.ts';import type {OverrideSpec,AttackSpec} from '../sim/balance/config.ts';
export function sourceUnitStats(typeId:string,stock:ReadonlyArray<ObjectMod>,objects:ReadonlyArray<ObjectMod>):{stats:OverrideSpec;weaponResolved:boolean}{
 const fields=resolveObjectFields('unit',typeId,stock,objects),get=(id:string)=>fields.find(m=>m.field===id)?.value;
 const n=(id:string)=>{const v=get(id);return typeof v==='number'&&Number.isFinite(v)?v:undefined;},text=(id:string)=>{const v=get(id);return typeof v==='string'?v:undefined;};
 const stats:OverrideSpec={},hp=n('uhpm'),gold=n('ugol'),armor=n('udef'),armorType=text('udty');
 if(hp!==undefined&&hp>0)stats.hpMax=Math.round(hp);if(gold!==undefined&&gold>=0)stats.goldCost=Math.round(gold);if(armor!==undefined)stats.armorValue=Math.round(armor);if(armorType&&armorType!=='_')stats.armorType=armorType;
 const weapon=sourceUnitWeapon(fields,1);if(weapon.resolved)stats.attack=weapon.attack??null;
 return {stats,weaponResolved:weapon.resolved&&sourceUnitWeapon(fields,2).resolved};
}
/** Both editor weapon slots share object inheritance and the same stat decoder. */
export function sourceUnitWeapon(fields:ReadonlyArray<ObjectMod['mods'][number]>,slot:1|2):{attack:AttackSpec|null;resolved:boolean}{
 const get=(id:string)=>fields.find(m=>m.field===id)?.value;
 const n=(id:string)=>{const v=get(id);return typeof v==='number'&&Number.isFinite(v)?v:undefined;},text=(id:string)=>{const v=get(id);return typeof v==='string'?v:undefined;};
 const enabled=n('uaen');if(enabled!==undefined&&!(enabled&(slot===1?1:2)))return {attack:null,resolved:true};
 const key=(suffix:string)=>`ua${slot}${suffix}`;
 const base=n(key('b')),dice=n(key('d')),sides=n(key('s')),cool=n(key('c')),range=n(key('r')),type=text(key('t')),targets=text(key('g'));
 if(enabled===undefined||base===undefined||dice===undefined||sides===undefined||cool===undefined||cool<=0||range===undefined||!type||!targets)return {attack:null,resolved:false};
 const mask=(s:string)=>{const t=s.split(',');return (t.includes('ground')?1:0)|(t.includes('air')?2:0)||3;};
 const attack:AttackSpec={dmgBase:Math.round(base+dice),dmgSpread:Math.max(0,Math.round(dice*(sides-1))),cooldownTicks:Math.max(1,secondsToTicks(cool)),rangeU:Math.round(range),acquireU:Math.round(range),attackType:type,targetsMask:mask(targets)};
 const weapon=text(key('w')),full=n(key('f')),half=n(key('h')),quarter=n(key('q')),splashTargets=text(key('p'));
 if((weapon==='artillery'||weapon==='msplash')&&full!==undefined&&half!==undefined&&quarter!==undefined&&quarter>0&&splashTargets)attack.splash={fullU:Math.round(full),halfU:Math.round(half),quarterU:Math.round(quarter),targetsMask:mask(splashTargets)};
 if(attack.splash)Object.freeze(attack.splash);return {attack:Object.freeze(attack),resolved:true};
}
