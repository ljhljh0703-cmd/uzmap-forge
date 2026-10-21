/** Explicit GemTower adapter. The map owns all gameplay and its repeat-play clear/loss flags.
 * Y3e sets qe[player+1] after the actual final round; p4/F4 sets Rv on life exhaustion.
 * The original keeps a damage-test/replay phase after clearing rather than CustomVictoryBJ.
 * This local run presents that source-owned result via the existing idempotent terminal API.
 * No wave threshold, enemy count, unit grant or VM mutation is used to invent a result.
 */
import type {MapIR,ObjectMod} from "../../ir/types.ts";
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
/** Read-only explanation of 7C fle/f8e/FHe/F3e/gfe/gZe/GBe payouts.
 * GR/hR multiply the viewing player's eI; HR uses a source draw in 3..6+zR.
 * These observed amounts never decide a spin, change odds or settle a prize. */
function casinoPayoutView(vm:JassVm,index:number,playerId:number){
 const integer=(name:string,at:number,minimum=0)=>{const v=vm.getGlobalIndexed(name,at);return v.t==='int'&&Number.isSafeInteger(v.v)&&v.v>=minimum?v.v:null;};
 const base={two:integer('GR',index,1),three:integer('hR',index,1),jackpot:integer('HR',index,1)};
 const factor=integer('eI',playerId+1,1),bonus=integer('zR',playerId+1);
 const product=(a:number|null,b:number|null)=>a!==null&&b!==null&&Number.isSafeInteger(a*b)?a*b:null;
 const maximum=bonus!==null&&Number.isSafeInteger(6+bonus)?6+bonus:null;
 return {base,factor,two:product(base.two,factor),three:product(base.three,factor),jackpotMultiplier:{min:3,max:maximum},jackpot:{min:product(base.jackpot,3),max:product(base.jackpot,maximum)}};
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
  return [{id:machine.id,index:index+1,title:`${index+1}번 빠칭코`,payout:casinoPayoutView(vm,index+1,playerId),owned,busy,spinning:Boolean(spin.t==='bool'&&spin.v),canApproach:reason===null,reason,entry,destination,viaEntrance}];
 });
 return {unlocked,gamblerId:gambler?.id??null,paused:Boolean(gambler?.paused),stations};
}


/** Mobile geometry is an explicit map adaptation, never a mutation of the uploaded
 * original. Keep source wave timers, grouping and enter-rect orders; shorten only
 * the source spawn rectangle so the first enemy starts at the visible entrance. */
export const GEMTOWER_FIELD_RECTS=[['Vx','Ex','Xx','Ox','Rx','Ix'],['bx','Bx','cx','Cx','Dx','fx']] as const;
export function gemTowerMobileLayout(ir:MapIR,grid:import('../../ir/pathing.ts').PathingMap,buildCells:number){
 const source=ir.script.source,rects=new Map<string,import('../../sim/navigation.ts').NavigationBounds>();
 for(const m of source.matchAll(/\bset\s+(\w+)\s*=\s*Rect\(([-\d., ]+)\)/g)){
  const v=m[2]!.split(',').map(Number);if(v.length===4&&v.every(Number.isFinite))rects.set(m[1]!,{minX:v[0]!,minY:v[1]!,maxX:v[2]!,maxY:v[3]!});
 }
 if(!Number.isInteger(buildCells)||buildCells<1)throw Error('invalid mobile build footprint');
 const size=grid.cellSize*buildCells,ox=grid.originX-grid.cellSize/2,oy=grid.originY-grid.cellSize/2;
 const replacements=new Map<string,string>();
 const centre=(r:import('../../sim/navigation.ts').NavigationBounds)=>({x:(r.minX+r.maxX)/2,y:(r.minY+r.maxY)/2});
 const fields=GEMTOWER_FIELD_RECTS.map((names,playerId)=>{
  const waypoints=names.map(name=>{const r=rects.get(name);if(!r)throw Error('missing GemTower route rectangle: '+name);return r;});
  const bounds={minX:ox+Math.ceil((Math.min(...waypoints.map(r=>r.minX))-size-ox)/size)*size,maxX:ox+Math.floor((Math.max(...waypoints.map(r=>r.maxX))+size-ox)/size)*size,minY:oy+Math.ceil((Math.min(...waypoints.map(r=>r.minY))-size-oy)/size)*size,maxY:oy+Math.floor((Math.max(...waypoints.map(r=>r.maxY))+size-oy)/size)*size};
  const alias=source.match(new RegExp('set\\s+x\\['+(playerId+1)+'\\]\\s*=\\s*(\\w+)'))?.[1];
  const old=alias&&rects.get(alias);if(!old)throw Error('missing GemTower spawn rectangle');
  const entry=centre(waypoints[0]!),from=centre(old),horizontal=Math.abs(entry.x-from.x)>=Math.abs(entry.y-from.y);
  const spawn=horizontal?{x:entry.x>from.x?bounds.minX+grid.cellSize:bounds.maxX-grid.cellSize,y:entry.y}:{x:entry.x,y:entry.y>from.y?bounds.minY+grid.cellSize:bounds.maxY-grid.cellSize};
  const half=grid.cellSize/2;replacements.set(alias!,[spawn.x-half,spawn.y-half,spawn.x+half,spawn.y+half].map(n=>n+'.').join(','));
  return {playerId,bounds,waypoints,entry,spawn};
 });
 const mobileSource=source.replace(/(\bset\s+(\w+)\s*=\s*Rect\()([-\d., ]+)(\))/g,(all,prefix,name,_values,end)=>replacements.has(name)?prefix+replacements.get(name)+end:all);
 const contains=(b:import('../../sim/navigation.ts').NavigationBounds,x:number,y:number)=>x>=b.minX&&x<=b.maxX&&y>=b.minY&&y<=b.maxY;
 // The last source goal is outside the arena. Releasing all bounds for that
 // order let A* bypass completed mazes above/below the visible field. Extend
 // only along the authored last-waypoint -> Ax/Fx corridor, not the full WPM.
 const exits=fields.map((field,playerId)=>{
  const target=rects.get(playerId===0?'Ax':'Fx'),last=field.waypoints.at(-1)!;
  if(!target)throw Error('missing GemTower exit rectangle');
  const corridor={minX:Math.min(last.minX,target.minX),maxX:Math.max(last.maxX,target.maxX),minY:Math.min(last.minY,target.minY),maxY:Math.max(last.maxY,target.maxY)};
  return {target,bounds:{...field.bounds,corridors:[corridor]}};
 });
 const boundsFor:import('../../sim/navigation.ts').NavigationBoundsResolver=e=>e.owner===11?(fields.find(f=>contains(f.bounds,e.orderX,e.orderY))?.bounds??exits.find(f=>contains(f.target,e.orderX,e.orderY))?.bounds):undefined;
 return {ir:{...ir,script:{...ir.script,source:mobileSource}},fields,boundsFor};
}
