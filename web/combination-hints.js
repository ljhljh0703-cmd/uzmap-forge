import {gemActions} from './gem-actions.js';
import {fourCC} from './dist/ir/fourcc.js';

/** Original result identity -> existing handbook identity, not recipe eligibility.
 * Source evidence: xTv/c[1] assignments and extractRecipeBook's 24 original rows
 * (artifacts/g-first-run/g4-source-mapping.json). Two source results have no
 * corresponding handbook entry; they still keep their original result type. */
const HANDBOOK_BY_RESULT=Object.freeze({
 h01B:'gem:A038',h018:'gem:A031',h017:'gem:A033',h016:'gem:A030',
 h019:'gem:A037',h014:'gem:A035',h01A:'gem:A02Z',h015:null,
 h01O:'gem:A036',h01N:'gem:A034',h029:'gem:A032',h03X:'gem:A03G',h040:null,
});
const COMBINE_ACTIONS=new Set(['A007','A00R','A03M']);
const empty=()=>({combinableIds:[],specialType:null,priorityRecipeIds:[]});

/** Read only the current five source-hand slots supplied by the caller.
 * Source grants and the actual action view own eligibility. c[player+1] owns
 * which special recipe won the original ordered conditions; never choose a
 * recipe from ingredients, copied predicates, tier arithmetic or RNG here. */
export function combinationHints(w,handIds,{ready=false,playerId=0}={}){
 if(ready!==true||playerId!==0||(w?.viewPlayerId??0)!==0||w?.gameOver||w?.sim?.gameOver||!Array.isArray(handIds)||typeof w?.sim?.getUnit!=='function')return empty();
 const combinableIds=[],seen=new Set();let specialEnabled=false;
 for(const id of handIds.slice(0,5)){
  if(!Number.isSafeInteger(id)||id<=0||seen.has(id))continue;seen.add(id);
  const unit=w.sim.getUnit(id);if(!unit?.alive)continue;
  const enabled=gemActions(w,id).filter(action=>COMBINE_ACTIONS.has(action.abilityId)&&action.disabled===false);
  if(enabled.length)combinableIds.push(id);
  if(enabled.some(action=>action.abilityId==='A00R'))specialEnabled=true;
 }
 let specialType=null;
 if(specialEnabled){
  const value=w.vm?.getGlobalIndexed?.('c',playerId+1);
  if(value?.t==='int'&&Number.isSafeInteger(value.v)&&value.v>0&&value.v<=0xffffffff){
   const type=fourCC(value.v);if(/^[\x20-\xff]{4}$/.test(type))specialType=type;
  }
 }
 const recipe=specialType?HANDBOOK_BY_RESULT[specialType]:null;
 const priorityRecipeIds=recipe&&w.recipeBook?.rows?.some(row=>row?.id===recipe)?[recipe]:[];
 return {combinableIds,specialType,priorityRecipeIds};
}
