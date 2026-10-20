/** Explicit GemTower adapter. The map owns all gameplay and its repeat-play clear/loss flags.
 * Y3e sets qe[player+1] after the actual final round; p4/F4 sets Rv on life exhaustion.
 * The original keeps a damage-test/replay phase after clearing rather than CustomVictoryBJ.
 * This local run presents that source-owned result via the existing idempotent terminal API.
 * No wave threshold, enemy count, unit grant or VM mutation is used to invent a result.
 */
import type {ObjectMod} from "../../ir/types.ts";
import {resolveObjectFields} from '../../formats/objects.ts';
import {sourceUnitStats} from "../unit-stats.ts";
import {DefStore} from "../../sim/def-store.ts";
import {createBalanceProvider} from "../../sim/balance/provider.ts";
import {GEMTOWER_BALANCE} from "../../sim/balance/configs/gemtower.ts";
import type {JassVm} from "../../jass/vm.ts";
import type {Sim} from "../../sim/sim.ts";
export function gemTowerPlayerState(vm:JassVm,playerId=0){
 const index=playerId+1;
 const number=(name:string)=>{const v=vm.getGlobalIndexed(name,index);return v.t==="int"||v.t==="real"?v.v:undefined;};
 const bool=(name:string)=>{const v=vm.getGlobalIndexed(name,index);return v.t==="bool"?v.v:undefined;};
 return {round:number("Ce"),life:number("C"),buildCount:number("O"),chosen:bool("N"),active:bool("n"),lost:bool("Rv"),cleared:bool("qe"),difficulty:number("sA"),creepLifePercent:number("pA")};
}
export function installGemTowerOutcome(vm:JassVm,sim:Sim,playerId=0):void{
 sim.registerTickPhase("rebucket",()=>{
  if(sim.gameOver)return;
  const state=gemTowerPlayerState(vm,playerId);
  if(state.lost===true)sim.endGame(null);
  else if(state.cleared===true&&state.active===true)sim.endGame(playerId);
 });
}

/** Display classification from this map's authored names. Legacy static combat roles are not UI categories. */
const GEM_FAMILIES:Record<string,string>={"자수정":"amethyst","아쿠아머린":"aquamarine","다이아몬드":"diamond","에메랄드":"emerald","오팔":"opal","사파이어":"sapphire","루비":"ruby","토파즈":"topaz"};
export function gemTowerGemFamily(name:string|undefined){
 const clean=(name??"").replace(/\|c[0-9a-fA-F]{8}|\|r/g,"");
 const match=clean.match(/^(최하급|하급|중급|상급|최상급|완벽한)\s*(자수정|아쿠아머린|다이아몬드|에메랄드|오팔|사파이어|루비|토파즈)$/);
 return match?{grade:match[1]!,line:GEM_FAMILIES[match[2]!]!,lineLabel:match[2]!}:null;
}

/** The original R[player+1] group retains gems while their owner is temporarily Player(9). */
export function gemTowerPlayerGemIds(vm:JassVm,playerId=0):ReadonlyArray<number>{
 const value=vm.getGlobalIndexed('R',playerId+1);if(value.t!=='handle'||value.v===null)return [];
 const group=vm.handles.get(value.v);return group?.kind==='group'?[...((group.data as {units:number[]}).units)]:[];
}

/** Source-declared upgrade graph + existing parameterized balance, with explicit hole repair. */
export function createGemTowerSourceDefs(stock:ReadonlyArray<ObjectMod>,objects:ReadonlyArray<ObjectMod>){
 const units=new Map(objects.filter(o=>o.kind==='unit').map(o=>[o.newId??o.baseId,o]));
 const declared=new Set<string>();
 for(const [id,o] of units){const value=o.mods.find(m=>m.field==='uupt')?.value;if(typeof value==='string'&&value&&value!=='_'){declared.add(id);for(const target of value.split(',').map(s=>s.trim()))if(target)declared.add(target);}}
 // A02J is this source map's shared slate-move ability. These retained gems do
 // not all participate in the unit-upgrade graph; restricting repair to uupt
 // silently left ordinary Poison/Air/Slow slates on the non-attacking fallback.
 for(const [id] of units){
  try{const abilities=resolveObjectFields('unit',id,stock,objects).find(m=>m.field==='uabi')?.value;
   if(typeof abilities==='string'&&abilities.split(',').includes('A02J'))declared.add(id);
  }catch(error){if(!(error instanceof Error&&error.message.startsWith('missing stock object data unit:')))throw error;}
 }
 const baseline=createBalanceProvider(GEMTOWER_BALANCE),roles={...GEMTOWER_BALANCE.roleTable},overrides={...GEMTOWER_BALANCE.overrides},gaps:string[]=[];
 for(const id of declared){
  let source:ReturnType<typeof sourceUnitStats>;
  try{source=sourceUnitStats(id,stock,objects);}catch(error){if(error instanceof Error&&error.message.startsWith('missing stock object data unit:')){gaps.push(id+':missing-definition');continue;}throw error;}
  const old=baseline.resolve(id);
  if(!roles[id]){roles[id]={kind:'static',archetype:'specialGem'};overrides[id]={...source.stats};if(!source.weaponResolved)gaps.push(id);}
  else if(old.attack===null&&source.stats.attack)overrides[id]={...overrides[id],attack:source.stats.attack};
 }
 return {defStore:new DefStore(createBalanceProvider({...GEMTOWER_BALANCE,roleTable:roles,overrides})),declaredUnits:[...declared],weaponGaps:gaps};
}

