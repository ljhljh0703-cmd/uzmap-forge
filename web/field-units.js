import {gemGradePresentation} from './play-ui.js';
import {spriteFrame} from './visual-assets.js';

/** View-only B art. No entity, path, RNG, selection or save state is modified. */
export const FIELD_GRADE_COLORS=Object.freeze(['#ada99c','#46a250','#368ac6','#a66ec7','#e6bb46','#d95d50']);

/** Six source grades; the existing decorative perfect alias is accepted too.
 * Unknown objects never silently acquire a quality ring. */
export function fieldGradeIndex(nameOrGrade){
 if(Number.isInteger(nameOrGrade)&&nameOrGrade>=0&&nameOrGrade<6)return nameOrGrade;
 if(typeof nameOrGrade!=='string')return null;
 const plain=nameOrGrade.replace(/\|c[\da-f]{8}|\|r/gi,'').trim();
 const label=plain.match(/^(최하급|최상급|하급|중급|상급|완벽한|퍼펙트)(?:\s|$)/)?.[1];
 const grade=gemGradePresentation(label==='퍼펙트'?'완벽한':label);
 return grade?grade.rank-1:null;
}

const validPoint=({x,y,size}={})=>[x,y,size].every(Number.isFinite)&&size>0;

/** Keep the native gem at its old size. Its base overlaps the bottom of that
 * same square instead of extending a visual or input footprint into a neighbour. */
export function fieldGemPlan(input={}){
 if(!validPoint(input))return null;
 const {x,y,size}=input,gradeIndex=fieldGradeIndex(input.grade);
 return {gradeIndex,pedestalKey:gradeIndex===null?null:`pedestal:${input.selected?'selected:':''}${gradeIndex}`,
  gem:{x,y,size,anchor:.5},pedestal:{x,y:y+size*.1,width:size,height:size*.8}};
}

function loaded(sprites,key){return Boolean(key&&sprites?.get?.(key));}
function availableKey(sprites,preferred,fallback){return loaded(sprites,preferred)?preferred:loaded(sprites,fallback)?fallback:null;}

/** Fit a trimmed atlas cell in a box without stretching its authored aspect. */
function fitSize(sprites,key,box,tick=0){
 const sprite=sprites.get(key);if(!sprite)return null;
 const frame=spriteFrame(sprite.spec,tick);
 return Math.min(Math.floor(box.width)/frame.w,Math.floor(box.height)/frame.h)*Math.max(frame.w,frame.h);
}

export function drawFieldGem(ctx,options={}){
 const plan=fieldGemPlan(options),{sprites,logical,tint,tick=0}=options;
 if(!plan||!sprites?.draw||!logical)return false;
 // Never paint an orphan base when the original gem must use its shape fallback.
 const base=plan.pedestalKey&&availableKey(sprites,plan.pedestalKey,'pedestal:'+plan.gradeIndex);
 if(loaded(sprites,logical)&&base){
  const size=fitSize(sprites,base,plan.pedestal);
  if(size>0)sprites.draw(ctx,base,plan.pedestal.x,plan.pedestal.y,size,{tick:0,anchor:.5,shadow:false});
 }
 return sprites.draw(ctx,logical,plan.gem.x,plan.gem.y,plan.gem.size,{tick,tint,anchor:plan.gem.anchor,shadow:false});
}

function drawFieldObject(ctx,options,preferred,fallback){
 if(!validPoint(options)||!options.sprites?.draw)return false;
 const {sprites,x,y,size,tick=0}=options,key=availableKey(sprites,preferred,fallback);
 return key?sprites.draw(ctx,key,x,y,size,{tick,anchor:.5,shadow:false}):false;
}
export function drawFieldStone(ctx,options={}){return drawFieldObject(ctx,options,'field:stone','stone');}
export function drawFieldSlate(ctx,options={}){return drawFieldObject(ctx,options,'field:slate',options.logical);}
export function drawFieldPlacement(ctx,options={}){return drawFieldObject(ctx,options,'field:placement','gem:unknown:0');}

/** Stable view variation only; this hash never touches the simulation RNG. */
function typeVariant(typeId,count){
 let hash=0;for(const ch of String(typeId??''))hash=(Math.imul(hash,31)+ch.codePointAt(0))>>>0;
 return hash%count;
}
export function monsterArtKey({typeId,band,airborne}={}){
 if(band==='boss'||band==='hell')return 'creep:mine:ogre';
 const flying=typeof airborne==='boolean'?airborne:band==='flying';
 const names=flying?['bat','wisp']:['goblin','beetle','rat'];
 return 'creep:mine:'+names[typeVariant(typeId,names.length)];
}

/** y is the caller's existing rendered/hovered baseline. groundY is the original
 * path position, keeping health bars, flight marks and authored .8 anchor intact. */
export function drawMineCreep(ctx,options={}){
 if(!validPoint(options)||!options.sprites?.draw)return false;
 const {sprites,typeId,band='ground',x,y,size,tick=0,flip=false,reducedMotion=false}=options;
 const airborne=typeof options.airborne==='boolean'?options.airborne:band==='flying';
 const key=availableKey(sprites,monsterArtKey({typeId,band,airborne}),'creep:'+band);
 if(!key)return false;
 if(airborne){
  const groundY=Number.isFinite(options.groundY)?options.groundY:y;
  ctx.save();ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(x,groundY+size*.18,size*.26,size*.09,0,0,Math.PI*2);ctx.fill();ctx.restore();
 }
 return sprites.draw(ctx,key,x,y,size,{tick:reducedMotion?0:tick,anchor:.8,flip,
  ...(airborne?{shadow:false}:{shadowColor:'rgba(0,0,0,.3)'})});
}

/** HP rail denominator only; never change an entity, RNG, input or save.
 * Supplied GemTower_Max_7C source: race spawn -> Ib/Wae (CR-normalized
 * lines 53236-53254), Wve sets sA/pA (53216-53232). Easy uses pA; normal
 * uses it from authored wave35. Native SetUnitLifePercentBJ/setLife applies
 * max*max(0,percent)*.01, Math.round, then [0,max] clamp in that order.
 * The caller supplies Be, sA/pA for the unit's source field and its matching
 * GEMTOWER_BALANCE role. b[1..50] has 50 unique IDs matching role.wave exactly
 * (health-audit evidence); current round is deliberately never consulted.
 * Classic, special/event units and unknown roles have no such spawn proof.
 * maxHp below is a presentation baseline, not the unit's physical hpMax.
 * Re-derive it after restore or an unseen same-tick hit; never learn it from
 * the first rendered HP. Healing above the baseline stays untouched. */
export function creepHealthPresentation(entity,{sourceMode,difficulty,creepLifePercent}={},role){
 const hp=entity?.hp,maxHp=entity?.hpMax,raw={hp,maxHp};
 if(sourceMode!==2||role?.kind!=='creep'||!Number.isInteger(role.wave)||role.wave<1||role.wave>50||
  entity?.typeId==='h04Q'||entity?.typeId==='H04B'||!Number.isFinite(maxHp)||maxHp<=0||!Number.isFinite(creepLifePercent))return raw;
 if(difficulty!==1&&!(difficulty===2&&role.wave>=35))return raw;
 return {hp,maxHp:Math.max(0,Math.min(maxHp,Math.round(maxHp*Math.max(0,creepLifePercent)*.01)))};
}
