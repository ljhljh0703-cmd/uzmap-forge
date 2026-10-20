import type {UnitEntity} from './unit-entity.ts';
import {applyStatus,type StatusStore} from './status.ts';
/** Source-resolved, optional combat effects. No raw game tables or new balance constants. */
export type CombatAbilityEffect=
 | {kind:'armorReduction';amount:number;durationTicks:number;targetsMask:number;buffId:string}
 | {kind:'enemySlowAura';slowPm:number;radiusU:number;targetsMask:number}
 | {kind:'selfArmor';flatBonus:number}
 | {kind:'armorAura';flatBonus:number;radiusU:number;targetsMask:number;buffId:string}
 | {kind:'critical';chancePm:number;multiplierPm:number}
 | {kind:'immolation';damagePerSecondPm:number;radiusU:number;targetsMask:number;intervalTicks:number;pulseDamagePm:number}
 | {kind:'damageAura';bonusPm:number;flatBonus:number;radiusU:number;selfOnly:boolean}
 | {kind:'speedAura';bonusPm:number;radiusU:number;selfOnly:boolean}
 | {kind:'barrage';extraTargets:number;radiusU:number;targetsMask:number}
 | {kind:'frost';slowPm:number;durationTicks:number;targetsMask:number}
 | {kind:'poison';damagePerSecondPm:number;slowPm:number;durationTicks:number;targetsMask?:number};
export interface CombatAbilityCatalog {readonly unresolved?:ReadonlySet<string>;effects(abilities:ReadonlyMap<number,number>):ReadonlyArray<CombatAbilityEffect>;}

/** Read current source grants and positions; base definitions are never mutated.
 * Flat enemy auras share one modifier per buff; separate buff groups remain independent.
 * This bounded slice leaves percentage/friendly auras and nonzero linger unresolved. */
export interface ArmorAuraContext {
 readonly target:Pick<UnitEntity,'id'|'owner'|'x'|'y'>;
 readonly targetMask:number;
 readonly status?:StatusStore;
 readonly sources:Iterable<Pick<UnitEntity,'id'|'owner'|'x'|'y'|'alive'|'abilities'>>;
 readonly areAllied?:(sourceOwner:number,targetOwner:number)=>boolean;
}
export function effectiveArmorValue(baseArmor:number,abilities?:ReadonlyMap<number,number>,catalog?:CombatAbilityCatalog,context?:ArmorAuraContext):number{
 let value=baseArmor;
 if(context?.status)for(const effect of context.status.get(context.target.id)?.values()??[])if(effect.kind==='armorReduction'&&effect.remainingTicks>0)value-=effect.amount;
 if(abilities&&catalog)for(const effect of catalog.effects(abilities))if(effect.kind==='selfArmor')value+=effect.flatBonus;
 if(context&&catalog){
  const byBuff=new Map<string,number>(),target=context.target;
  for(const source of context.sources){
   if(!source.alive||source.owner===target.owner||context.areAllied?.(source.owner,target.owner))continue;
   for(const effect of catalog.effects(source.abilities))if(effect.kind==='armorAura'&&(effect.targetsMask&context.targetMask)&&
    (source.x-target.x)**2+(source.y-target.y)**2<=effect.radiusU**2)
     byBuff.set(effect.buffId,Math.min(byBuff.get(effect.buffId)??0,effect.flatBonus));
  }
  for(const bonus of byBuff.values())value+=bonus;
 }
 return value;
}

/** Only a landed primary weapon hit creates this status. Damage queries never proc it.
 * The classic buff-before-damage report informs this bounded first-hit model;
 * exact native 1.28 critical/orb priority is not independently measured here. */
export function applyAttackArmorReduction(status:StatusStore|undefined,targetId:number,targetMask:number,effects:ReadonlyArray<CombatAbilityEffect>):void{
 if(!status)return;
 for(const effect of effects)if(effect.kind==='armorReduction'&&effect.durationTicks>0&&(effect.targetsMask&targetMask))
  applyStatus(status,targetId,{kind:'armorReduction',amount:effect.amount,remainingTicks:effect.durationTicks},`armor:${effect.buffId}`);
}
