/** UI-only observation. Source snapshots stay read-only; the single storage key
 * is a visit preference, never a run/replay/save field or a game command. */
export const FIRST_RUN_GUIDE_KEY='uzmap.ui.gemtower.tutorial.v1';
const CARDS=Object.freeze([
 Object.freeze({step:1,anchor:'build',text:'빈칸을 눌러 보석을 놓아요\n길 위에 놓으면 적이 돌아가요'}),
 Object.freeze({step:2,anchor:'hand',text:'1개를 남기면 나머지는 바위가 돼요\n같은 보석 2개는 조합해 강화해요'}),
 Object.freeze({step:3,anchor:'life',text:'광산에 도착한 적은 생명을 줄여요'}),
 Object.freeze({step:4,anchor:'research',text:'골드로 다음 보석의 등급을 올려요'}),
]);
const finite=value=>typeof value==='number'&&Number.isFinite(value);
const positive=value=>finite(value)&&value>0;
const copy=model=>model?{...model}:null;

export function createFirstRunGuide({storage=()=>globalThis.localStorage,off=false}={}){
 let attempted=false,active=false,stopped=false,phase='place',manualStep=0,model=null,suppressed=false;
 let initialRound=1,lastLife=null,firstCost=null,everAffordable=false,researchDone=false;
 const card=(step,manual=false)=>({...CARDS[step-1],manual});
 const publish=value=>{model=value;return copy(model);};
 function begin(input){
  if(attempted||stopped||off===true||input.ready!==true||input.prepared!==true||input.round!==1||input.buildCount!==0)return;
  attempted=true;
  try{
   const target=storage();
   if(target.getItem(FIRST_RUN_GUIDE_KEY)!==null){stopped=true;return;}
   // Claim this visit before showing anything: reloading midway is a returning visit.
   target.setItem(FIRST_RUN_GUIDE_KEY,'seen');
  }catch{stopped=true;return;}
  active=true;initialRound=input.round;lastLife=finite(input.life)?input.life:null;
 }
 function observeSource(input){
  if(firstCost===null&&positive(input.researchCost))firstCost=input.researchCost;
  if(firstCost!==null&&finite(input.gold)&&input.gold>=firstCost)everAffordable=true;
  if(finite(input.researchLevel)&&input.researchLevel>0)researchDone=true;
  const lifeDecreased=finite(input.life)&&lastLife!==null&&input.life<lastLife;
  const waveEnded=input.firstWaveEnded===true||Number.isSafeInteger(input.round)&&input.round>initialRound;
  const count=Number.isSafeInteger(input.buildCount)&&input.buildCount>=0?input.buildCount:0;
  if(phase==='place'&&count>0)phase='wait-hand';
  if(phase==='wait-hand'&&count>=5)phase='hand';
  if(phase==='hand'&&input.choiceConfirmed===true)phase='wait-wave';
  if(phase==='wait-wave'&&input.combatSeen===true)phase='life';
  // Fast progress between frames must not bring an earlier first-wave lesson back.
  if(waveEnded||phase==='life'&&lifeDecreased)phase='wait-research';
  if(phase==='wait-research'&&researchDone){phase='done';active=false;}
  if(finite(input.life))lastLife=input.life;
  if(phase==='place')return card(1);
  if(phase==='hand')return input.prepared===true?card(2):null;
  if(phase==='life')return card(3);
  if(phase==='wait-research'&&everAffordable&&input.prepared===true&&positive(input.researchCost)&&finite(input.gold)&&input.gold>=input.researchCost)return card(4);
  return null;
 }
 return {
  observe(snapshot={}){
   const input=snapshot&&typeof snapshot==='object'?snapshot:{};
   suppressed=input.restoring===true||input.own===false;
   if(suppressed)return publish(null);
   if(input.fresh===false||input.restoredView===true){active=false;stopped=true;}
   let automatic=null;
   if(input.ready===true&&!stopped&&off!==true){begin(input);if(active)automatic=observeSource(input);}
   return publish(manualStep?card(manualStep,true):automatic);
  },
  openManual(){manualStep=1;return publish(suppressed?null:card(1,true));},
  next(){
   if(!manualStep)return copy(model);
   if(manualStep<4){manualStep++;return publish(suppressed?null:card(manualStep,true));}
   // All four were explicitly read. Do not restart the automatic guide afterwards.
   manualStep=0;active=false;stopped=true;return publish(null);
  },
  skip(){manualStep=0;active=false;stopped=true;return publish(null);},
  snapshot(){return copy(model);},
 };
}
