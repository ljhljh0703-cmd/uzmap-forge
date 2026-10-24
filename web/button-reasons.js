/** Presentation only: translate an existing rejection; never decide permission,
 * affordability, ability grants or command eligibility. */
export function unavailableReason(reason,{cost,gold,remainingBuilds,otherField}={}){
 if(reason===null||reason===undefined||reason==='')return '';
 if(reason==='insufficient-gold'){
  const gap=Number.isFinite(cost)&&cost>=0&&Number.isFinite(gold)?cost-gold:null;
  return gap!==null&&gap>0?`골드 ${gap} 부족`:'골드가 부족해요';
 }
 if(reason==='not-owner'&&otherField)return '내 전장으로 돌아오세요';
 if(reason==='builds-incomplete')return Number.isSafeInteger(remainingBuilds)&&remainingBuilds>0?`보석 ${remainingBuilds}개를 더 놓아 주세요`:'보석 다섯 개를 모두 놓아 주세요';
 return ({
  'game-over':'게임이 끝났어요',busy:'처리 중이에요','prereq-unmet':'필요한 보석이나 연구가 없어요',
  'missing-data':'원작 자료를 확인할 수 없어요','missing-ability-data':'원작 범위 자료가 필요해요',
  'not-owner':'조종할 수 없는 대상이에요',paused:'일시정지 중이에요',stunned:'기절이 끝나면 사용할 수 있어요',
  'missing-ability':'현재 보석에 없는 능력이에요','missing-unit':'대상을 찾을 수 없어요','missing-target':'대상을 다시 골라 주세요',
  'out-of-range':'시전 사거리를 벗어났어요',unreachable:'대상까지 이동할 수 없어요',
  'max-level':'연구를 완료했어요','unsupported-cost':'아직 지원하지 않는 자원 조건이에요',
  'not-trainable':'구입할 수 없는 항목이에요','not-an-upgrade':'강화할 수 없는 대상이에요',
  'unknown-tech':'연구 정보를 확인할 수 없어요','invalid-order':'지금은 이 명령을 사용할 수 없어요',
  'blocked-placement':'지형이나 다른 건물과 겹쳐요',
 })[reason]??'지금은 사용할 수 없어요';
}

/** One existing explanation node per button, or a small immediately after it.
 * Weak keys do not retain removed upgrade/research buttons. No event listener,
 * observer, button-child rewrite or disabled mutation is installed here. */
export function createButtonReasonView(doc){
 const records=new WeakMap();let serial=0;
 const attr=(node,key)=>node.getAttribute(key);
 const restore=(node,key,value)=>{if(attr(node,key)===value)return;value===null?node.removeAttribute(key):node.setAttribute(key,value);};
 const tokens=button=>(attr(button,'aria-describedby')??'').split(/\s+/).filter(Boolean);
 const removeOwnLink=(button,record)=>{
  if(!record.addedLink)return;
  const next=tokens(button).filter(id=>id!==record.linkId);
  restore(button,'aria-describedby',next.length?next.join(' '):null);
  record.addedLink=false;
 };
 function clear(button){
  const record=button&&records.get(button);if(!record)return false;
  removeOwnLink(button,record);
  if(attr(button,'title')===record.appliedTitle)restore(button,'title',record.baseTitle);
  if(attr(button,'data-disabled-reason')===record.appliedData)restore(button,'data-disabled-reason',record.baseData);
  if(record.created)record.node.remove();
  else{
   if(record.node.textContent===record.appliedText&&record.node.textContent!==record.baseText)record.node.textContent=record.baseText;
   if(record.node.hidden===false&&record.node.hidden!==record.baseHidden)record.node.hidden=record.baseHidden;
   if(record.assignedId&&record.node.id===record.assignedId)restore(record.node,'id',record.baseId);
  }
  records.delete(button);return true;
 }
 function set(button,text,existingNode){
  text=typeof text==='string'?text.trim():'';
  if(!button||button.disabled!==true||!text){if(button)clear(button);return null;}
  let record=records.get(button);
  if(record&&existingNode&&existingNode!==record.node){clear(button);record=null;}
  if(!record){
   const node=existingNode??doc.createElement('small'),created=!existingNode;
   if(created)node.className='button-disabled-reason';
   record={node,created,baseTitle:attr(button,'title'),baseData:attr(button,'data-disabled-reason'),baseText:node.textContent,baseHidden:node.hidden,baseId:attr(node,'id'),assignedId:null,linkId:null,addedLink:false,appliedTitle:null,appliedData:null,appliedText:null};
   records.set(button,record);
  }else{
   // Source renderers may refresh these between calls. Preserve their latest
   // value rather than restoring a stale title or reason from an earlier frame.
   if(attr(button,'title')!==record.appliedTitle)record.baseTitle=attr(button,'title');
   if(attr(button,'data-disabled-reason')!==record.appliedData)record.baseData=attr(button,'data-disabled-reason');
   if(!record.created&&record.node.textContent!==record.appliedText)record.baseText=record.node.textContent;
   if(!record.created&&record.node.hidden!==false)record.baseHidden=record.node.hidden;
  }
  const node=record.node;
  if(record.created&&button.parentNode&&(node.parentNode!==button.parentNode||button.nextSibling!==node))button.parentNode.insertBefore(node,button.nextSibling);
  if(!node.id){let id;do{id='button-disabled-reason-'+(++serial);}while(doc.getElementById?.(id));node.id=id;record.assignedId=id;}
  if(record.linkId!==node.id){removeOwnLink(button,record);record.linkId=node.id;}
  const current=tokens(button);
  if(!current.includes(node.id)){button.setAttribute('aria-describedby',[...current,node.id].join(' '));record.addedLink=true;}
  if(node.textContent!==text)node.textContent=text;if(node.hidden!==false)node.hidden=false;record.appliedText=text;
  restore(button,'title',text);record.appliedTitle=text;
  restore(button,'data-disabled-reason',text);record.appliedData=text;
  return node;
 }
 return {set,clear};
}
