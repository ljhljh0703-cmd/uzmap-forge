import {requestModeChoice} from './gem-actions.js';
/** Presentation of ordinary source choices/results; no game state writes. */
export function keepResultNotice(name,keptId,hand=[],rocks=[]){
 const last=name?.charCodeAt(name.length-1),particle=last>=0xac00&&last<=0xd7a3&&(last-0xac00)%28?'을':'를';
 const count=hand.filter(item=>item.id!==keptId&&rocks.some(rock=>rock.x===item.x&&rock.y===item.y)).length;
 return `${name}${particle} 남겼어요`+(count?` · 나머지 ${count}개는 바위`:'');
}

const DIFFICULTIES=[['쉬움','처음이라면 추천해요'],['보통','미로와 조합에 익숙하다면'],['어려움','도전하는 숙련자를 위한 판']];
/** MA[1] and its button IDs belong to the original local-player difficulty dialog. */
export function sourceDifficultyChoices(w){
 const h=w?.vm?.getGlobalIndexed?.('MA',1),dialog=h?.t==='handle'&&h.v!==null?w.vm.handles.get(h.v):null;
 return DIFFICULTIES.map(([label,description],index)=>({dialogId:dialog?.kind==='dialog'?dialog.id:null,buttonId:dialog?.data?.buttons?.length===3?dialog.data.buttons[index]:null,index,label,description}));
}
export function sourceDifficultyLabel(w,dialogId,buttonId,fallback){
 return sourceDifficultyChoices(w).find(c=>c.dialogId===dialogId&&c.buttonId===buttonId)?.label??fallback;
}
export function requestStartupChoice(w,mode,index){
 const choice=sourceDifficultyChoices(w)[index];
 if(!choice||!requestModeChoice(w,mode))return false;
 w.runMode=mode;w.startupChoice={index};return true;
}
/** Same inject/record seam as a manual native-dialog click, once the source exposes it. */
export function advanceStartupChoice(w){
 const pending=w.startupChoice;if(!pending||w.modeDialog?.pendingButtonId!==undefined)return false;
 const choice=sourceDifficultyChoices(w)[pending.index];if(!choice?.buttonId)return false;
 const dialog=w.vm.handles.get(choice.dialogId);
 if(dialog?.kind!=='dialog'||!dialog.data.buttons.includes(choice.buttonId)||!dialog.data.visibleTo?.includes(0))return false;
 w.sim.injectDialogClick(0,choice.buttonId);w.recordInput?.({kind:'dialog',playerId:0,buttonId:choice.buttonId,dialogId:choice.dialogId});w.nativeDialogPendingId=choice.dialogId;delete w.startupChoice;return true;
}

export function completedKeepNotice({request,kept,chosen,rocks=[],name}){
 if(request.abilityId!=='A009'||request.spellTick===undefined||!kept?.alive||kept.id!==request.unitId||kept.owner!==0||chosen!==true||!request.hand)return null;
 const others=request.hand.filter(item=>item.id!==kept.id);
 if(!others.every(item=>rocks.some(rock=>rock.x===item.x&&rock.y===item.y)))return null;
 return keepResultNotice(name,kept.id,request.hand,rocks);
}
