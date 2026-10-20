import type {ObjectMod} from '../ir/types.ts';import {resolveObjectFields} from '../formats/objects.ts';import {fourCC} from '../ir/fourcc.ts';import {secondsToTicks} from '../sim/ticks.ts';import type {CombatAbilityCatalog,CombatAbilityEffect} from '../sim/ability-effects.ts';
/** Classic ANpi uses level-one fields and adur is its tick interval, not tooltip DPS.
 * Source: ScrewTheTrees ability experiments, tested 1.28.5.7680:
 * github.com/Cokemonkey11/wc3-ability-doc/blob/main/sources/screwthetrees-wc3-editor-ability-insight-document/2023-11-14.md
 * Reuse original field inheritance. Missing stock parameters stay unresolved;
 * map deltas never become guessed complete definitions. Additional families reuse the same source resolver. */
export function createCombatAbilityCatalog(stock:ReadonlyArray<ObjectMod>,objects:ReadonlyArray<ObjectMod>,gc?:{frostMoveSpeedDecreasePm?:number}):CombatAbilityCatalog{
 const byId=new Map([...stock,...objects].filter(o=>o.kind==='ability').map(o=>[o.newId??o.baseId,o]));
 const unresolved=new Set<string>();
 const cache=new Map<string,ReadonlyArray<CombatAbilityEffect>>();
 function root(id:string):string{const seen=new Set<string>();while(!seen.has(id)){if(['ACct','AOcr','Aspo','ANpi','Aroc','Afra','ACat','ACac','SCae','AHad','AUau','AIcb'].includes(id))return id;seen.add(id);const o=byId.get(id);if(!o||o.baseId===id)break;id=o.baseId;}return id;}
 function resolve(id:string,requested:number):ReadonlyArray<CombatAbilityEffect>{
  const key=id+':'+requested;if(cache.has(key))return cache.get(key)!;
  const family=root(id);if(!['ACct','AOcr','Aspo','ANpi','Aroc','Afra','ACat','ACac','SCae','AHad','AUau','AIcb'].includes(family)){cache.set(key,[]);return [];}
  let fields:ObjectMod['mods'];try{fields=resolveObjectFields('ability',id,stock,objects);}catch(error){if(error instanceof Error&&error.message.startsWith('missing stock object data ability:')){unresolved.add(id);cache.set(key,[]);return [];}throw error;}
  const value=(field:string,level:number)=>{
   const choices=fields.filter(m=>m.field===field&&(m.level??0)<=level&&typeof m.value==='number').sort((a,b)=>(a.level??0)-(b.level??0));return choices.at(-1)?.value as number|undefined;
  };
  const text=(field:string,level:number)=>fields.filter(m=>m.field===field&&(m.level??0)<=level&&typeof m.value==='string').sort((a,b)=>(a.level??0)-(b.level??0)).at(-1)?.value as string|undefined;
  const mask=(level:number)=>{const targets=text('atar',level)?.split(',');if(!targets)return undefined;const physical=(targets.includes('ground')?1:0)|(targets.includes('air')?2:0);return physical||3;};
  const level=family==='ANpi'?1:Math.min(requested,value('alev',0)??requested),effects:CombatAbilityEffect[]=[];
  if(family==='ACct'||family==='AOcr'){
   const chance=value('Ocr1',level),multiplier=value('Ocr2',level);
   if(chance!==undefined&&multiplier!==undefined)effects.push({kind:'critical',chancePm:Math.max(0,Math.min(1000,Math.round(chance*10))),multiplierPm:Math.max(1000,Math.round(multiplier*1000))});
  }else if(family==='Aspo'){
   const damage=value('Spo1',level),slow=value('Spo2',level),duration=value('adur',level);
   if(damage!==undefined&&slow!==undefined&&duration!==undefined)effects.push({kind:'poison',damagePerSecondPm:Math.max(0,Math.round(damage*1000)),slowPm:Math.max(0,Math.min(1000,Math.round(slow*1000))),durationTicks:secondsToTicks(duration),targetsMask:mask(level)});
  }else if(family==='ACat'||family==='ACac'){
   const bonus=value(family==='ACat'?'Ear1':'Cac1',level),radius=value('aare',level),targets=text('atar',level),melee=value('Ear2',level),ranged=value('Ear3',level);
   // This slice resolves auras that explicitly cover both weapon classes. Class-limited variants stay visible as unresolved.
   if(bonus!==undefined&&radius!==undefined&&targets!==undefined&&melee===1&&ranged===1){const flat=value('Ear4',level)===1;effects.push({kind:'damageAura',bonusPm:flat?0:Math.round(bonus*1000),flatBonus:flat?Math.round(bonus):0,radiusU:Math.max(0,Math.round(radius)),selfOnly:targets==='self'});}
  }else if(family==='AUau'){
   const move=value('Uau1',level),regen=value('Uau2',level),radius=value('aare',level),targets=text('atar',level);
   // Narrow source slice: negative enemy movement only; regeneration/other target lists unresolved.
   if(move!==undefined&&move<0&&move>=-1&&regen===0&&radius!==undefined&&targets==='enemies')
    effects.push({kind:'enemySlowAura',slowPm:Math.round(-move*1000),radiusU:Math.max(0,Math.round(radius)),targetsMask:3});
  }else if(family==='AIcb'){
   const amount=value('Iarp',level),dice=value('Idic',level),duration=value('adur',level),heroDuration=value('ahdu',level),buffId=text('abuf',level),targets=text('atar',level)?.split(',').map(t=>t.trim());
   // Bounded source slice: no added damage, one buff, equal hero/nonhero TTL.
   // Item weapon-enabling and competing orb priorities remain separate native work.
   const targetsMask=targets?((targets.includes('ground')?1:0)|(targets.includes('air')?2:0)):0;
   if(amount!==undefined&&Number.isSafeInteger(amount)&&amount>0&&dice===0&&duration!==undefined&&Number.isFinite(duration)&&duration>0&&heroDuration===duration&&buffId&&/^[\x20-\x7e]{4}$/.test(buffId)&&targetsMask&&targets?.every(t=>['ground','air','ward'].includes(t)))
    effects.push({kind:'armorReduction',amount,durationTicks:secondsToTicks(duration),targetsMask,buffId});
  }else if(family==='AHad'){
   const bonus=value('Had1',level),percent=value('Had2',level),targets=text('atar',level);
   // Keep existing self modifiers separate. Source enemy area variants use explicit
   // buff identity, flat negative armor and zero-duration range membership.
   if(bonus!==undefined&&percent===0&&targets==='self')effects.push({kind:'selfArmor',flatBonus:bonus});
   else if(bonus!==undefined&&bonus<0&&percent===0&&targets){
    const tokens=targets.split(',').map(t=>t.trim()),radius=value('aare',level),buffId=text('abuf',level),duration=value('adur',level);
    if(tokens.includes('enemies')&&tokens.every(t=>['enemies','air','ground'].includes(t))&&radius!==undefined&&Number.isFinite(radius)&&radius>=0&&duration===0&&buffId&&/^[\x20-\x7e]{4}$/.test(buffId))
     effects.push({kind:'armorAura',flatBonus:bonus,radiusU:Math.round(radius),targetsMask:mask(level)!,buffId});
   }
  }else if(family==='SCae'){
   const bonus=value('Oae2',level),radius=value('aare',level),targets=text('atar',level);
   if(bonus!==undefined&&radius!==undefined&&targets!==undefined)effects.push({kind:'speedAura',bonusPm:Math.round(bonus*1000),radiusU:Math.max(0,Math.round(radius)),selfOnly:targets==='self'});
  }else if(family==='Aroc'){
   const count=value('Efk3',level),radius=value('aare',level),targets=mask(level);
   if(count!==undefined&&radius!==undefined&&targets!==undefined)effects.push({kind:'barrage',extraTargets:Math.max(0,Math.floor(count)),radiusU:Math.max(0,Math.round(radius)),targetsMask:targets});
  }else if(family==='Afra'){
   const duration=value('adur',level),targets=mask(level),slow=gc?.frostMoveSpeedDecreasePm;
   if(duration!==undefined&&targets!==undefined&&slow!==undefined)effects.push({kind:'frost',slowPm:Math.max(0,Math.min(1000,slow)),durationTicks:secondsToTicks(duration),targetsMask:targets});
  }else if(family==='ANpi'){
   const damage=value('Eim1',level),interval=value('adur',level),radius=value('aare',level),targets=mask(level);
   if(damage!==undefined&&interval!==undefined&&interval>0&&radius!==undefined&&targets!==undefined)effects.push({kind:'immolation',damagePerSecondPm:Math.max(0,Math.round(damage*1000/interval)),radiusU:Math.max(0,Math.round(radius)),targetsMask:targets,intervalTicks:secondsToTicks(interval),pulseDamagePm:Math.round(damage*1000)});
  }
  if(!effects.length)unresolved.add(id);cache.set(key,effects);return effects;
 }
 return {unresolved,effects(abilities){const result:CombatAbilityEffect[]=[];for(const [id,level] of abilities)if(level>0)result.push(...resolve(fourCC(id),level));return result;}};
}

/** General source range lookup for ordinary point-target orders, separate from passive effects. */
export function createAbilityRangeResolver(stock:ReadonlyArray<ObjectMod>,objects:ReadonlyArray<ObjectMod>){
 const cache=new Map<string,number|undefined>();
 return (id:string,level:number):number|undefined=>{
  const key=id+':'+level;if(cache.has(key))return cache.get(key);
  let fields:ObjectMod['mods'];try{fields=resolveObjectFields('ability',id,stock,objects);}catch(error){if(error instanceof Error&&error.message.startsWith('missing stock object data ability:')){cache.set(key,undefined);return undefined;}throw error;}
  const field=fields.filter(m=>m.field==='aran'&&(m.level??0)<=level).sort((a,b)=>(a.level??0)-(b.level??0)).at(-1)?.value;
  const range=typeof field==='number'&&Number.isFinite(field)&&field>=0?Math.round(field):undefined;cache.set(key,range);return range;
 };
}