/** 7C qv machine handles and their source unit-range centers. Observation only. */
const CASINO_ENTRY_GLOBALS=['bO','cO','DO','hO','kO','LO','aO'] as const;
// Qv counts blackjack seats 4/5 too; uv counts only the seven pachinko machines.
const CASINO_OCCUPANCY=[1,2,3,6,7,8,9] as const;
function segmentNear(a:{x:number;y:number},b:{x:number;y:number},p:{x:number;y:number},radius:number){
 const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy;
 const t=d===0?0:Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/d));
 return (a.x+t*dx-p.x)**2+(a.y+t*dy-p.y)**2<=radius*radius;
}
export function gemTowerCasinoState(vm:JassVm,sim:Sim,playerId=0){
 const unlocked=sim.getResearchLevel(playerId,'R000')>=8;
 const gambler=[...sim.entities.values()].find(e=>e.alive&&e.owner===playerId&&e.typeId==='h045');
 const sourceUnit=(name:string)=>{const h=vm.getGlobal(name);return h.t==='handle'&&h.v!==null?sim.getUnit(h.v):undefined;};
 const centers=[...CASINO_ENTRY_GLOBALS,'gO','CO'].map(sourceUnit).filter(e=>e?.alive);
 const ir=vm.getGlobal('Ir'),rect=ir.t==='handle'&&ir.v!==null?vm.handles.get(ir.v):undefined;
 const entrance=rect?.kind==='rect'?{x:Math.round(((rect.data.minx as number)+(rect.data.maxx as number))/2),y:rect.data.miny as number}:null;
 // App approach policy only: leave one grid-cell margin around other admission circles.
 // A second explicit click continues from the source entrance; no hidden movement queue.
 const margin=50+(sim.navigation?.grid.cellSize??0);
 const stations=CASINO_ENTRY_GLOBALS.flatMap((global,index)=>{
  const handle=vm.getGlobalIndexed('qv',index+1),point=vm.getGlobal(global);
  const machine=handle.t==='handle'&&handle.v!==null?sim.getUnit(handle.v):undefined;
  const center=point.t==='handle'&&point.v!==null?sim.getUnit(point.v):undefined;
  if(!machine?.alive)return [];
  const flag=vm.getGlobalIndexed('Qv',CASINO_OCCUPANCY[index]!),spin=vm.getGlobalIndexed('uv',index+1),owned=machine.owner===playerId;
  const busy=Boolean(flag.t==='bool'&&flag.v)||machine.owner!==8;
  const destination=center?.alive?{x:center.x,y:center.y}:null;
  const blockers=centers.filter(other=>other!.id!==center?.id);
  const viaEntrance=Boolean(gambler&&destination&&blockers.some(other=>segmentNear(gambler,destination,other!,margin)));
  let entry=destination;
  if(viaEntrance)entry=gambler&&entrance&&destination&&![{a:gambler,b:entrance},{a:entrance,b:destination}].some(leg=>blockers.some(other=>segmentNear(leg.a,leg.b,other!,margin)))?entrance:null;
  let reason:string|null=sim.gameOver?'game-over':!unlocked?'locked':!gambler?'no-gambler':gambler.paused?'paused':owned||busy?'busy':!entry?'invalid-order':sim.validateMoveOrder(playerId,gambler.id,entry.x,entry.y);
  if(reason===null&&gambler!.orderActive===1&&gambler!.orderX===entry!.x&&gambler!.orderY===entry!.y)reason='moving';
  return [{id:machine.id,index:index+1,title:`${index+1}번 빠칭코`,owned,busy,spinning:Boolean(spin.t==='bool'&&spin.v),canApproach:reason===null,reason,entry,destination,viaEntrance}];
 });
 return {unlocked,gamblerId:gambler?.id??null,paused:Boolean(gambler?.paused),stations};
}
