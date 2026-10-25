import {FIRST_RUN_TIPS} from './first-run-guide.js';
import {H_AUDIO_CUES,H_BGM,H_CUE_SETTINGS} from './audio-catalog.js';
import {mountAudioSettings} from './audio-settings.js';
import {createGameRecording} from './audio-recording.js';
import {createSoundEventRouter,sourceCueForCall} from './sound-events.js';
import {createFirstRunGuide} from './first-run-guide.js';
import {createWaveWarnings,createEnemyEncounters} from './first-run-guide.js';
import {combinationHints} from './combination-hints.js';
import {sourceButtonHelp} from './first-run-guide.js';
import {researchShortcutModel,mountResearchShortcut,mountFirstRunGuide} from './first-run-guide.js';
import {createButtonReasonView,unavailableReason} from './button-reasons.js';
import {desktopFieldLayout,sourceWaveCounts,nextWaveView,mountNextWave,attackRangeModels,drawAttackRanges,isExitThreat,creepStatusIcons,hasEnemySlowAura,drawCreepStatus,drawExitThreat,mountHudLifeCue} from './battlefield-readability.js';
import {parseJass} from './dist/jass/parser.js';
import {fourCC} from './dist/ir/fourcc.js';
import {drawFieldGem,drawFieldStone,drawFieldSlate,drawFieldPlacement,drawMineCreep} from './field-units.js';
import {drawGroundRoute,drawFieldLandmarks} from './field-ground.js';
import {createPrecisionCamera} from './precision-camera.js';
import {mountGameMenu} from './game-menu.js';
import {mountEffectIcons,drawFieldEffectMarks,createFieldFeedback} from './field-effects.js';
import {keepResultNotice,completedKeepNotice,sourceDifficultyChoices,sourceDifficultyLabel,requestStartupChoice,advanceStartupChoice} from './first-minute.js';
import {createActionFeedback,createCueAudio} from './action-feedback.js';
import {createBuildPreview} from './dist/runtime/build-preview.js';
import {terrainPixel,drawFieldRim,drawBuildRoute,drawFieldGround,drawCreepHealth,drawGemGrade,drawObjectKindMark,drawAirborneMark,placementLoupeBox,drawPlacementLoupe} from './field-art.js';
import {createFrameTask,resizeCanvasToHost,mountLoadingScreen,readResponseBytes,isShortTouchLandscape,isDesktopPlayLayout,smallCellNeedsConfirmation} from './browser-runtime.js';
import {createRunCheckpoint} from './run-checkpoint.js';
import {createRunId,restoredRunId,saveRunRecord,listRunRecords,isRunCompatible,canVerifyRunUpgrade,saveVerifiedRunCopy} from './run-storage.js';
import {resolveWtsText} from "./dist/formats/wts.js";
import {SpriteBank} from "./visual-assets.js";
import {mountGemSkin,selectionStageHint} from "./ui-skin.js";
import {createCasinoFeedback} from "./casino-feedback.js";
import {extractRecipeBook} from "./recipe-book.js";
import {mountRecipeBook} from "./recipe-view.js";
import {mountOverlapPicker} from "./overlap-picker.js";
import {targetGemActions,armGemTarget,cancelGemTarget,currentGemTarget,gemTargetReason,issueGemTarget} from "./gem-targeting.js";
import {gemTowerMobileLayout,GEMTOWER_FIELD_RECTS,installGemTowerOutcome,gemTowerPlayerState,gemTowerGemFamily,gemTowerPlayerGemIds,createGemTowerSourceDefs,gemTowerCasinoState} from "./dist/runtime/maps/gemtower.js";
import {DT} from "./dist/sim/rng.js";
import {visibleGemChoices,classifyMapGesture,trainingOptionView,trainingInterruptionText,TRAIN_REASON,pointInBattlefield,playerCamera,battlefieldCamera,battlefieldBounds,gemSpriteSize,remainingBuildSlots,screenFootprintBox,ingressMarker,lifeLossFeedback,simplifyPlayShell,showGemAction,visibleBuildBlocks,rangeInBuildCells,attackDisplay,attackTargetLabel,upgradeAttackSummary,upgradeConditionText,gemActionConditions,combatEffectLabels,gemObjectPresentation,creepVisualPresentation,gemGradePresentation,attackTypeLabel} from "./play-ui.js";
import {trainingActions,requestTrainingBatch,advanceTrainingBatch,armSlateMove,issueSlateMove, availableGemCombinations,blockedCreepCount,ownedRocks,validateInputReplay,replayInputBatch,gemActions, gemBuildHint, isGemSelectable, captureGemCast, observeGemCast, parseSessionSeed, freshSessionSeed, requestModeChoice, flushModeChoice, extractGemPresentation } from "./gem-actions.js";
import { loadLocalStockProfile, parseStockProfile } from "./local-stock.js";
import {isLocalGameHost,readPlayFiles,sourceGemPresentation,loadHostedPlayFiles} from "./source-input.js";
import {createUnitIdentityProvider} from "./dist/runtime/unit-identity.js";
import { createSession, readScriptMap } from "./dist/runtime/session.js";
// Mobile play: source terrain, direct construction and the approved automatically fitted field.
import { parseMiscConstants } from "./dist/formats/misc.js";
import { worldToCell, FLAG_NO_WALK, FLAG_NO_BUILD } from "./dist/formats/wpm.js";
import { DefStore } from "./dist/sim/def-store.js";
import { GEMTOWER_BALANCE, GEMTOWER_SOLO_SLOTS } from "./dist/sim/balance/configs/gemtower.js";
import { researchCostForLevel } from "./dist/sim/balance/config.js";
import { createFrameClock } from "./dist/sim/ticks.js";
import { PLAYER_STATE_RESOURCE_LUMBER, ALLIANCE_TYPES } from "./dist/sim/playerstate.js";

const $ = (id) => document.getElementById(id);
const loadingScreen=mountLoadingScreen(document,{tips:FIRST_RUN_TIPS});
const cv = $("cv"), ctx = cv.getContext("2d");
const surface=cv.parentElement;
const sprites = new SpriteBank({onRevision:meta=>{invalidateSpriteViews(world,meta);if(meta.kind==='error')$('artStatus').textContent='일부 그림은 기본 도형으로 표시됩니다';}});
const effectIcons=mountEffectIcons({document,host:$('gemEffectIcons'),sprites});
const gemSkin=mountGemSkin({document,
 drawGem:(context,item,x,y,size)=>item.kind==='stone'?drawFieldStone(context,{sprites,x,y,size}):item.kind==='slate'?drawFieldSlate(context,{sprites,logical:item.logical,x,y,size}):drawFieldGem(context,{sprites,logical:item.logical,x,y,size,grade:item.name,selected:item.selected,tint:item.tint,tick:0}),
 selectUnit:id=>selectGemById(world,id),
 armTarget:abilityId=>{if(world&&armGemTarget(world,world.selectedGemId,abilityId)){world.buildCellsView=null;flash('교환할 보석을 누르세요 · 보유 목록에서도 선택할 수 있습니다');render(world);}},
 cancelTarget:()=>{if(world&&cancelGemTarget(world)){flash('교환을 취소했습니다');render(world);}},
 approachCasino:id=>{if(world)requestCasinoApproach(world,id);}
});
simplifyPlayShell(document);
const recipeGuide=mountRecipeBook(document);
const gameMenu=mountGameMenu(document);
const buttonReasons=createButtonReasonView(document);
const roundSlotsHelp=document.createElement('small');roundSlotsHelp.id='roundSlotsHelp';roundSlotsHelp.className='round-slots-help';roundSlotsHelp.hidden=true;$('roundTray').append(roundSlotsHelp);
const researchShortcut=mountResearchShortcut(document,{purchase:techId=>requestResearch(world,techId),reducedMotion:()=>matchMedia('(prefers-reduced-motion: reduce)').matches});
const firstRunView=mountFirstRunGuide(document,{skip:()=>{world?.firstRunGuide?.skip();if(world)render(world);},next:()=>{world?.firstRunGuide?.next();if(world)render(world);}});
const showFirstRunGuide=document.createElement('button');showFirstRunGuide.id='showFirstRunGuide';showFirstRunGuide.type='button';showFirstRunGuide.className='sec';showFirstRunGuide.textContent='안내 다시 보기';showFirstRunGuide.disabled=true;showFirstRunGuide.onclick=()=>{if(world){world.firstRunGuide.openManual();setDrawer(false);render(world);}};$('menuPanelSettings').insertBefore(showFirstRunGuide,$('advancedOptions'));
const quickRecipes=document.createElement('button');quickRecipes.id='quickRecipes';quickRecipes.type='button';quickRecipes.className='sec';quickRecipes.textContent='조합표';quickRecipes.onclick=()=>{setDrawer(true);gameMenu.reveal('recipeOptions');};$('researchShortcut').insertBefore(quickRecipes,$('quickResearchDetail'));
const nextWaveCard=mountNextWave(document,Object.assign((context,model,x,y,size)=>drawMineCreep(context,{sprites,typeId:model.typeId,band:model.band,airborne:model.motion==='공중',x,y,groundY:y,size,tick:0,reducedMotion:true}),{ready:()=>sprites.ready?sprites.revision:0}));
const overlapPicker=mountOverlapPicker(document,id=>{if(world)selectOverlapGem(world,id);});
const reducedMotion=matchMedia("(prefers-reduced-motion: reduce)");
const coarsePointer=matchMedia("(pointer:coarse)");
const lifeHud=mountHudLifeCue({document,sprites,feedback:createFieldFeedback({reducedMotion:()=>reducedMotion.matches}),reducedMotion:()=>reducedMotion.matches});
$('gameApp').dataset.audioRequests='0';
const fetchAudioFile=url=>{$('gameApp').dataset.audioRequests=String(Number($('gameApp').dataset.audioRequests)+1);return fetch(url);};
let soundSettings=null,soundRecording=null;
const actionAudio=createCueAudio({fetch:fetchAudioFile,logLimit:2048,cueUrls:H_AUDIO_CUES,bgmUrls:H_BGM,cueSettings:H_CUE_SETTINGS,onState:state=>{
 const button=$('feedbackSound'),label=$('feedbackSoundStatus');if(!button||!label)return;
 button.textContent=state.enabled?'소리 켜짐':'소리 꺼짐';button.setAttribute('aria-pressed',String(state.enabled));button.dataset.soundState=state.status;button.dataset.played=String(state.played);
 const text=({idle:'첫 터치 후 소리가 준비됩니다',loading:'소리 준비 중…',ready:'소리 준비됨',muted:'소리가 꺼져 있습니다',paused:'다음 터치부터 소리가 재개됩니다',blocked:'소리를 준비하지 못했습니다 · 다시 켜서 시도하세요',unsupported:'이 브라우저는 소리를 지원하지 않습니다'})[state.status];if(label.textContent!==text)label.textContent=text;soundSettings?.render(state);
}});
const actionFeedback=createActionFeedback({document,play:kind=>queueSoundEvent(world,kind,{key:kind+':'+world.sim.tickCount}),reducedMotion:()=>reducedMotion.matches});
soundSettings=mountAudioSettings(document,{audio:actionAudio,muted:new URLSearchParams(location.search).get('muted')==='1'});
const soundLabel=document.querySelector('.feedback-sound .sound-label');if(soundLabel)soundLabel.textContent='소리';
const unlockActionAudio=event=>{if(event.isTrusted===false)return;void actionAudio.unlock();};
document.addEventListener('pointerdown',unlockActionAudio,{capture:true,passive:true});
document.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' ')unlockActionAudio(event);},true);
document.addEventListener('click',event=>{const button=event.target?.closest?.('button,[role=tab]');if(event.isTrusted===false||!button||button.disabled||button.getAttribute('aria-disabled')==='true')return;queueSoundEvent(world,'tap',{key:'tap:'+performance.now()});flushGameSound(world);},true);
const quietActionFeedback=()=>{void soundRecording?.stop();lifeHud.clear();actionFeedback.clear();world?.fieldFeedback?.clear();if(world){world.waveNotice=null;world.enemyEncounters?.clear();}void actionAudio.suspend();};
document.addEventListener('visibilitychange',()=>{if(document.hidden)quietActionFeedback();});
window.addEventListener('pagehide',quietActionFeedback);

const artManifestURL=new URL("./assets/manifest.json",import.meta.url);
const contentBuild=new URL(import.meta.url).searchParams.get("build");
const replayBuild=/^[a-f0-9]{16}$/.test(window.UZMAP_REPLAY_BUILD??'')?window.UZMAP_REPLAY_BUILD:null;
if(contentBuild)artManifestURL.searchParams.set("build",contentBuild);
installLocalSoundReview();
const visualReady=sprites.load(artManifestURL.href,{lazy:true}).then(()=>{
  $("artStatus").textContent=sprites.errors.length?"일부 그림은 기본 도형으로 표시됩니다":"기존 제작 그래픽 연결됨";
  if(sprites.errors.length)console.warn("[art fallback]",...sprites.errors);
  $("gameApp").dataset.artCriticalReady=String(sprites.ready&&sprites.errors.length===0);
  gemSkin.refresh();
});
const NEUTRAL_GC = { armorFactorPm: 60, strHitPointBonus: 0, agiDefenseBonusPm: 0, intManaBonusPm: 0 };
const sessionQuery = new URLSearchParams(location.search);
let sessionSeed = parseSessionSeed(sessionQuery.get("seed"),null) ?? freshSessionSeed(undefined,crypto);
const MAP_URL = "../fixtures/maps/GemTower_Max_7C.w3x";
const localSourceMode=isLocalGameHost(location.hostname)&&sessionQuery.get("input")!=="files";
let selectedSource=null;
// App placement reuses the original construction queue and source gem-roll callback.

// Real elapsed time drives the existing fixed-step simulation; one displayed 1x is one second per second.
const frameClock = createFrameClock();
let restoring=false,restoreCancelled=false;
let runtimeFailed=false,loadingRun=false;
let world = null, playing = false, tps = 1, rectEntered = 0, deaths = 0, gatePassed = 0;
window.addEventListener('game-runtime-error',()=>{runtimeFailed=true;playing=false;world?.viewFeedback?.clear();void world?.cueAudio?.suspend();frameClock.reset();$("play").disabled=true;$("runState").textContent='오류로 정지';});
// G-6(DISPATCH_SONNET_G3_G6 §2 G-6, GEM_IDENTITY_MINE_DESIGN §6) — TextTag(피격/획득 부유 숫자).
// Attacked 이벤트엔 대미지 수치 필드가 없어(world_api.ts SimEvent — attackerUnitId/targetUnitId만) 값
// 재구현 없이 "매 스텝 전/후 hp 스냅샷 차이"로 대미지량을 관측한다(엔진 hp mutation을 그대로 읽을 뿐 —
// 특수뎀(트리거 UnitDamageTargetBJ)·엔진뎀(combatStep) 양쪽 다 이 경로로 자동 포착돼 이원 배선이 불필요).
// 골드도 동일하게 ledger.gold(p) 틱 간 차분으로 "{n} 골드!"/"+{n} 골드"를 띄운다(원문 3형, MAP_DISSECTION
// §99 실측). 값 판정 0 — 이미 엔진이 낸 hp/gold 변화를 표면화만 한다.
let prevHp = new Map(), prevGold = [0, 0, 0, 0, 0, 0, 0, 0];
let textTags = []; // {x,y,text,color,born} — 월드 좌표(피격 위치)
let goldTags = []; // {text,born} — 골드는 세계좌표 개념이 없어(플레이어 리소스) HUD 부근 고정 앵커에 표시
function spawnTextTag(x, y, text, color) { textTags.push({ x, y, text, color, born: performance.now() }); }
function spawnGoldTag(amount) { goldTags.push({ text: "+" + amount + " 골드", born: performance.now() }); }
// Source startup/resources now execute through the existing force callbacks; no view-side grants.
let waveNum = 0, prevCreeps = 0, flashMsg = "", flashUntil = 0;
// U-2b(DISPATCH_SONNET_U2_GAMESHELL §2 U-2b) — 총 웨이브 수. 리터럴 50을 박지 않고 roleTable(엔진 데이터)
// 크립 항목의 wave 필드 최댓값을 그대로 집계한다(발명 0 — GEMTOWER_BALANCE.maxWave=60은 config validator의
// 검증 상한일 뿐 실제 콘텐츠 총량이 아니다, config.ts:249 "maxWave 부적합" 가드 참조). 교차 확인: 이 집계는
// docs/PLAYABLE_DESIGN.md·VISUAL_ASSET_DESIGN.md·LIFE_LOOP_DESIGN.md·MASTER_COMPLETION_PLAN.md 전부가
// 반복 확정한 "50웨이브" 사실과 일치한다(원장:문서 교차 검증).
const TOTAL_WAVES = Math.max(...Object.values(GEMTOWER_BALANCE.roleTable)
  .filter((r) => r.kind === "creep").map((r) => r.wave));
// U-2e(DISPATCH_SONNET_U2_GAMESHELL §2 U-2e) — 타워 공격 juice(발사/타격 라인+임팩트). SimEvent
// "Attacked"(world_api.ts)엔 좌표가 없어(attackerUnitId/targetUnitId만) attackFx는 아래 stepN()의
// lastPos 스냅샷에서 좌표를 얻는다(재발명 0 — 엔진이 이미 낸 이벤트+엔티티 위치를 관측만).
let attackFx = []; // {x1,y1,x2,y2,color,born}
let lastPos = new Map(); // unitId -> {x,y}: 직전 스텝에서 살아있던 엔티티의 마지막 위치(사망 유닛 좌표 폴백용)
// U-2b — 웨이브 전환 연출(펄스) 타임스탬프. HUD 요소 스타일링 전용 — 값 판정 0.
let waveFlashUntil = 0;
// 게임 카메라: 월드 중심(cx,cy) + zoom(px/월드유닛). 화면=(월드-중심)*zoom+화면중심(y반전).
const cam = { cx: 0, cy: 0, zoom: 0.2 };
const MAX_FIELD_PLAYERS=2;
// Authored source route rectangles: entry, four turns, and the local exit.
// Mobile source spawn is at this frame; the original return corridor and leak gate remain.
const FIELD_RECTS=GEMTOWER_FIELD_RECTS;
function sourceRect(w,name){
 const value=w.vm.getGlobal(name),h=value.t==='handle'&&value.v!==null?w.vm.handles.get(value.v):null;
 return h?.kind==='rect'?{minX:h.data.minx,minY:h.data.miny,maxX:h.data.maxx,maxY:h.data.maxy}:null;
}
function sourceIndexedRect(w,name,index){
 const value=w.vm?.getGlobalIndexed?.(name,index),h=value?.t==='handle'&&value.v!==null?w.vm.handles.get(value.v):null;
 return h?.kind==='rect'?{minX:h.data.minx,minY:h.data.miny,maxX:h.data.maxx,maxY:h.data.maxy}:null;
}
function fitPlayerField(w){
 const player=w.viewPlayerId??0;
 if(!w.fieldRects)w.fieldRects=FIELD_RECTS.map(names=>names.map(name=>sourceRect(w,name)).filter(Boolean));
 const rects=[...(w.fieldRects[player]??[])],retained=new Set(gemTowerPlayerGemIds(w.vm,player));
 for(const e of w.sim.entities.values()){
  if(!e.alive||e.owner!==player&&!retained.has(e.id))continue;
  const role=defOf(w,e.typeId)?.meta?.role;
  if(e.typeId==='h00G'||w.knownGemIds?.has(e.typeId)||role?.kind==='tower'||role?.archetype==='specialGem')rects.push({minX:e.x,minY:e.y,maxX:e.x,maxY:e.y});
 }
 if(w.mobileFields?.[player]){const b=w.mobileFields[player].bounds;w.viewBounds=b;w.playerBounds=sourceIndexedRect(w,'Ge',player+1);Object.assign(cam,{cx:(b.minX+b.maxX)/2,cy:(b.minY+b.maxY)/2,zoom:Math.max(.001,Math.min(Math.max(1,cv.width-40)/(b.maxX-b.minX),Math.max(1,cv.height-40)/(b.maxY-b.minY)))});}
 else if(rects.length){w.viewBounds=battlefieldBounds(rects);w.playerBounds=sourceIndexedRect(w,'Ge',player+1);Object.assign(cam,battlefieldCamera(rects,cv.width,cv.height));}
 else{const anchor=w.sim.playerState.getStartLocation(player);if(anchor)Object.assign(cam,playerCamera(anchor,cv.width,cv.height));}
}
function switchField(w,playerId){
 if(!w||!Number.isInteger(playerId)||playerId<0||playerId>=MAX_FIELD_PLAYERS)return;
 if(playerId!==0&&w.sim.playerState?.getSlotState(playerId)!==1&&w.sim.playerState)return;
 w.precisionCamera?.reset();drag.on=false;drag.cell=null;
 w.fieldFeedback?.clear();w.viewPlayerId=playerId;w.cameraMode='fit';w.hover=null;w.hoverGemId=null;w.buildCellsView=null;
 fitPlayerField(w);render(w);
}
function renderFieldView(w){
 const player=w.viewPlayerId??0,other=player!==0,connected=w.sim.playerState.getSlotState(player)===1;
 const app=$('gameApp');app.dataset.field=other?'other':'mine';app.dataset.camera=w.cameraMode??'fit';app.dataset.selected=String(w.selectedGemId!==null);
 for(const [index,id] of ['fieldMine','fieldOther'].entries()){
  const tab=$(id);tab.setAttribute('aria-selected',String(index===player));tab.tabIndex=index===player?0:-1;
 }
 $('fieldOther').hidden=w.sim.playerState.getSlotState(1)!==1;
 $('fieldOtherState').textContent=w.sim.playerState.getSlotState(1)===1?'관전':'미접속';
 $('cv').setAttribute('aria-label',other?'상대 전장 관전. 내 전장 탭으로 돌아가 건설하세요':'내 전장. 빈칸을 눌러 건설하고, 누른 동안 지상 예상 길을 확인하세요. 보석을 누르면 선택합니다');
 $('combatCount').hidden=other&&!connected;
 $('spectatorBanner').hidden=!other;$('spectatorBanner').textContent=connected?'상대 전장 · 관전 중':'상대 미접속 · 두 번째 전장';
 $('spectatorActions').hidden=!other;$('bottomPanel').inert=other||restoring;
 $('battlefield').setAttribute('aria-labelledby',other?'fieldOther':'fieldMine');
 for(const id of ['trainingOptions','casinoPanel'])if($(id))$(id).inert=other||restoring;
 for(const id of RESEARCH_IDS)if(other)$('rs'+id+'Btn').disabled=true;
 if(other)$('chatSend').disabled=true;
 const state=gemTowerPlayerState(w.vm,player),now=performance.now();w.displayedLife??=[];w.lifeHitUntil??=[];w.lifeHitMessage??=[];
 const loss=lifeLossFeedback(w.displayedLife[player],state.life);
 const lifeStatus=$('lifeLossStatus');
 if((restoring||w.displayedLife[player]===undefined)&&lifeStatus?.textContent)lifeStatus.textContent='';
 if(loss&&!restoring&&!document.hidden&&w.modeDialog?.clicked&&(state.round??0)>0){
  w.lifeHitUntil[player]=now+1800;w.lifeHitMessage[player]=loss;
  lifeHud.emit({key:`${w.runId}:${w.sim.tickCount}:life:${player}:${state.life}`});
  if(lifeStatus)lifeStatus.textContent=(other?'상대 전장 · ':'')+loss+` · 남은 생명 ${state.life}`;
 }
 w.displayedLife[player]=state.life;const hit=now<(w.lifeHitUntil[player]??0);
 $('hudLife').closest('.hud-pill').dataset.lifeHit=String(hit);$('exitMarker').dataset.hit=String(hit);
 $('exitLegendLabel').textContent=hit?w.lifeHitMessage[player]:'광산으로 · 도착 시 생명 감소';
 const hint=$('gemNone').querySelector('span');hint.textContent=w.pendingBuilds.length?`건설 대기 ${w.pendingBuilds.length}개${playing?' · 완성 중':' · 재개해서 완성하기'}`:w.precisePlacement?'정밀 배치 · 빈칸을 고르고 아래 건설로 확정':selectionStageHint(state);
 if(other){
  $('hudGold').textContent=connected?Math.floor(w.sim.ledger.gold(player)):'—';
  $('hudLife').textContent=connected?(state.life??'—'):'—';
  $('hudTower').textContent=connected?gemTowerPlayerGemIds(w.vm,player).length:'—';
  $('hudWaveNum').textContent=connected?(state.round??'—'):'—';
  $('buildCells').hidden=true;$('cancelPoint').hidden=true;
 }
}
const drag = { on: false, moved: false, sx: 0, sy: 0 };
// U-1c 호버 툴팁용 최근 마우스 화면좌표(캔버스 픽셀 기준) — 조작 입력 아님, 렌더 위치 계산 전용.
let mouseScreen = { x: -1, y: -1 };

// P-3 gem families/tiers still derive from the existing source/config.
// Display colours follow the user's 2026-10-19 walnut/brass UI direction;
// this view-only palette does not change original PNG bytes or combat values.
const LINE_COLORS = {
  amethyst: "#b57edc", aquamarine: "#5fd4d4", diamond: "#e8ecf1", emerald: "#53a64f",
  opal: "#f2b3c9", sapphire: "#3e93ba", ruby: "#d74e3c", topaz: "#d4ac43",
};
// U-3a(DISPATCH_SONNET_U3_PLAYABILITY §2 U-3a) — specialGem(archetype:specialGem, kind:static, 45종)
// 색분류. 정규 라인 타워(kind:tower)는 위 LINE_COLORS(AD-V1) 그대로 — 이 표는 그 *바깥*, "지어지는 젬이
// 전부 회색 다이아"(작가 피드백①) 원인이던 specialGem 전용이다. roleTable엔 attackType이 없어(라인/티어만
// 있음) defOf(DefStore, config overrides 병합 결과)에서 실제 attack.attackType을 읽는다(원장 실측
// 필드·GEMTOWER_BALANCE.attackTypes 7종 그대로 — 오케스트레이터 §1표의 "6색"은 hero 누락, 실측 7종이
// 정확함, 아래 RETURN §전제반증). RGB 값 자체는 원작에 attackType별 고정 색 규약이 없어(U-2d band 색과
// 동일 성격의 "적응" 선택) 서로 뚜렷이 구별되는 7색 + 미상 폴백(회색)을 배정한다 — LINE_COLORS 8색과
// 정확히 겹치는 hex는 피해 혼동을 줄인다(실측: 45종 전원 attackType 보유, 미상 0건 — 폴백은 방어적 유지).
const ATTACKTYPE_COLORS = {
  normal: "#c7cdd6", pierce: "#39d98a", siege: "#c97a3d", magic: "#3aa0ff",
  chaos: "#e6396c", hero: "#f4c744", spells: "#8a5cf5",
};
// U-6c(DISPATCH_SONNET_U6_INFOARCH §2 U-6c, U-5 흡수) — 타워/젬 이름은 더 이상 하드코딩 리터럴로 박지
// 않는다. gems_special.json ∪ towers_full.json(grid+beyondGrid)을 부팅 시 fetch해 런타임 병합한다
// (loadNameMap(), 아래 defOf 근처) — roleTable 기준 필요분(tower 32 + specialGem 45 + lowestGem 4 = 81종)
// 전수 커버(오케스트레이터 재현: 세 소스 union, 겹치는 id 0건 — 충돌 없음). 이전 SPECIALGEM_NAMES(28개
// 리터럴, gems_special.json 단일 소스만 반영해 17종 누락)는 이 병합으로 대체한다(발명 0 그대로 — 리터럴
// 복사 대신 원장 fetch로 옮겼을 뿐, 텍스트 자체는 always 원장 그대로).
// U-1c(DISPATCH_SONNET_U1_VIEWPORT §2 U-1c) — radiusFrac 값 자체(AD-V1 §2.1 확정 0.30/0.34/0.38/0.42/
// 0.46)는 변경하지 않는다(작가 승인 수치 — "발명" 리스크 회피). 대신 "크기 확대 + 2×2 풋프린트 정합"
// 두 요구를 동시에 만족시키려 *환산 기준*을 셀(cellPx) → 건설 풋프린트(footprintPx = cellPx×2, U-1a와
// 동일 그리드)로 바꾼다(render()의 footprintPx 사용처 참조) — AD-V1 비율은 그대로, 화면 반경만 2배
// 스케일로 커진다("작가 취향 조정은 config 값 교체로 언제든" 조항과 별개로, 기준 단위 변경은 U-1a 풋프린트
// 확정에 따른 자연 결과).
const TIER_SHAPE = [
  { vertices: 4, radiusFrac: 0.30, borderPx: 1 },
  { vertices: 5, radiusFrac: 0.34, borderPx: 1 },
  { vertices: 6, radiusFrac: 0.38, borderPx: 1.5 },
  { vertices: 7, radiusFrac: 0.42, borderPx: 2 },
  { vertices: 8, radiusFrac: 0.46, borderPx: 2.5 },
];
// roleTable tower.tier는 1..4 실측(0 없음) — 최하급(statics.lowestGem h000/h002/h003/h004)이 개념상
// 티어0에 대응(§2.1 "최하급 4종"). 미분류(예: 라운드시작 돌변환 h00G)는 §2.1 "돌 = 회색 육각 무테두리"
// 규칙을 그대로 따른다. 발명 금지 — roleTable 밖 라인/티어는 만들지 않고 회색 폴백만 사용한다.
function gemVisual(w, typeId) {
  const role = GEMTOWER_BALANCE.roleTable[typeId];
  if (role && role.kind === "tower") {
    const tier = clamp(role.tier, 1, 4);
    return { color: LINE_COLORS[role.line] || "#a89980", ...TIER_SHAPE[tier] };
  }
  if (typeId === "h00G") return { color: "#a89980", vertices: 6, radiusFrac: 0.30, borderPx: 0 }; // 돌 — §2.1
  if (role && role.kind === "static" && role.archetype === "lowestGem") return { color: "#a89980", ...TIER_SHAPE[0] };
  // U-3a: specialGem — attackType 기반 색(defOf 조회, 재발명 0). 모양(TIER_SHAPE[0])은 기존 미분류
  // 폴백 그대로 유지 — U-3a 스코프는 색 하나뿐(발명 최소, 새 형태 0).
  if (role && role.kind === "static" && role.archetype === "specialGem") {
    const d = defOf(w, typeId);
    const at = d && d.attack ? d.attack.attackType : null;
    return { color: (at && ATTACKTYPE_COLORS[at]) || "#a89980", ...TIER_SHAPE[0] };
  }
  return { color: "#a89980", ...TIER_SHAPE[0] }; // 미분류 폴백(발명 대신 회색 최하급 형태로 통일)
}

function W2SX(x) { return (x - cam.cx) * cam.zoom + cv.width / 2; }
function W2SY(y) { return -(y - cam.cy) * cam.zoom + cv.height / 2; }
function S2WX(px) { return (px - cv.width / 2) / cam.zoom + cam.cx; }
function S2WY(py) { return -(py - cv.height / 2) / cam.zoom + cam.cy; }

function resolveMobileBuildCells(profile,objects){return profile?createUnitIdentityProvider(profile.units,objects,profile.pathingTextures).resolve("h006").pathing?.width??4:4;}
function boot(bytes, presentation, stockProfile, seed) {
  const stockUnits=stockProfile?.units;
  const loaded = readScriptMap(new Uint8Array(bytes), "GemTower_Max_7C.w3x");
  const {archive, pathing: pm} = loaded;
  console.info("[map-loader]", ...loaded.notes);
  let gc = NEUTRAL_GC;
  try { gc = parseMiscConstants(archive.read("war3mapMisc.txt"), GEMTOWER_BALANCE.armorTypeColumnOrder,stockProfile?.gameplayConstants); } catch (error) { console.warn("Misc unavailable; legacy neutral constants", error); }
  const sourceDefs=stockUnits?createGemTowerSourceDefs(stockUnits,loaded.ir.objectMods):{defStore:new DefStore(),weaponGaps:[]};
  if(sourceDefs.weaponGaps.length)console.warn('[source unit gaps]',sourceDefs.weaponGaps.join(', '));
  const buildTexture=resolveMobileBuildCells(stockProfile,loaded.ir.objectMods);
  const mobile=pm?gemTowerMobileLayout(loaded.ir,pm,buildTexture):null;
  const {vm, sim, registry, defStore} = createSession(mobile?.ir??loaded.ir, {
    seed, navigationBounds:mobile?.boundsFor, defStore: sourceDefs.defStore, stockUnits,stockAbilities:stockProfile?.abilities, pathing:pm,pathingTextures:stockProfile?.pathingTextures, playerSlots: GEMTOWER_SOLO_SLOTS, gc, bountyMode: GEMTOWER_BALANCE.bountyMode,
    life: GEMTOWER_BALANCE.life, researchConfig: GEMTOWER_BALANCE.researches,
  });
  presentation=sourceGemPresentation(presentation,loaded.ir.objectMods,id=>defStore.getDef(id));
  installGemTowerOutcome(vm,sim);
  const initialVmEvents=vm.drainEvents();
  const bootEvents = sim.drainEvents();
  const missingTypes = [...new Set(bootEvents.filter(event => event.kind === "UnknownUnitDef").map(event => event.typeId))];
  if (missingTypes.length) console.warn("[compat] Missing unit definitions; legacy placeholders remain:", missingTypes.join(", "));

  // Classic still exposes an explicit timer-start compatibility input. Race uses its source path.
  // The timer candidate is the existing registry heuristic; no kick happens here during boot.
  // Outcome flags and actual life belong to the explicit GemTower adapter, not this renderer.
  let best = null, bestSubs = 0;
  for (const [tid, subs] of registry.timerSubs) if (subs.length > bestSubs) { bestSubs = subs.length; best = tid; }
  const roundTimer = best !== null ? vm.handles.get(best) : null;
  // S-A2d: Ne 다이얼로그(부트 중 native 훅이 이미 버튼 2개+be[] 배선을 끝냈다 — 여기선 좌표만 읽는다,
  // 재구현 0)를 web 클릭 표면에 노출하기 위한 좌표. 버튼이 정확히 2개가 아니면(예: 향후 다른 맵) null.
  const modeDialogHandle = vm.getGlobal("Ne");
  const modeDialogObj = modeDialogHandle.t === "handle" && modeDialogHandle.v !== null ? vm.handles.get(modeDialogHandle.v) : undefined;
  const modeButtons = modeDialogObj && modeDialogObj.kind === "dialog" ? modeDialogObj.data.buttons : undefined;
  const modeDialog = modeButtons && modeButtons.length === 2
    ? { dialogId: modeDialogObj.id, classicButtonId: modeButtons[0], raceButtonId: modeButtons[1], clicked: false }
    : null;
  const w = { syncDeviceView:()=>syncRotationGate(),uiPointerType:event=>virtualTouchActive()?"touch":event.pointerType,confirmSmallPlacement:(kind,rect)=>smallPlacementAtCurrentZoom(w,kind,rect),placementLoupe:null,mobileFields:mobile?.fields, seed, runId:createRunId(),runMode:null,vm, sim, registry, defStore, pm, roundTimer, modeDialog, defCache: new Map(), terrain: null, hover: null,
    // U-6c: 병합 이름 원장(fullName()이 조회). loadFromUrl()이 fetch해 넘긴다 — 실패 시 {} 폴백.
    waveCounts:sourceWaveCounts(loaded.ir.script.source,parseJass),recipeBook:extractRecipeBook(loaded.ir,{strings:loaded.strings}),casinoFeedback:createCasinoFeedback(),
    strings:loaded.strings,sourceVersion:stockProfile?.sourceVersion,inputLog:[],runtimeCrashes:initialVmEvents.filter(event=>event.kind==='ThreadCrashed'),
    nameMap: presentation.names || {}, knownGemIds:presentation.gemIds || new Set(),
    precisePlacement:$("precisePlacement").checked,pendingPlacement:null,overlapPick:null,viewPlayerId:0,cameraMode:"fit",routeSegments:new Map(), prepActive: true, cameraFocused: false, observedAttacks: 0,
    pendingBuilds: [],
    // P-3(젬 UI, PLAYABLE §4): 선택 상태 + castAbility 큐 대응 기록(빌드와 동일 정신 — 값·판정 0, 좌표
    // 상관용 부기일 뿐). selectedGemId=null이면 패널 숨김.
    selectedGemId: null, pendingCasts: [], pendingTargetAbility: null,
    // U-1c: 호버 중인 젬 id(선택과 독립 — 클릭 없이 마우스오버만으로 툴팁 노출). null이면 툴팁 숨김.
    hoverGemId: null,
    // U-4a(DISPATCH_SONNET_U4_FIXES §2 U-4a) — 웨이브 클리어 기반 순차 재점화 상태(stepN() 참조).
    // waveHasSpawned=이번 재점화 이후 크립이 실제로 존재했었는지, waveReadyForNext=크립이 0으로 돌아와
    // "다음 웨이브 재점화 가능" 신호가 섰는지. 둘 다 false로 시작 — boot()/startWaves()의 최초 킥은
    // 이 플래그와 무관하게 무조건 1회 수행되고(§P-5 계약 그대로), 그 다음부터만 이 게이트가 적용된다.
    waveHasSpawned: false, waveReadyForNext: false,
    // P-4: GameOver는 스크립트 소유 승리/패배 판정(src/jass/natives/victory.ts)이 sim.endGame()을 호출할
    // 때만 발생(재발명 0 — 엔진 seam 그대로 소비). null이면 진행 중, 값이 있으면 오버레이 표시+루프 정지.
    gameOver: null };
  // 카메라: 첫 웨이포인트(레인/펜) 근처를 크게 — 건설 가능한 스케일(셀 ~14px).
  const r0 = registry.rects[0];
  cam.cx = r0 ? (r0.minX + r0.maxX) / 2 : 0;
  cam.cy = r0 ? (r0.minY + r0.maxY) / 2 - 1200 : 0; // 펜 쪽으로 살짝
  cam.zoom = clamp(14 / (pm ? pm.cellSize : 32), 0.05, 2); // 셀 ≈ 14px
  $("mMap").textContent = "GemTower_Max_7C"; $("mTrig").textContent = registry.registeredTriggerCount;
  const hudTotalWaves = $("hudTotalWaves"); if (hudTotalWaves) hudTotalWaves.textContent = TOTAL_WAVES; // U-2b: index.html의 "50" 리터럴은 부팅 1회 여기서 실값으로 갱신(집계값, 발명 0)
  rectEntered = 0; deaths = 0; gatePassed = 0;
  w.recordInput=input=>recordInput(w,input);
  focusPlayer(w);
  w.soundRouter=createSoundEventRouter({playerId:0});w.soundQueue=[];w.soundCalls=[];w.soundWaveSeen=new Set();w.soundState=null;w.soundDeaths=new Map();
  w.deathUnsubscribe=sim.observeUnitDeaths?.(death=>{const bounds=w.mobileFields?.[0]?.bounds;if(restoring||loadingRun||runtimeFailed||document.hidden||!bounds||death.unit?.owner!==11||!pointInBattlefield(death.unit,bounds))return;w.soundDeaths.set(death.unitId,death);if(w.soundDeaths.size>128)w.soundDeaths.delete(w.soundDeaths.keys().next().value);});
  w.soundUnsubscribe=vm.observeSoundCalls?.(call=>{if(!restoring&&!loadingRun&&!runtimeFailed&&!document.hidden){w.soundCalls.push(call);if(w.soundCalls.length>64)w.soundCalls.shift();}});
  w.viewFeedback=actionFeedback;w.cueAudio=actionAudio;w.lifeHud=lifeHud;w.observePlayView=()=>{observeWaveWarnings(w);observeFirstEnemy(w);};
  w.fieldFeedback=createFieldFeedback({reducedMotion:()=>reducedMotion.matches});
  w.firstRunGuide=createFirstRunGuide({storage:()=>window.localStorage,off:sessionQuery.get('tutorial')==='off'});
  return w;
}
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

function invalidateSpriteViews(w,meta={}) {
 if(!w)return;for(const key of ['rosterSignature','trainingSignature','upgradeSignature'])delete w[key];
 if(meta.keys?.some(key=>key.startsWith('ground:')))w.terrain=null;
}

function defOf(w, typeId) {
  let d = w.defCache.get(typeId);
  if (d === undefined) { try { d = w.defStore.getDef(typeId); } catch { d = null; } w.defCache.set(typeId, d); }
  return d;
}

// U-6c(DISPATCH_SONNET_U6_INFOARCH §2 U-6c) — 이름 원장 병합(읽기 전용, docs/dissection/*.json 수정 0).
// 실패해도 게임이 죽지 않게 빈 맵으로 폴백 — fullName()이 자동으로 기존 gemLabel() 표기(line T{tier}/
// archetype/typeId)로 강등된다.
const NAME_SOURCES = ["../docs/dissection/gems_special.json", "../docs/dissection/towers_full.json"];
async function loadNameMap() {
  if(!localSourceMode)return extractGemPresentation();
  try {
    const [gs,tf]=await Promise.all(NAME_SOURCES.map(u=>fetch(u).then(r=>r.json())));
    return extractGemPresentation(gs,tf);
  }catch(error){console.warn("이름·보석 목록 로드 실패; 기본 정의 사용",error);return extractGemPresentation();}
}
// fullName: 병합 nameMap 우선(81/81 커버), 없으면 gemLabel()(기존 폴백, 무변경) — 기존 호출부 전부 이
// 함수로 승격해도 표시 형식이 절대 나빠지지 않는다(name이 없을 때만 옛 표기 그대로 유지).
function sourceText(w,text){return resolveWtsText(String(text??''),w.strings??new Map()).replace(/\|c[0-9a-fA-F]{8}|\|r/g,'').replace(/\|n/g,'\n');}
function recordInput(w,input){(w.inputLog??=[]).push({tick:w.sim.tickCount,...input});}
function runSnapshot(w){return {...(w.migratedFrom?{migratedFrom:{...w.migratedFrom}}:{}),...(w.trainingInterrupted?{trainingInterrupted:{...w.trainingInterrupted}}:{}),format:'uzmap-ui-input-v1',runId:w.runId,mode:w.runMode??null,build:contentBuild,...(replayBuild?{replayBuild}:{}),seed:w.seed??sessionSeed,sourceVersion:w.sourceVersion??null,sourceState:gemTowerPlayerState(w.vm),tick:w.sim.tickCount,stateHash:w.sim.stateHash(),runtimeCrashes:w.runtimeCrashes,actions:w.inputLog,camera:{...cam},selectedGemId:w.selectedGemId};}
// Save ordinary input only at settled browser boundaries. Never replace manual/legacy slots.
function checkpointRun(w,force=false,now=Date.now()) {
 const status=$("automaticSaveStatus");
 if(!w||restoring||loadingRun)return {kind:'skipped',reason:'ineligible'};
 const state=gemTowerPlayerState(w.vm),healthy=!runtimeFailed&&!w.replayMismatch&&!w.runtimeCrashes?.length;
 const eligible=healthy&&w.runMode==='race'&&w.modeDialog?.clicked&&w.modeDialog.pendingButtonId===undefined&&!w.trainingBatch&&state.difficulty>0&&w.sim.tickCount>=2;
 if(!eligible){const notice=!healthy?'자동 저장 중지 · 이전 기록은 보존됩니다':w.runMode==='classic'?'클래식은 이어하기를 지원하지 않습니다':w.trainingBatch?'묶음 구입을 마치면 자동 저장합니다':'게임을 시작하면 자동 저장합니다';if(status&&status.textContent!==notice)status.textContent=notice;return {kind:'skipped',reason:'ineligible'};}
 w.runCheckpoint??=createRunCheckpoint((trace,at)=>saveRunRecord(localStorage,trace,at,{automatic:true}));
 const result=w.runCheckpoint.attempt({now,eligible,force,revision:w.sim.tickCount+':'+(w.inputLog?.length??0),snapshot:()=>runSnapshot(w)});
 if(result.kind==='saved'){
  w.checkpointFailed=false;w.checkpointNotice='자동 저장됨 · '+new Date(result.savedAt).toLocaleTimeString('ko-KR');
  if(!$("gameDrawer").hidden)refreshSavedRuns();
 }else if(result.kind==='failed'){
  w.checkpointNotice='자동 저장 실패 · 저장 공간이나 브라우저 설정을 확인하세요';
  if(!w.checkpointFailed)flash(w.checkpointNotice);w.checkpointFailed=true;
 }
 if(status&&w.checkpointNotice&&status.textContent!==w.checkpointNotice)status.textContent=w.checkpointNotice;
 return result;
}
// Replay text is a paused, visible inspection view; explicit save reuses its validated trace.
function refreshReplayOutput(w,trace) {
 const explicit=trace!==undefined;
 if(!explicit&&(playing||restoring||$("gameDrawer").hidden||!$("replayDetails").open||!$("replayDetails").getClientRects().length))return;
 const key=[w.sim.tickCount,w.inputLog?.length??0,w.selectedGemId,cam.cx,cam.cy,cam.zoom].join(':');
 if(!explicit&&w.replayOutputKey===key)return;
 $("replayInput").value=JSON.stringify(trace??runSnapshot(w),null,2);
 w.replayOutputKey=key;
}
// Keep native control state and normal input regions consistent throughout strict restoration.
function renderControls(w) {
 const ended=Boolean(w?.gameOver),awaitingMode=Boolean(w?.modeDialog&&!w.modeDialog.clicked),pendingMode=w?.modeDialog?.pendingButtonId!==undefined,play=$("play");
 const runLabel=runtimeFailed?'오류로 정지':restoring?'복원 중':ended?'게임 종료':awaitingMode?'방식 선택':playing?'진행 중':'일시정지';
 if($("runState").textContent!==runLabel)$("runState").textContent=runLabel;
 $("runState").dataset.state=runtimeFailed?'error':restoring?'restoring':ended?'ended':awaitingMode?'mode':playing?'playing':'paused';
 $("restoreOverlay").hidden=!restoring;$("cancelRestore").disabled=!restoring||restoreCancelled;
 for(const id of ["play","stepBtn","speed","chatInput","chatSend"])$(id).disabled=restoring||ended||runtimeFailed;
 if(awaitingMode)for(const id of ["play","stepBtn"])$(id).disabled=true;
 const cycle=$("speedCycle");if(cycle){cycle.disabled=$("speed").disabled||awaitingMode||Boolean(w?.startupChoice);cycle.textContent='배속 '+($("speed").value||1)+'×';}
 if(w?.replayMismatch)play.disabled=true;
 for(const id of ["reset","resumeRun","importRun"])$(id).disabled=restoring;
 $("saveRun").disabled=restoring||Boolean(w?.trainingBatch)||pendingMode;
 $("saveRun").title=pendingMode?'재개해서 게임 방식 선택을 처리한 뒤 저장하세요':'';
 $("resumeRun").disabled=restoring||!$("savedRuns").selectedOptions[0]?.record?.compatible;
 const upgrade=$("upgradeRun");if(upgrade)upgrade.disabled=restoring||!$("savedRuns").selectedOptions[0]?.record?.upgradeable;
 const label=runtimeFailed?'오류로 정지':restoring?'복원 중…':ended?'게임 종료':w?.replayMismatch?'복원 실패':awaitingMode?'방식 선택':playing?'일시정지':'재개';
 if(play.textContent!==label)play.textContent=label;
 const drawerStatus=$("drawerRunStatus"),drawerLabel=play.disabled?label:playing?"진행 중 · 상단 일시정지로 멈출 수 있어요":"일시정지 · 상단 재개로 계속할 수 있어요";
 if(drawerStatus&&drawerStatus.textContent!==drawerLabel)drawerStatus.textContent=drawerLabel;
 // The existing progress message and its ancestors stay outside the inert regions.
 for(const area of document.querySelectorAll('.header-actions,footer,#gameDrawer,#drawerScrim,#bottomPanel,#battlefield > :not(#msg):not(#restoreOverlay)'))if(area.inert!==restoring)area.inert=restoring;
}
function refreshSavedRuns(selectedKey){
 const list=$("savedRuns"),selected=selectedKey??list.value;list.replaceChildren();
 try{
  const records=listRunRecords(localStorage,contentBuild,replayBuild);
  for(const record of records){
   const option=document.createElement('option');option.value=record.key;option.record=record;
   const date=record.trace?.savedAt?new Date(record.trace.savedAt).toLocaleString('ko-KR'):'이전 기록';
   const round=record.trace?.sourceState?.round;
   option.textContent=`${record.trace?.migratedFrom?'검사한 복사본 · ':''}${record.legacy?'보호된 예전 저장 · ':record.automatic?'자동 저장 · ':'수동 저장 · '}${date}${round!=null?` · ${round}웨이브`:''} · ${record.compatible?'이어하기 가능':record.upgradeable?'검사하고 이어하기':record.error?'형식 확인 필요':record.reason==='classic'?'클래식 · 이어하기 미지원':'다른 버전'}`;
   list.append(option);
  }
  if(records.some(r=>r.key===selected))list.value=selected;
  $("saveStatus").textContent=records.length?`저장 ${records.length}개 · 새 게임마다 별도 보관합니다`:'저장한 게임이 없습니다';
 }catch(error){$("saveStatus").textContent=`브라우저 저장소를 읽지 못했습니다: ${error.message}`;}
 showSavedRun();
}
function showSavedRun(){
 const record=$("savedRuns").selectedOptions[0]?.record;
 $("savedRunRaw").value=record?.raw??'';
 $("resumeRun").disabled=restoring||!record?.compatible;
 const upgrade=$("upgradeRun");if(upgrade){upgrade.hidden=!record?.upgradeable;upgrade.disabled=restoring||!record?.upgradeable;}
 $("exportRun").disabled=!record;
 $("savedRunHelp").textContent=!record?'진행 저장을 누르면 현재 게임을 보관합니다.':record.error?'기록은 보존되어 있습니다. 원본을 내보내 확인하세요.':record.reason==='classic'?'클래식 수동 시작 기록은 이어하기를 지원하지 않습니다. 원본 내보내기는 가능합니다.':!record.compatible?record.upgradeable?'예전 기록을 지금 버전에서 검사합니다. 진행 결과가 같으면 별도 저장을 만들어 이어가며 원본은 남습니다.':'원본을 내보낼 수 있습니다. 이 기록은 현재 검사할 수 없습니다.':record.trace?.migratedFrom?'예전 기록을 확인해 만든 새 저장입니다. 원래 기록은 별도로 남아 있습니다.':record.legacy?'예전 저장 원본은 보호됩니다. 이어한 뒤 저장해도 새 저장 칸을 사용합니다.':'선택한 기록으로 이어하면 현재 화면 대신 저장 당시 진행을 복원합니다.';
}
$("savedRuns").onchange=showSavedRun;
$("exportRun").onclick=()=>{
 const record=$("savedRuns").selectedOptions[0]?.record;if(!record)return;
 const url=URL.createObjectURL(new Blob([record.raw],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download=`보석타워-${record.legacy?'이전기록':record.trace?.runId??'기록'}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
function captureRunView(){
 return {world,runtimeFailed,failureMessage:runtimeFailed?{nodes:[...$("msg").childNodes],display:$("msg").style.display}:null,cam:{...cam},mode:$("gameApp").dataset.mode,prevHp,prevGold,textTags,goldTags,lastPos,attackFx,waveNum,prevCreeps,waveFlashUntil,rectEntered,deaths,gatePassed};
}
function restoreRunView(before){
 world=before.world;Object.assign(cam,before.cam);
 ({runtimeFailed,prevHp,prevGold,textTags,goldTags,lastPos,attackFx,waveNum,prevCreeps,waveFlashUntil,rectEntered,deaths,gatePassed}=before);
 if(before.mode===undefined)delete $("gameApp").dataset.mode;else $("gameApp").dataset.mode=before.mode;
 if(world){for(const key of ['rosterSignature','upgradeSignature','nativeDialogKey','trainingSignature','trainingButtons','buildCellsView','buildCellsCheck','replayOutputKey'])delete world[key];renderChatHelp(world);if(!runtimeFailed)render(world,true);}
 if(before.failureMessage){$("msg").replaceChildren(...before.failureMessage.nodes);$("msg").style.display=before.failureMessage.display;}
}
function cancelRestore(){
 if(!restoring)return;restoreCancelled=true;$("cancelRestore").disabled=true;$("restoreProgressText").textContent='복원 취소 중… 기존 진행으로 돌아갑니다';
}
async function restoreRun(raw,{verifyUpgrade=false}={}){
 if(restoring||loadingRun)return;
 let trace,upgrading=false;try{trace=validateInputReplay(raw);if(!isRunCompatible(trace,contentBuild,replayBuild)){if(!verifyUpgrade)throw Error('저장 기록의 게임 버전이 다릅니다. 기록을 보관하고 같은 버전에서 이어하세요');if(!canVerifyRunUpgrade(trace,contentBuild,replayBuild))throw Error('원작 자료가 확인된 레이스 기록만 새 버전에서 검사할 수 있습니다');upgrading=true;}}catch(error){flash(error.message);return;}
 if(upgrading&&(world?.trainingBatch||world?.modeDialog?.pendingButtonId!==undefined)){flash('현재 구입 예약이나 게임 방식 선택을 마친 뒤 예전 저장을 검사하세요');return;}
 const checkpoint=checkpointRun(world,true);if(checkpoint?.kind==='failed'){flash('현재 진행을 보관하지 못해 이어하기를 중단했습니다 · 현재 게임은 계속할 수 있습니다');return;}
 const before=captureRunView(),savedSelection=$("savedRuns")?.value;let savedCopy,completed=false;
 const rollbackCopy=()=>{if(!savedCopy)return '';try{return savedCopy.rollback()?'':' · 새 복사본이 변경되어 그대로 남겨 두었습니다';}catch{return ' · 새 복사본 정리를 완료하지 못했습니다';}};
 restoring=true;world?.viewFeedback?.clear();world?.fieldFeedback?.clear();world?.cueAudio?.stop();void soundRecording?.stop();restoreCancelled=false;playing=false;renderControls(world);$("restoreProgressText").textContent=upgrading?'예전 저장을 검사할 준비를 하고 있습니다':'저장한 게임을 준비하고 있습니다';$("cancelRestore").focus();
 try{
  const opened=await loadFromUrl(trace.seed,{publishSeed:false});playing=false;if(opened!==true||runtimeFailed)throw Error('게임을 새로 열지 못했습니다');if(restoreCancelled)throw Error('복원을 취소했습니다');if(!world||world===before.world)throw Error('게임을 새로 열지 못했습니다');
  world.restoredView=true;
  if((world.sourceVersion??null)!==(trace.sourceVersion??null))throw Error('원작 자료 버전이 달라 이어할 수 없습니다');
  let cursor=0;while(world.sim.tickCount<trace.tick||cursor<trace.actions.length){
   if(restoreCancelled)throw Error('복원을 취소했습니다');
   const started=performance.now();cursor=replayInputBatch(world,trace,cursor,n=>stepN(world,n),200,()=>performance.now()-started>=12);
   // Hidden replay effects have no presentation lifetime; retain at most one batch.
   textTags.length=0;goldTags.length=0;attackFx.length=0;
   const percent=Math.floor(world.sim.tickCount/Math.max(1,trace.tick)*100);$("restoreProgressText").textContent=`${upgrading?'예전 저장을 검사하는 중':'저장한 게임을 이어오는 중'}… ${percent}% · ${world.sim.tickCount.toLocaleString()} / ${trace.tick.toLocaleString()}`;
   await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(restoreCancelled)throw Error('복원을 취소했습니다');
  if(world.sim.stateHash()!==trace.stateHash||trace.sourceState&&JSON.stringify(gemTowerPlayerState(world.vm))!==JSON.stringify(trace.sourceState)||world.runtimeCrashes.length)throw Error('저장 당시와 결과가 일치하지 않아 이어하기를 중단했습니다');
  world.lifeHud?.clear();
  world.runId=restoredRunId(trace);world.runMode=trace.actions.some(a=>a.kind==='dialog'&&a.dialogId===world.modeDialog?.dialogId&&a.buttonId===world.modeDialog?.raceButtonId)?'race':null;world.inputLog=trace.actions.map(a=>({...a}));if(trace.migratedFrom)world.migratedFrom={...trace.migratedFrom};if(trace.trainingInterrupted){world.trainingInterrupted={...trace.trainingInterrupted};world.trainingBatchNotice=trainingInterruptionText(world.trainingInterrupted);}world.selectedGemId=world.sim.getUnit(trace.selectedGemId)?.alive?trace.selectedGemId:null;
  // Restore only the presentation lock; final-tick orders are already in the exact replayed source queue.
  {const pending=world.inputLog.filter(a=>a.tick===world.sim.tickCount&&a.kind==='research'&&a.playerId===0&&a.accepted).at(-1);world.pendingResearch=pending?{techId:pending.techId}:null;}
  // End research presentation restore
  if(upgrading){savedCopy=saveVerifiedRunCopy(localStorage,trace,runSnapshot(world));world.runId=savedCopy.trace.runId;world.migratedFrom={...savedCopy.trace.migratedFrom};}
  frameClock.reset();$("msg").style.display='none';render(world,true);if(savedCopy)refreshSavedRuns(savedCopy.key);flash(upgrading?'예전 진행을 확인해 새 저장을 만들었습니다 · 재개를 누르세요':'저장한 진행을 정확히 복원했습니다 · 재개를 누르세요');setDrawer(false);if(!upgrading)commitSessionSeed(trace.seed);completed=true;
 }catch(error){const cleanup=rollbackCopy();restoreRunView(before);if(savedCopy)refreshSavedRuns(savedSelection);if(!runtimeFailed)$("msg").style.display='none';flash(`${error.message}${cleanup} · 기존 진행을 유지했습니다`);}
 finally{
  restoring=false;playing=false;frameClock.reset();
  try{renderControls(world);$("researchToggle").focus();if(upgrading&&completed)commitSessionSeed(trace.seed);}
  catch(error){if(!savedCopy||!completed)throw error;completed=false;const cleanup=rollbackCopy();restoreRunView(before);refreshSavedRuns(savedSelection);renderControls(world);flash(`${error.message}${cleanup} · 기존 진행을 유지했습니다`);}
  if(completed)savedCopy?.commit();
 }
}
$("cancelRestore").onclick=cancelRestore;
$("saveRun").onclick=()=>{if(!world||restoring)return;if(world.modeDialog?.pendingButtonId!==undefined){flash('재개해서 게임 방식 선택을 처리한 뒤 저장하세요');return;}if(world.trainingBatch){flash('묶음 구입을 마친 뒤 저장하세요');return;}try{const trace=validateInputReplay(runSnapshot(world));const saved=saveRunRecord(localStorage,trace);refreshReplayOutput(world,saved.trace);refreshSavedRuns(saved.key);flash('현재 진행을 이 브라우저에 저장했습니다');}catch(error){flash(error.message);}};
$("resumeRun").onclick=()=>{const record=$("savedRuns").selectedOptions[0]?.record;if(!record?.compatible){flash('이어할 수 있는 저장을 선택하세요');return;}void restoreRun(record.raw);};
$("upgradeRun").onclick=()=>{const record=$("savedRuns").selectedOptions[0]?.record;if(record?.upgradeable)void restoreRun(record.raw,{verifyUpgrade:true});};
$("importRun").onclick=()=>void restoreRun($("restoreInput").value,{verifyUpgrade:true});

function trainingTechName(w,id,level=1){
 const object=w.sim.mapIr?.objectMods?.find(object=>object.kind==='upgrade'&&(object.newId??object.baseId)===id);
 const names=(object?.mods??[]).filter(mod=>mod.field==='gnam'&&(mod.level??0)<=level).sort((a,b)=>(a.level??0)-(b.level??0)),raw=names.at(-1)?.value;
 const name=typeof raw==='string'?sourceText(w,raw):fullName(w,id);
 return name&&name!==id&&!/^TRIGSTR_\d+$/.test(name)?name:'필요 연구';
}

function fullName(w, typeId) {
  const name = defOf(w, typeId)?.name || w.nameMap?.[typeId];
  return name ? sourceText(w,name) : gemLabel(typeId);
}

function buildTerrain(w) {
  if (!w.pm || w.terrain) return;
  const { width, height, cells } = w.pm;
  const off = document.createElement("canvas"); off.width = width; off.height = height;
  const octx = off.getContext("2d");
  const img = octx.createImageData(width, height);
  const d = img.data;
  for(let row=0;row<height;row++)for(let col=0;col<width;col++){
    const colour=terrainPixel(cells[row*width+col],col,row),i=((height-1-row)*width+col)*4;
    d[i]=colour[0];d[i+1]=colour[1];d[i+2]=colour[2];d[i+3]=255;
  }
  octx.putImageData(img, 0, 0);
  w.terrain = off;
}

function renderRouteCues(w){
 const player=w.viewPlayerId??0,bounds=w.viewBounds,spawn=sourceIndexedRect(w,'x',player+1),entry=sourceIndexedRect(w,'o',player+1),marker=$('spawnMarker'),exit=$('exitMarker');
 const gateSpec=GEMTOWER_BALANCE.life.leakGateRects.find(g=>g.playerId===player),gate=gateSpec?sourceRect(w,gateSpec.id):null;
 const next=sourceRect(w,player===0?'Ax':'Fx'),last=w.fieldRects?.[player]?.at(-1);
 marker.hidden=!bounds||!spawn||!entry;exit.hidden=!bounds||!gate||!next||!last;
 if(!bounds)return;
 const rect=cv.getBoundingClientRect(),sx=rect.width/cv.width,sy=rect.height/cv.height;
 const project=r=>({x:W2SX((r.minX+r.maxX)/2)*sx,y:W2SY((r.minY+r.maxY)/2)*sy});
 const box={left:Math.max(0,W2SX(bounds.minX)*sx),top:Math.max(0,W2SY(bounds.maxY)*sy),width:Math.min(rect.width,W2SX(bounds.maxX)*sx)-Math.max(0,W2SX(bounds.minX)*sx),height:Math.min(rect.height,W2SY(bounds.minY)*sy)-Math.max(0,W2SY(bounds.maxY)*sy)};
 const place=(element,point,rotate)=>{
  element.style.left=point.x+'px';element.style.top=point.y+'px';element.style.transform=`translate(-50%,-50%) rotate(${rotate?point.angle:0}deg)`;
  element.dataset.side=point.side;for(const key of ['left','top','width','height'])element.dataset['board'+key[0].toUpperCase()+key.slice(1)]=String(box[key]);
 };
 if(!marker.hidden)place(marker,ingressMarker(project(spawn),project(entry),box),true);
 if(!exit.hidden){place(exit,ingressMarker(project(last),project(next),box,true),false);exit.dataset.gate=gateSpec.id;}
}


function renderBuildPreview(w){
 const target=$('buildPreviewStatus'),state=gemTowerPlayerState(w.vm),field=w.mobileFields?.[w.viewPlayerId??0];
 const ready=Boolean(field&&w.pm&&w.hover&&(w.hoverGemId===null||w.hoverGemId===undefined)&&(w.viewPlayerId??0)===0&&w.modeDialog?.clicked&&state.difficulty&&!state.chosen&&!w.gameOver&&!restoring&&!w.pendingTargetAbility&&!w.pendingPointAbility&&remainingBuildSlots(state,w.pendingBuilds)>0);
 if(target){target.hidden=!ready;target.parentElement.dataset.preview=String(ready);}
 if(restoring||!field||!w.pm||!w.modeDialog?.clicked||!state.difficulty){w.buildPreviewResult=null;return;}
 const point=ready?{x:w.hover.cx,y:w.hover.cy}:null,last=field.waypoints.at(-1),exit={x:field.bounds.maxX-w.pm.cellSize/2,y:(last.minY+last.maxY)/2};
 w.previewSearch??=createBuildPreview({grid:w.pm,defs:w.defStore});
 const input={entities:w.sim.entities.values(),bounds:field.bounds,start:field.spawn,waypoints:[...field.waypoints.map(r=>({x:(r.minX+r.maxX)/2,y:(r.minY+r.maxY)/2})),exit],waypointBounds:[...field.waypoints,null],pending:w.pendingBuilds.map(p=>({typeId:'h006',...p})),candidate:point?{typeId:'h006',...point}:null};
 const preview=w.previewSearch.evaluate(input),project=p=>({x:W2SX(p.x),y:W2SY(p.y)});
 let current=preview;
 if(ready){w.baseRouteSearch??=createBuildPreview({grid:w.pm,defs:w.defStore});current=w.baseRouteSearch.evaluate({...input,entities:w.sim.entities.values(),candidate:null});}
 const roadPainted=drawGroundRoute(ctx,{preview:current,project,cellSize:w.pm.cellSize,widthPixels:Math.max(30,Math.min(56,w.pm.cellSize*buildGridCells(w)*cam.zoom*1.15)),sprites});
 drawFieldLandmarks(ctx,{field,project,span:w.pm.cellSize*buildGridCells(w),sprites});
 w.buildPreviewResult=ready?preview:null;w.groundRoute=preview;
 if(!ready){if(!roadPainted)drawBuildRoute(ctx,preview,p=>({x:W2SX(p.x),y:W2SY(p.y)}),{alpha:.3,dashed:false});return;}
 if(target){target.dataset.state=preview.status;target.textContent=preview.status==='open'?'배치 후 지상 예상 길':preview.status==='blocked'?'지상 길 막힘 · 건설은 가능':'건설 불가 · 지형/건물 겹침';}
 drawBuildRoute(ctx,preview,p=>({x:W2SX(p.x),y:W2SY(p.y)}));
 const ok=canPlaceBlock(w,w.hover.blockCol,w.hover.blockRow,buildGridCells(w)),size=w.pm.cellSize*buildGridCells(w)*cam.zoom;
 ctx.save();ctx.fillStyle=ok?(preview.status==='blocked'?'#e0ab6b50':'#d8d99d40'):'#dc8e8155';ctx.fillRect(W2SX(point.x)-size/2,W2SY(point.y)-size/2,size,size);
 ctx.strokeStyle=ok?'#dacb98':'#e09b8b';ctx.lineWidth=1;ctx.strokeRect(W2SX(point.x)-size/2+1,W2SY(point.y)-size/2+1,Math.max(1,size-2),Math.max(1,size-2));
 if(ok){ctx.globalAlpha=.5;drawFieldPlacement(ctx,{sprites,x:W2SX(point.x),y:W2SY(point.y),size:gemSpriteSize(size)});}ctx.restore();
}

function renderCreeps(w,footprintPx,z) {
  let creeps=0;w.exitThreatViews=[];
  const exitRect=sourceRect(w,(w.viewPlayerId??0)===0?'Ax':'Fx'),exit=exitRect?{x:(exitRect.minX+exitRect.maxX)/2,y:(exitRect.minY+exitRect.maxY)/2}:null;
  const slowSources=[...w.sim.entities.values()].filter(entity=>entity.alive).flatMap(entity=>(w.sim.abilityEffects?.effects(entity.abilities)??[]).filter(effect=>effect.kind==='enemySlowAura').map(effect=>({entity,effect})));
  const allied=(a,b)=>w.sim.playerState.getAlliance(a,b,ALLIANCE_TYPES.ALLIANCE_PASSIVE);
  const creepR = clamp((w.pm ? w.pm.cellSize : 32) * z * 0.3, 2.5, 12);
  for (const e of w.sim.entities.values()) {
    // U-4b: attack def 보유 여부로 걸러내지 않는다 — owner=11이면 무조건 크립(위 타워 루프가 owner=11을
    // 이미 배제했으므로 attack 유무와 무관하게 여기서 전원 잡힌다, 실측: 표본 전량 attack def 보유라
    // 옛 필터는 크립을 전부 스킵시켜 위 타워 루프의 회색 폴백으로 새게 했었다).
    if (!e.alive || e.owner !== 11) continue;
    creeps++; // Source population stays unchanged, including approach/return corridors.
    if(!pointInBattlefield(e,w.viewBounds))continue;
    const px = W2SX(e.x), py = W2SY(e.y);
    // U-2d(DISPATCH_SONNET_U2_GAMESHELL §2 U-2d, vault slime-commotion-hud-juice-teardown "색 위협즉독") —
    // 기존 구현은 typeId.charCodeAt(2)%5 아케이드 무지개 배색이라 실제 위협 등급과 무관했다(발명 —
    // roleTable 밖 데이터). GEMTOWER_BALANCE.roleTable[typeId].band(ground/flying/boss/hell, 엔진 데이터)로
    // 교체 — 색만으로 등급 즉독. 전제 반증: 원작 teardown은 "낮은위협=초록"이지만 여기선 지형 U-2a가 이미
    // 밝은 잔디 그린이라 초록 크립은 배경에 묻힌다 — 저위협(ground)에 배경과 대비되는 amber를 쓰고,
    // boss/hell을 teardown의 "검정=최고위협" 취지를 확장해 배정한다(문자 그대로 복사가 아니라 지형 색과의
    // 대비를 우선한 적응, §3 규율 8 전제 반증).
    const role = GEMTOWER_BALANCE.roleTable[e.typeId];
    const visual=creepVisualPresentation(role,defOf(w,e.typeId)),band=visual.band;
    const col = band === "flying" ? "#4fc3f7" : band === "boss" ? "#1a1a1a" : band === "hell" ? "#c026d3" : band === "ground" ? "#ff9f43" : "#a89980";
    ctx.fillStyle = col; ctx.strokeStyle = band === "boss" ? "#ff3b3b" : "#170f0b"; ctx.lineWidth = band === "boss" ? 2 : 1;
    const spriteSize=clamp(footprintPx*(band==="boss"?1.7:1.15),band==="boss"?44:30,band==="boss"?84:56);
    const hover=visual.airborne&&!reducedMotion.matches?Math.sin(w.sim.tickCount*.2)*3:0;
    if(!drawMineCreep(ctx,{sprites,typeId:e.typeId,band,airborne:visual.airborne,x:px,y:py-hover,groundY:py,size:spriteSize,tick:w.sim.tickCount,flip:e.orderX<e.x,reducedMotion:reducedMotion.matches})){
      ctx.beginPath(); ctx.arc(px, py, creepR, 0, 7); ctx.fill(); ctx.stroke();
    }
    // U-2d: 세그먼트 HP바(teardown "개체별 플로팅 HP바" — 연속 채움바가 아니라 이산 세그먼트로 교체,
    // 호드 가독성). 임계값 색상(>.5/>.25 초록·주황·빨강)은 기존 로직 그대로 재사용(재발명 0). 만피 시
    // 미표시는 기존 조건 유지(P-3/기존 "화면 소음 감소" 관례 — 항상 표시로 바꾸지 않음, 전제 반증 참조).
    drawAirborneMark(ctx,{x:px,y:py,size:spriteSize,airborne:visual.airborne});
    drawCreepHealth(ctx,{x:px,y:py-hover,size:spriteSize,hp:e.hp,maxHp:e.hpMax,boss:band==='boss'});
    drawCreepStatus(ctx,{sprites,kinds:creepStatusIcons(w.sim.status.get(e.id),hasEnemySlowAura(e,defOf(w,e.typeId),slowSources,allied)),x:px,y:py-hover,size:spriteSize,boss:band==='boss'});
    if(isExitThreat(e,{bounds:w.viewBounds,exit}))w.exitThreatViews.push({x:px,y:py-hover,size:spriteSize});
  }
  return creeps;
}

function precisionViewActive(w){
 if(!w?.precisePlacement||!w.pm||(w.viewPlayerId??0)!==0||!w.modeDialog?.clicked||w.gameOver||w.pendingTargetAbility||w.pendingPointAbility||restoring||loadingRun||runtimeFailed)return false;
 const state=gemTowerPlayerState(w.vm);return Boolean(state.difficulty&&!state.chosen);
}
function resetPrecisionView(w){
 if(!w)return;w.precisionCamera?.reset();drag.on=false;drag.cell=null;w.cameraMode='fit';fitPlayerField(w);
}
function syncPrecisionView(w){
 fitPlayerField(w);w.precisionCamera??=createPrecisionCamera();
 const active=precisionViewActive(w),before=w.precisionCamera.snapshot();
 const view=w.precisionCamera.sync({enabled:active,fit:{...cam},bounds:w.viewBounds,width:cv.width,height:cv.height});
 Object.assign(cam,view.camera);w.cameraMode=view.zoomed?'precision':'fit';
 if(!active&&before.pointerCount){drag.on=false;drag.cell=null;}
 const overview=$('precisionOverview');if(overview){overview.hidden=!view.zoomed;overview.title=`${view.scale.toFixed(1)}배 확대 · 전체 화면으로 돌아가기`;}
 $('gameApp').dataset.precisionScale=view.scale.toFixed(2);
}
function precisionPointer(w,kind,event){
 const camera=w?.precisionCamera;if(!camera||!precisionViewActive(w)&&!camera.snapshot().pointerCount)return false;
 const r=cv.getBoundingClientRect(),input={id:event.pointerId,point:{x:(event.clientX-r.left)*cv.width/r.width,y:(event.clientY-r.top)*cv.height/r.height}};
 const result=kind==='down'?camera.down(input):kind==='move'?camera.move(input):camera.up({...input,cancelled:kind==='cancel'});
 if(result.consumed){drag.on=false;drag.cell=null;if(event.cancelable!==false)event.preventDefault?.();}
 if(result.changed)render(w);return result.consumed;
}
/** Reuses the original rejection and prices. This adapter never enables a command. */
function buttonBlockReason(w,button){
 if(!button.disabled)return '';
 const id=button.id??'',state=w?gemTowerPlayerState(w.vm):{},command=id==='quickResearch'||/^(cast|rs)/.test(id)||Boolean(button.dataset?.upgradeTarget)||id==='chatSend';
 if(restoring)return '저장한 판을 복원하고 있어요';
 if(command&&(w?.viewPlayerId??0)!==0)return '내 전장으로 돌아오세요';
 if(w?.gameOver)return unavailableReason('game-over');
 if(runtimeFailed)return '오류로 멈췄어요 · 메뉴에서 진행을 저장하세요';
 if(id==='showFirstRunGuide'&&!w)return '맵을 먼저 열어 주세요';
 if(['play','speedCycle','menuPlay','stepBtn','reset'].includes(id)&&$('sourceFiles')?.hidden===false)return '맵과 능력 자료를 먼저 열어 주세요';
 const research=id==='quickResearch'?button.dataset.techId:id.match(/^rs(R000|R001|R002)Btn$/)?.[1];
 if(research&&w){
  const spec=GEMTOWER_BALANCE.researches?.[research],level=w.sim.getResearchLevel(0,research);
  if(!spec)return unavailableReason('missing-data');
  if(w.pendingResearch)return '연구를 처리하고 있어요';
  if(level>=spec.maxLevel)return unavailableReason('max-level');
  if(spec.requires&&w.sim.getResearchLevel(0,spec.requires.techId)<spec.requires.count)return trainingTechName(w,spec.requires.techId,spec.requires.count)+' '+spec.requires.count+'레벨이 필요해요';
  return unavailableReason('insufficient-gold',{cost:researchCostForLevel(spec,level+1),gold:w.sim.ledger.gold(0)});
 }
 if(button.dataset?.upgradeTarget&&w){const unit=w.sim.getUnit(w.selectedGemId),reason=w.sim.validateUnitUpgrade(0,w.selectedGemId,button.dataset.upgradeTarget);return reason==='not-owner'&&unit?.owner===9?'보석을 남긴 뒤 전투 중에 강화할 수 있어요':unavailableReason(reason,{cost:w.sim.unitUpgradeCost(w.selectedGemId,button.dataset.upgradeTarget),gold:w.sim.ledger.gold(unit?.owner??0)});}
 if(id==='castA009'&&(state.buildCount??0)<5)return unavailableReason('builds-incomplete',{remainingBuilds:5-(state.buildCount??0)});
 if(id.startsWith('cast')){
  const action=w?.gemActionViews?.find(action=>action.abilityId===id.slice(4))??w?.targetActionViews?.find(action=>action.abilityId===id.slice(4));
  if(action?.reason==='prereq-unmet'&&['castA007','castA00R','castA03M'].includes(id))return '조합에 필요한 보석이 부족해요';
  if(action?.reason)return unavailableReason(action.reason);
 }
 if(['play','speedCycle','menuPlay','stepBtn'].includes(id))return w?.replayMismatch?'저장 기록이 맞지 않아 멈췄어요':w?.startupChoice?'선택한 난이도를 적용하고 있어요':'게임 방식을 고른 뒤 시작하세요';
 if(id==='skip')return '보석을 남긴 뒤 웨이브를 시작할 수 있어요';
 if(id==='saveRun')return w?.trainingBatch?'예약한 구입을 마친 뒤 저장할 수 있어요':'게임 방식 선택을 마친 뒤 저장할 수 있어요';
 if(['resumeRun','upgradeRun','exportRun'].includes(id))return '이어할 수 있는 저장한 판을 먼저 고르세요';
 if(id==='importRun')return '복원이 끝난 뒤 기록을 불러올 수 있어요';
 if(id==='startGame')return '난이도 정보를 확인하지 못했어요';
 if(id==='openSourceFiles')return '맵 파일과 능력 자료를 모두 선택해 주세요';
 if(button.dataset?.dialogButton)return '선택을 적용하고 있어요';
 if(button.classList?.contains('round-slot'))return '보석을 놓은 뒤 선택할 수 있어요';
 return button.querySelector?.('.training-reason,.upgrade-condition')?.textContent?.trim()||button.title||'지금은 사용할 수 없어요';
}
function syncDisabledReasons(w){
 // Read all visibility first, then write; do not alternate DOM reads and layout writes.
 const buttons=[...document.querySelectorAll('button:not(.build-cell)')].map(button=>({button,visible:!button.hidden&&!button.closest('[hidden]')&&button.getClientRects().length>0}));
 let empty=false;const header=$('runState'),headerReason=buttonBlockReason(w,$('play'))||buttonBlockReason(w,$('speedCycle'));
 for(const {button,visible} of buttons){
  if(!visible||!button.disabled){buttonReasons.clear(button);delete button.dataset.reasonInText;continue;}
  const text=buttonBlockReason(w,button),slot=button.classList.contains('round-slot'),top=['play','speedCycle'].includes(button.id);
  const existing=slot?roundSlotsHelp:top?header:button.querySelector('.training-reason,.upgrade-condition');
  buttonReasons.set(button,text,existing??undefined);button.dataset.reasonInText=String(Boolean(text&&button.textContent.includes(text)));
  if(slot)empty=true;
 }
 roundSlotsHelp.hidden=!empty;roundSlotsHelp.textContent=empty?'빈칸은 보석을 놓은 뒤 선택할 수 있어요':'';
 $('gameApp').dataset.controlGate=String(Boolean(headerReason));if(headerReason)header.textContent=headerReason;
}

function renderSourceDescriptions(w){
 for(const techId of ['R000','R001','R002']){
  const button=$('rs'+techId+'Btn');if(!button)continue;
  let help=$('help'+techId);if(!help){help=document.createElement('small');help.id='help'+techId;help.className='source-help';button.closest('.research').append(help);}
  const source=w.sim.mapIr?.objectMods?.some(object=>object.kind==='upgrade'&&(object.newId??object.baseId)===techId),text=source?sourceButtonHelp(techId):'';
  if(help.textContent!==text)help.textContent=text;help.hidden=!text;
  const refs=(button.getAttribute('aria-describedby')??'').split(/\s+/).filter(id=>id&&id!==help.id);if(text)refs.push(help.id);button.setAttribute('aria-describedby',[...new Set(refs)].join(' '));
 }
}

function renderFirstRunGuide(w){
 const button=$('showFirstRunGuide');if(button)button.disabled=restoring;
 if(restoring){firstRunView.render(null);return;}
 const state=gemTowerPlayerState(w.vm),wave=sourceWaveState(w),own=(w.viewPlayerId??0)===0,prepared=!wave.chosen&&wave.round>0&&!w.gameOver;
 const model=w.firstRunGuide?.observe({ready:Boolean(w.modeDialog?.clicked)&&Boolean(state.difficulty)&&!runtimeFailed&&!loadingRun&&!w.gameOver,fresh:!w.restoredView,restoring:false,own,prepared,buildCount:state.buildCount??0,choiceConfirmed:w.guideChoiceConfirmed===true,combatSeen:Boolean(w.firstCombatSeen),firstWaveEnded:Boolean(w.waveHasSpawned&&w.waveReadyForNext),round:wave.round,life:state.life,gold:w.sim.ledger.gold(0),researchLevel:w.sim.getResearchLevel(0,'R000'),researchCost:researchCostForLevel(GEMTOWER_BALANCE.researches.R000,1)});
 firstRunView.render(own?model:null);
}

function renderResearchShortcut(w,state){
 const rows=['R000','R001'].flatMap(techId=>{const spec=GEMTOWER_BALANCE.researches?.[techId],button=$('rs'+techId+'Btn');if(!spec||!button)return [];const level=w.sim.getResearchLevel(0,techId);return [{techId,level,maxLevel:spec.maxLevel,cost:researchCostForLevel(spec,level+1),disabled:button.disabled,reason:buttonBlockReason(w,button)}];});
 researchShortcut.render(researchShortcutModel(rows,{ready:Boolean(w.modeDialog?.clicked)&&state.round>0&&!state.chosen&&!w.gameOver&&!restoring&&!runtimeFailed,own:(w.viewPlayerId??0)===0}),{runId:w.runId,suppressed:restoring||Boolean(w.restoredView&&!w.researchCuePrimed)});
 if(!restoring)w.researchCuePrimed=true;
}

function sourceWaveState(w,player=0){
 if(w.vm.getGlobal('Be').v===2)return gemTowerPlayerState(w.vm,player);
 const round=w.vm.getGlobal('a'),ready=w.vm.getGlobal('E');return {round:round.t==='int'?round.v:0,chosen:ready.t==='bool'?!ready.v:false};
}
function sourceWaveAt(w,round,player=0){
 if(!Number.isInteger(round)||round<1||round>TOTAL_WAVES)return null;
 const raw=w.vm.getGlobalIndexed('b',round),id=raw.t==='int'&&raw.v?fourCC(raw.v):null,def=id?defOf(w,id):null,visual=def?creepVisualPresentation(GEMTOWER_BALANCE.roleTable[id],def):null;
 const count=w.vm.getGlobal('Be').v===2?w.waveCounts?.race[player]:w.waveCounts?.classic;
 const model=nextWaveView({state:{round,chosen:false},total:TOTAL_WAVES,typeId:id,name:id?fullName(w,id):'',count,def,airborne:visual?.airborne??null});return model&&{...model,band:visual?.band};
}
function countAirDefenders(w){
 let count=0;for(const id of new Set(gemTowerPlayerGemIds(w.vm,0))){const unit=w.sim.getUnit(id);if(!unit?.alive)continue;const def=defOf(w,unit.typeId);if([def?.attack,def?.secondaryAttack].some(attack=>attack&&(attack.targetsMask&2)))count++;}return count;
}
function observeWaveWarnings(w){
 const state=sourceWaveState(w),suppressed=restoring||document.hidden||(w.viewPlayerId??0)!==0||Boolean(w.gameOver);
 w.waveWarnings??=createWaveWarnings({waveAt:round=>sourceWaveAt(w,round),total:TOTAL_WAVES,airCount:()=>countAirDefenders(w)});
 const notice=w.waveWarnings.observe({round:state.round,prepared:Boolean(w.modeDialog?.clicked)&&Boolean(gemTowerPlayerState(w.vm).difficulty)&&state.round>0&&!state.chosen,suppressed});
 if(notice)w.waveNotice={...notice,until:performance.now()+5000};
}
function observeFirstEnemy(w){
 const bounds=w.mobileFields?.[0]?.bounds;if(!bounds)return;
 const entities=[...w.sim.entities.values()];w.firstCombatSeen||=entities.some(entity=>entity.alive&&entity.owner===11&&pointInBattlefield(entity,bounds));
 w.enemyEncounters??=createEnemyEncounters();w.enemyEncounters.observe({entities,bounds,suppressed:restoring||document.hidden||(w.viewPlayerId??0)!==0||Boolean(w.gameOver)});
}
function renderWaveAttention(w){
 const legend=document.querySelector('.route-legend');if(!legend)return;
 let host=$('waveAttention');if(!host){host=document.createElement('div');host.id='waveAttention';host.className='wave-attention';host.setAttribute('role','status');host.hidden=true;const art=document.createElement('canvas');art.id='firstEnemyArt';art.width=32;art.height=32;art.setAttribute('aria-hidden','true');const text=document.createElement('span');text.id='waveAttentionText';host.append(art,text);legend.append(host);}
 const suppressed=restoring||document.hidden||(w.viewPlayerId??0)!==0||Boolean(w.gameOver);if(suppressed){w.enemyEncounters?.clear();w.waveNotice=null;}
 const encounter=suppressed?null:w.enemyEncounters?.snapshot(),notice=w.waveNotice,warning=!suppressed&&notice&&notice.until>performance.now();
 const art=$('firstEnemyArt'),text=$('waveAttentionText'),show=Boolean(encounter||warning);host.hidden=!show;legend.dataset.attention=String(show);art.hidden=!encounter;if(!show)return;
 let message=notice?.text??'';host.dataset.kind=encounter?'enemy':'warning';
 if(encounter){
  const def=defOf(w,encounter.typeId),visual=creepVisualPresentation(GEMTOWER_BALANCE.roleTable[encounter.typeId],def),object=w.sim.mapIr.objectMods.find(o=>o.kind==='unit'&&(o.newId??o.baseId)===encounter.typeId),raw=object?.mods.findLast(mod=>mod.field==='utub')?.value;
  const description=typeof raw==='string'?sourceText(w,raw).split(/\n/)[0].trim():'';
  message=[fullName(w,encounter.typeId),def?(visual.airborne?'공중':'지상'):'이동 방식 확인 중',/TRIGSTR_/.test(description)?'':description].filter(Boolean).join(' · ');
  const context=art.getContext('2d');if(context){context.clearRect(0,0,32,32);drawMineCreep(context,{sprites,typeId:encounter.typeId,band:visual.band,airborne:visual.airborne,x:16,y:18,groundY:18,size:28,tick:0,reducedMotion:true});}
 }
 if(text.textContent!==message)text.textContent=message;
}


function syncDesktopField(w){
 const host=surface.closest('main'),box=host.getBoundingClientRect(),bounds=w.mobileFields?.[w.viewPlayerId??0]?.bounds??w.viewBounds,layout=desktopFieldLayout(bounds,box.width,box.height,20,{compactLandscape:isDesktopPlayLayout({width:window.innerWidth,height:window.innerHeight})});
 if(layout){const width=layout.fieldWidth+'px';if(host.style.getPropertyValue('--desktop-field-width')!==width){host.style.setProperty('--desktop-field-width',width);resize();}}
 const state=sourceWaveState(w,w.viewPlayerId??0),round=Math.max(1,state.round??1)+(state.chosen?1:0);
 nextWaveCard.render(sourceWaveAt(w,round,w.viewPlayerId??0),{visible:Boolean(w.modeDialog?.clicked)&&!restoring&&!runtimeFailed&&!w.gameOver});
 renderWaveAttention(w);

}
function render(w,preservePendingDialog=false) {
  syncGameSound(w);
  syncDesktopField(w);
  syncPrecisionView(w);
  currentGemTarget(w);
  renderBuildCells(w);
  $("actionFeedback").hidden=performance.now()>flashUntil;
  sprites.drawn=0;
  const W = cv.width, H = cv.height;
  ctx.fillStyle = "#23432a"; ctx.fillRect(0, 0, W, H);
  // Letterbox only my source field; fitting a tall board must not reveal neighbouring arenas.
  ctx.save();const fieldBounds=w.viewBounds;
  if(fieldBounds){ctx.beginPath();ctx.rect(W2SX(fieldBounds.minX),W2SY(fieldBounds.maxY),(fieldBounds.maxX-fieldBounds.minX)*cam.zoom,(fieldBounds.maxY-fieldBounds.minY)*cam.zoom);ctx.clip();}
  if (w.pm && !w.terrain) buildTerrain(w);
  const z = cam.zoom;
  // 지형 블릿(카메라 변환)
  if (w.terrain) {
    const leftX = W2SX(w.pm.originX - w.pm.cellSize / 2);
    const topY = W2SY(w.pm.originY + (w.pm.height - 0.5) * w.pm.cellSize);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(w.terrain, leftX, topY, w.pm.width * w.pm.cellSize * z, w.pm.height * w.pm.cellSize * z);
  }
  const groundField=w.mobileFields?.[w.viewPlayerId??0],span=(w.pm?.cellSize??32)*buildGridCells(w),lastGround=groundField?.waypoints?.at(-1);
  const landmarkRects=(groundField?.waypoints??[]).map(r=>({minX:r.minX-span*2,minY:r.minY-span*2,maxX:r.maxX+span*2,maxY:r.maxY+span*2}));
  for(const point of [groundField?.spawn,lastGround&&{x:groundField.bounds.maxX-span/2,y:(lastGround.minY+lastGround.maxY)/2}])if(point)landmarkRects.push({minX:point.x-span*2,minY:point.y-span*2,maxX:point.x+span*2,maxY:point.y+span*2});
  drawFieldGround(ctx,{grid:w.pm,bounds:fieldBounds,landmarkRects,project:p=>({x:W2SX(p.x),y:W2SY(p.y)}),sprites});
  if(fieldBounds){
    ctx.save();ctx.lineWidth=2;ctx.strokeStyle="#e2c17e";ctx.setLineDash([]);
    ctx.strokeRect(W2SX(fieldBounds.minX)+1,W2SY(fieldBounds.maxY)+1,(fieldBounds.maxX-fieldBounds.minX)*z-2,(fieldBounds.maxY-fieldBounds.minY)*z-2);ctx.restore();
  }
  renderBuildPreview(w);
  // Accepted queued placements have the same footprint and art scale as their eventual gem.
  for(const spot of w.pendingBuilds){const size=w.pm.cellSize*buildGridCells(w)*z;ctx.save();ctx.globalAlpha=.45;ctx.fillStyle='#d9c783';ctx.fillRect(W2SX(spot.x)-size/2,W2SY(spot.y)-size/2,size,size);drawFieldPlacement(ctx,{sprites,x:W2SX(spot.x),y:W2SY(spot.y),size:gemSpriteSize(size)});ctx.restore();}
  const cellPx = (w.pm ? w.pm.cellSize : 32) * z;
  const footprintPx = cellPx * buildGridCells(w); // U-1a/U-1c 공용 기준 — 건설 풋프린트(2×2) 픽셀 크기
  let creeps = 0, towers = 0;
  for (const e of w.sim.entities.values()) {
    // U-4b(DISPATCH_SONNET_U4_FIXES §2 U-4b) — §1 전제 반증: 디스패치는 "크립이 타워 렌더 폴백 회색"이라
    // 진단했으나 정확한 원인은 다르다 — 이 루프가 owner를 걸러내지 않아 크립(owner=11)까지 쓸어담았다.
    // 실측(defStore 직접 조회, 표본 h00D 등): owner=11 크립 전원이 attack def를 보유(근접공격 가능한 WC3
    // 크립 다수가 그렇듯) — 그래서 "!(d && d.attack)" 하나만으로는 크립을 걸러내지 못하고, role.kind가
    // "tower"가 아니므로 gemVisual() 폴백(회색)으로 그려지며 mTower/hudTower 집계에도 잘못 합산됐다
    // (실측: 건설 1회 후 1200틱 내 "타워" 71개 중 70개가 실은 owner=11 크립). owner=11을 명시 배제해
    // 타워 렌더와 크립 렌더(아래)를 완전히 분리 — 이 한 줄로 U-3b/U-3d가 세던 "창"(prevCreeps 전이 감지,
    // 431행)도 처음으로 정확해진다(이전엔 creeps가 항상 0이라 웨이브클리어 보상·waveNum 증가가 死코드였음).
    if (!e.alive || e.owner === 11 || e.typeId === "h00G") continue;
    const d = defOf(w, e.typeId);
    if (!(d?.attack || w.knownGemIds.has(e.typeId) || (d?.meta.role.kind==="static"&&d.meta.role.archetype==="specialGem"))) continue;
    towers++;
    const aura=w.sim.abilityEffects?.effects(e.abilities).find(effect=>effect.kind==="immolation");
    const px = W2SX(e.x), py = W2SY(e.y);
    const selected = e.id === w.selectedGemId;
    if(selected){
      const ranges=attackRangeModels(e,d,{forced:e.attackTargetId!==undefined});
      if(!ranges.length&&aura)ranges.push({radiusU:aura.radiusU,targetsMask:aura.targetsMask??3,mode:'effect'});
      drawAttackRanges(ctx,{models:ranges,x:px,y:py,zoom:z,sprites});
    }
    // U-1a: 건설 풋프린트(2×2) 윤곽 — "타워가 2×2로 안 실치됨" 피드백 대응, 실제 차지 면적을 항상 표시.
    // U-2a 파생 조정: 원래 밝은 반투명 흰색(rgba(240,223,178,.14))은 어두운 배경 전제였다 — U-2a가 지형을
    // 밝은 잔디/모래로 바꾸며 거의 안 보이게 됐다(내 변경이 만든 하위 회귀, 즉시 수정). 어두운 스트로크로
    // 교체(엔티티 테두리와 동일한 다크 컨벤션 재사용 — 새 색상 창작 아님) — 밝은 배경에서도 대비 유지.
    ctx.strokeStyle = "rgba(23,15,11,.32)"; ctx.lineWidth = 1;
    ctx.strokeRect(px - footprintPx / 2, py - footprintPx / 2, footprintPx, footprintPx);
    // P-3/U-1c: 라인 8색 + 티어 정다각형(§2.1) — roleTable 파생만, 라인/티어 값 재발명 0. 반경은
    // footprintPx(2×2) 기준(TIER_SHAPE 위 주석 — AD-V1 radiusFrac 수치는 불변, 환산 기준만 확대).
    const vis = gemVisual(w, e.typeId);
    const r = clamp(footprintPx * vis.radiusFrac, 5, 50);
    // U-6b(DISPATCH_SONNET_U6_INFOARCH §2 U-6b) — role을 라벨 분기보다 앞으로 끌어와 specialGem 마커에도
    // 재사용(추가 조회 0, roleTable 단일 lookup).
    const role = GEMTOWER_BALANCE.roleTable[e.typeId];
    const normalFamily=gemTowerGemFamily(fullName(w,e.typeId));
    const visual=gemObjectPresentation(e.typeId,d,normalFamily,sprites.aliases[e.typeId]);
    const special=visual.kind==='special';
    const logical=visual.logical;
    const line=logical.startsWith("gem:")?logical.split(":")[1]:null;
    const colour=LINE_COLORS[line]??vis.color;
    if(!(visual.kind==='slate'?drawFieldSlate(ctx,{sprites,logical,x:px,y:py,size:gemSpriteSize(footprintPx)}):drawFieldGem(ctx,{sprites,logical,x:px,y:py,size:gemSpriteSize(footprintPx),grade:fullName(w,e.typeId),selected,tint:colour,tick:reducedMotion.matches?0:w.sim.tickCount}))){
    ctx.beginPath();
    for (let k = 0; k < vis.vertices; k++) {
      const ang = -Math.PI / 2 + (k * 2 * Math.PI) / vis.vertices;
      const vx = px + r * Math.cos(ang), vy = py + r * Math.sin(ang);
      if (k === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fillStyle = colour;
    ctx.fill();
    if (vis.borderPx > 0) { ctx.strokeStyle = "#170f0b"; ctx.lineWidth = vis.borderPx; ctx.stroke(); }
    }
    // U-6b(DISPATCH_SONNET_U6_INFOARCH §2 U-6b, 작가 "특별한 보석 타워... 가시성 굉장히 중요") — specialGem
    // 전용 정적 마커(점선 테두리+별, 애니메이션 0 — Motion Gate 절제, 매 프레임 동일 렌더이므로 motion
    // budget 미소비). 색(attackType)·모양(TIER_SHAPE) 2축에 "특별함" 3번째 축을 더해 일반 타워(수십 종)와
    // 한눈에 구분 — 이 archetype 1곳에만 적용(테두리/글로우 남발 금지, Motion/Effect Selection Gate 준수).
    if (special) {
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = "#ffd166"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, r + 3, 0, 7); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = "#ffd166";
      ctx.beginPath();for(let k=0;k<10;k++){const a=-Math.PI/2+k*Math.PI/5,rad=k%2?2:4;const x=px+Math.cos(a)*rad,y=py-r-8+Math.sin(a)*rad;if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fill();
    }
    if (selected) { ctx.strokeStyle = "#f0dfb2"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, r + 4, 0, 7); ctx.stroke(); }
    drawObjectKindMark(ctx,{x:px,y:py,size:gemSpriteSize(footprintPx),kind:visual.kind});
    if(selected)drawFieldEffectMarks(ctx,{sprites,effects:w.sim.abilityEffects?.effects(e.abilities)??[],def:d,x:px,y:py,size:gemSpriteSize(footprintPx)});
    const grade=gemGradePresentation(normalFamily?.grade);
    if(visual.kind==='gem'&&grade)drawGemGrade(ctx,{x:px,y:py,size:gemSpriteSize(footprintPx),rank:grade.rank});
    if (special && (selected || e.id===w.hoverGemId || footprintPx>=60)) {
      // U-6c(DISPATCH_SONNET_U6_INFOARCH §2 U-6c, U-5 흡수) — specialGem 종류명 라벨. 병합 nameMap(81/81
      // 커버, 위 loadNameMap() 참조)에서 그대로 읽는다 — 이전엔 SPECIALGEM_NAMES(28/45)만 커버해 17종이
      // 라벨 생략이었으나, 이제 45종 전원이 이름을 갖는다(원장 그대로, 발명 0).
      const nm = w.nameMap && w.nameMap[e.typeId];
      if (nm) {
        ctx.textAlign = "center";
        ctx.font = "12px system-ui";
        ctx.lineWidth = 2; ctx.strokeStyle = "#170f0b"; ctx.strokeText(nm, px, py + r + 11);
        ctx.fillStyle = "#f0dfb2"; ctx.fillText(nm, px, py + r + 11);
        ctx.textAlign = "left";
      }
    }
  }
  for(const e of w.sim.entities.values()) {
    if(!e.alive || e.typeId!=="h00G")continue;
    const px=W2SX(e.x),py=W2SY(e.y),r=Math.max(5,footprintPx*.27);
    if(drawFieldStone(ctx,{sprites,x:px,y:py,size:gemSpriteSize(footprintPx,true)}))continue;
    ctx.fillStyle="#778078";ctx.strokeStyle="#354539";ctx.lineWidth=1;
    ctx.beginPath();for(let k=0;k<6;k++){const a=k*Math.PI/3;const x=px+Math.cos(a)*r,y=py+Math.sin(a)*r*.8;if(k===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.closePath();ctx.fill();ctx.stroke();
  }
  creeps=renderCreeps(w,footprintPx,z);
  // G-2d(DISPATCH_SONNET_G2_CORE §2 G-2d, docs/GEM_IDENTITY_MINE_DESIGN.md §3.1) — 광산(h01V, mine
  // archetype) HP 바. 크립 hp 바(위)와 동일한 그리기 관례 — mineAttackStep(G-2a)이 실시간으로 깎는
  // e.hp를 그대로 읽는다(재발명 0). 8개 게이트 전부(모든 플레이어) 표시 — 선택 개념 없음(항상 관측 가능).
  let mineHpP0 = null;
  for (const e of w.sim.entities.values()) {
    if (!e.alive) continue;
    const role = GEMTOWER_BALANCE.roleTable[e.typeId];
    if (!(role && role.kind === "static" && role.archetype === "mine")) continue;
    if (e.owner === 0) mineHpP0 = e;
    const px = W2SX(e.x), py = W2SY(e.y);
    const bw = clamp(cellPx * 1.4, 24, 70), bh = 6;
    const r = e.hpMax > 0 ? clamp(e.hp / e.hpMax, 0, 1) : 0;
    ctx.fillStyle = "#59402c"; ctx.fillRect(px - bw / 2, py - 22, bw, bh);
    ctx.fillStyle = r > .5 ? "#53a64f" : r > .25 ? "#c18b30" : "#d74e3c";
    ctx.fillRect(px - bw / 2, py - 22, bw * r, bh);
    ctx.strokeStyle = "#170f0b"; ctx.lineWidth = 1; ctx.strokeRect(px - bw / 2, py - 22, bw, bh);
    ctx.fillStyle = "#f0dfb2"; ctx.font = "12px system-ui"; ctx.textAlign = "center";
    ctx.fillText(Math.max(0, e.hp) + "/" + e.hpMax, px, py - 25);
    ctx.textAlign = "left";
  }
  $("mMineHp").textContent = mineHpP0 ? Math.max(0, mineHpP0.hp) + "/" + mineHpP0.hpMax : "—";
  // The script owns rounds and rewards. Rendering must not mutate economic state.
  const scriptRound = gemTowerPlayerState(w.vm).round;
  if (Number.isInteger(scriptRound) && scriptRound > 0) waveNum = scriptRound;
  $("engineTag").textContent = w.gameOver ? (w.gameOver.winner===null?"생명이 0이 되었습니다 · 다시 시작할 수 있어요":"클리어했습니다 · 다시 시작할 수 있어요") : !w.modeDialog?.clicked?"게임 방식을 고르면 시작합니다":!playing&&!restoring?(w.pendingBuilds.length?`건설 대기 ${w.pendingBuilds.length}개 · 재개해서 완성하기`:"일시정지 · 재개해서 계속하기"):gemBuildHint(w.vm);
  const built=gemTowerPlayerState(w.vm).buildCount ?? 0;
  $("buildProgress").setAttribute("aria-label",`보석 ${built}/5 건설`);
  $("buildProgress").hidden=gemTowerPlayerState(w.vm).chosen===true;
  [...$("buildProgress").children].forEach((el,index)=>el.classList.toggle("filled",index<built));
  // HUD
  $("mGold").textContent = Math.floor(w.sim.ledger.gold(0));
  // P-2: 수입 분해 패널(ledger.bySource) — 이중지급 감시를 UI가 공짜로 보여준다(PLAYABLE §5/부록).
  // bounty(엔진)는 bountyMode="script" 설정상 항상 0이어야 정상(0 아니면 이중지급 회귀 신호).
  const bySrc = w.sim.ledger.bySource();
  const mGoldSrc = $("mGoldSrc");
  if (mGoldSrc) mGoldSrc.textContent = `script +${bySrc.script.in}−${bySrc.script.out} · bounty +${bySrc.bounty.in}−${bySrc.bounty.out} · cost +${bySrc.cost.in}−${bySrc.cost.out}`;
  // P-3: 젬 선택 패널(§4.3) — 스탯은 defOf(DefStore)에서 그대로 읽는다(엔진 데이터, 재발명 0).
  const selected = w.selectedGemId !== null ? w.sim.getUnit(w.selectedGemId) : undefined;
  if (selected && selected.alive) {
    const d = defOf(w, selected.typeId);
    $("gemNone").style.display = "none";
    $("gemPanel").style.display = "flex";
    // U-6a(DISPATCH_SONNET_U6_INFOARCH §2 U-6a) — 이름(병합 nameMap, 없으면 기존 gemLabel() 폴백) +
    // 특별보석 여부 배지. gemLabel(라인·티어 필드)는 기존 그대로(무변경, 아래).
    const family=gemTowerGemFamily(fullName(w,selected.typeId));
    const selectedVisual=gemObjectPresentation(selected.typeId,d,family,sprites.aliases[selected.typeId]);
    $("gemName").textContent = fullName(w, selected.typeId);
    $("gemCombatTarget").textContent = attackTargetLabel(d);
    const specialBadge = $("gemSpecialBadge");
    if (specialBadge) specialBadge.style.display = (selectedVisual.kind === "special") ? "inline-block" : "none";
    $("gemLabel").textContent = family ? family.lineLabel+" · "+family.grade : selectedVisual.label;
    const gemType = $("gemType");
    if (gemType) gemType.textContent = attackTypeLabel(d?.attack?.attackType);
    const attackText=attackDisplay(d?.attack??d?.secondaryAttack,DT);
    $("gemDmg").textContent = attackText.damage;
    const rangeModels=attackRangeModels(selected,d,{forced:selected.attackTargetId!==undefined});
    $("gemRange").textContent=rangeModels.map(a=>(a.targetsMask===1?'땅 ':a.targetsMask===2?'공중 ':'')+rangeInBuildCells(a.radiusU,(w.pm?.cellSize??32)*buildGridCells(w))).join(' / ')||'—';
    $("gemRange").title=selected.attackTargetId!==undefined?'지정 공격 사거리':'자동 공격 범위 · 적을 찾아 공격하는 거리';
    $("gemCd").textContent = attackText.interval;
    const resolvedEffects=w.sim.abilityEffects?.effects(selected.abilities)??[];
    effectIcons.render({effects:resolvedEffects,def:d});
    const effects=combatEffectLabels(resolvedEffects,DT),effectText=$("gemEffects");
    if(d?.secondaryAttack){const a=d.secondaryAttack,t=attackDisplay(a,DT),band=attackTargetLabel({attack:a});effects.unshift(`${band} · ${t.damage} · 사거리 ${rangeInBuildCells(a.rangeU,(w.pm?.cellSize??32)*buildGridCells(w))} · ${t.interval}`);}
    if(d?.attack?.splash?.quarterU>0)effects.unshift(`범위 공격 · 반경 ${d.attack.splash.quarterU}`);
    for(const id of w.sim.abilityEffects?.unresolvedFor?.(selected.abilities)??[]){
      const name=sourceText(w,w.sim.mapIr.objectMods.filter(o=>o.kind==="ability"&&(o.newId??o.baseId)===id).flatMap(o=>o.mods).findLast(m=>m.field==="anam")?.value);
      effects.push("아직 지원하지 않는 효과"+(name&&name!==id&&!/^TRIGSTR_\d+$/.test(name)?" · "+name:""));
    }
    effectText.hidden=!effects.length;effectText.textContent=effects.length?"보유 효과"+effects.map(text=>"\n• "+text).join(""):"";
    const upgrades=(d?.upgradesTo??[]).map(typeId=>{const cost=w.sim.unitUpgradeCost(selected.id,typeId),reason=w.sim.validateUnitUpgrade(0,selected.id,typeId);return {typeId,cost,reason,condition:reason==='insufficient-gold'?unavailableReason(reason,{cost,gold:w.sim.ledger.gold(selected.owner)}):upgradeConditionText(reason,selected.owner)};});
    const upgradeSignature=JSON.stringify([selected.id,selected.typeId,upgrades]);
    $("gemUpgrades").hidden=!upgrades.length;
    if(w.upgradeSignature!==upgradeSignature){w.upgradeSignature=upgradeSignature;$("gemUpgrades").replaceChildren();for(const u of upgrades){
      const button=document.createElement('button');button.className='sec';button.dataset.upgradeTarget=u.typeId;button.disabled=Boolean(u.reason);const target=defOf(w,u.typeId);const name=target?.name?fullName(w,u.typeId):'강화 정보 없음';button.textContent=`${name} 강화 · ${u.cost??'—'} 골드`;const preview=document.createElement('small');preview.className='upgrade-preview';preview.textContent=upgradeAttackSummary(target,DT);button.append(preview);
      const condition=u.condition;button.title=condition;const status=document.createElement('small');status.className='upgrade-condition';status.textContent=u.reason===null?`강화 가능 · ${((target?.buildTimeTicks??0)*DT).toFixed(1)}초`:condition;button.append(status);$("gemUpgrades").append(button);
    }}
    const pending=w.sim.pendingUpgrades.get(selected.id);$("upgradeStatus").textContent=pending?`강화 중 · ${(pending.remainingTicks*DT).toFixed(1)}초`:upgrades.some(u=>u.reason==='not-owner')&&selected.owner===9?'이번 보석을 남긴 뒤 전투 중에 강화할 수 있어요':'';
    // Reflect the same ownership/ability checks used by the engine command path.
    const actions = gemActions(w, selected.id);w.gemActionViews=actions;
    for (const action of actions) {
      const button = $("cast" + action.abilityId);
      button.disabled = action.disabled;
      button.hidden=!showGemAction(action);
      button.textContent = action.abilityId==="A008"?"바위 제거":action.label;
      button.title = action.reason ? abilityOrderReason(action.reason) : "보유한 능력 사용";
      if(action.disabled&&!button.hidden&&["A03M","A02J","A02G","A008"].includes(action.abilityId))button.textContent+=" · "+button.title;
    }
    $("gemCombineGate").textContent = gemActionConditions(actions).join("\n");$("gemCombineGate").hidden=!$("gemCombineGate").textContent;

  } else {
    w.selectedGemId = null;
    $("gemNone").style.display = "flex";
    $("gemPanel").style.display = "none";
  }
  // G-2c(DISPATCH_SONNET_G2_CORE §2 G-2c) — 연구 패널: 레벨/비용은 GameBalanceConfig.researches(A-G1)
  // + sim.getResearchLevel(0, techId)에서 그대로 읽는다(값 재발명 0). 만렙이면 버튼 비활성화.
  for (const techId of RESEARCH_IDS) {
    const spec = GEMTOWER_BALANCE.researches && GEMTOWER_BALANCE.researches[techId];
    const lvEl = $("rs" + techId + "Lv"), costEl = $("rs" + techId + "Cost"), btn = $("rs" + techId + "Btn");
    const lv = w.sim.getResearchLevel(0, techId);
    if (spec) {
      if (lvEl) lvEl.textContent = lv + "/" + spec.maxLevel;
      // R-1 C-1 반영(2026-07-20): 비용이 레벨당 증가분(R000: 20→230)을 갖게 되어 고정 costPerLevel 표시는
      // 실제 청구액과 어긋난다. *다음 레벨* 비용을 표시한다(엔진과 동일한 researchCostForLevel 재사용 —
      // 화면에서 수식을 재구현하지 않는다). 최대 레벨이면 "연구 완료".
      if (costEl) {
        const complete=lv >= spec.maxLevel,pending=w.pendingResearch?.techId===techId;
        costEl.textContent = complete ? "" : researchCostForLevel(spec, lv + 1);
        costEl.hidden=complete;
        if(costEl.previousSibling)costEl.previousSibling.textContent=complete?"연구 완료":pending?"연구 처리 중 · ":"연구 · ";
        if(costEl.nextSibling)costEl.nextSibling.textContent=complete?"":" 골드";
      }
      // R-1 C-2 반영: 선행조건(R001 ← R000 8레벨) 미충족이면 버튼도 잠근다(엔진이 거부하는 것을 UI가 미리 반영).
      const prereqOk = !spec.requires || w.sim.getResearchLevel(0, spec.requires.techId) >= spec.requires.count;
      if (btn) {
        const cost = researchCostForLevel(spec, lv + 1);
        btn.setAttribute("aria-label",`${({R000:"보석 질",R001:"찬스 확률",R002:"천국의 보석"})[techId]} 연구${lv >= spec.maxLevel ? " 완료" : ` · ${cost} 골드`}`);
        const affordable = w.sim.ledger.gold(0) >= cost;
        btn.disabled = Boolean(w.gameOver) || Boolean(w.pendingResearch) || lv >= spec.maxLevel || !prereqOk || !affordable;
        btn.setAttribute("aria-busy",String(w.pendingResearch?.techId===techId));
        btn.title = w.pendingResearch ? "연구 처리 중입니다" : lv >= spec.maxLevel ? "연구 완료" : !prereqOk ? "선행: " + spec.requires.techId + " " + spec.requires.count + "레벨 필요" : !affordable ? "골드가 부족합니다" : "";
      }
    } else if (lvEl) lvEl.textContent = "—";
  }
  {const researchStatus=$("researchStatus"),researchMessage=w.pendingResearch?(playing?"연구 처리 중…":"일시정지 · 상단 재개를 누르면 연구가 진행됩니다"):w.researchNotice??"연구 완료 후 다음 가격으로 계속 구입할 수 있어요";
  if(researchStatus&&researchStatus.textContent!==researchMessage)researchStatus.textContent=researchMessage;}
  // G-6(DISPATCH_SONNET_G3_G6 §2 G-6, GEM_IDENTITY_MINE_DESIGN §5.1) — 멀티보드: 실측 CreateMultiboardBJ
  // (6,L,"보석타워 맥스") 타이틀·6열 그대로. 열 내용(hud_quests.json 콜사이트60 미확보 — A-G10 자체 선택)은
  // "natives 상태 미러"만: 플레이어/골드/라이프/타워/웨이브/상태 — 전부 이미 노출된 값의 재표시(재구현 0).
  updateMultiboard(w);
  // P-4(라이프·승패, PLAYABLE §6): 정정 기록 — 기존 리터럴 3은 잘못된 PlayerState 키였다(D5 위반 요인,
  // "—" 고착 버그). 실측 정본 키는 PLAYER_STATE_RESOURCE_LUMBER(=2, docs/dissection/economy_death.json
  // QMe_roundAdvance의 SetPlayerStateBJ(...,PLAYER_STATE_RESOURCE_LUMBER,5) 및 debug 실측 재확인).
  const lumber = gemTowerPlayerState(w.vm).life ?? w.sim.playerState.get(0, PLAYER_STATE_RESOURCE_LUMBER);
  $("mLife").textContent = lumber >= 0 ? lumber : "—";
  const mGate = $("mGate");
  if (mGate) mGate.textContent = gatePassed; // observe 모드 관측 카운트(라이프 차감 아님 — HUD 부기용)
  $("mWave").textContent = w.prepActive ? "준비" : (waveNum > 0 ? waveNum : "1");
  $("mTick").textContent = w.sim.tickCount;
  $("mEnt").textContent = w.sim.entities.size;
  $("mCreep").textContent = creeps;
  $("mTower").textContent = towers;
  $("mRect").textContent = rectEntered;
  $("mHash").textContent = w.sim.stateHash();
  $("mAttacks").textContent = w.observedAttacks;
  cv.dataset.spritesDrawn=String(sprites.drawn);
  // U-2b/U-2c(DISPATCH_SONNET_U2_GAMESHELL §2) — 코너 게임 HUD(리소스 바+목표 HUD). 사이드바 dev 패널
  // (mGold/mLife/mWave 등, 위)과 동일한 값을 재표시할 뿐(재계산 0) — 플레이어용 "게임 화면" 오버레이와
  // 개발자용 상세 패널을 분리(teardown "코너 앵커·미니멀·고대비" + premium 6:3:1 위계).
  renderTraining(w);
  const hudGold = $("hudGold"), hudLife = $("hudLife"), hudTower = $("hudTower");
  if (hudGold) hudGold.textContent = Math.floor(w.sim.ledger.gold(0));
  if (hudLife) hudLife.textContent = lumber >= 0 ? lumber : "—";
  for(const request of w.pendingMoves??[]){const unit=w.sim.getUnit(request.unitId);
   if(unit&&unit.x===request.x&&unit.y===request.y){request.done=true;flash('슬레이트 이동 완료');}
   else if(w.sim.tickCount-request.issuedTick>20){request.done=true;flash('원작 이동 조건을 충족하지 못했습니다 · 다른 곳을 선택하세요');}
  }
  if(w.pendingMoves)w.pendingMoves=w.pendingMoves.filter(r=>!r.done);
  const retained=new Set(gemTowerPlayerGemIds(w.vm));
  const gems=[...w.sim.entities.values()].filter(e=>e.alive&&(e.owner===0||retained.has(e.id))&&e.typeId!=="h00G"&&(w.knownGemIds.has(e.typeId)||defOf(w,e.typeId)?.meta.role.kind==="tower"||defOf(w,e.typeId)?.meta.role.archetype==="specialGem"));
  w.gemTargetCandidateIds=new Set([...gems,...ownedRocks(w)].map(e=>e.id));
  overlapPicker.render(overlapChoices(w).map(e=>({id:e.id,name:fullName(w,e.typeId)})),w.selectedGemId);
  renderPlacement(w);
  const comboIds=availableGemCombinations(w,gems);w.availableComboIds=comboIds;
  $("findCombination").hidden=comboIds.length===0||Boolean(w.gameOver);
  $("findCombination").textContent=`조합 가능 ${comboIds.length}`;
  const roster=w.showRocks?ownedRocks(w):gems;
  if (hudTower) hudTower.textContent = gems.length;
  $("rosterKind").textContent=w.showRocks?"내 바위":"내 보석";$("showRocks").setAttribute("aria-pressed",String(Boolean(w.showRocks)));
  const blocked=blockedCreepCount(w);$("pathWarning").hidden=!blocked||Boolean(w.gameOver);$("pathWarning").textContent=`길 막힘 · 적 ${blocked}마리 · 바위 보기`;
  $("combatCount").textContent=`적 ${[...w.sim.entities.values()].filter(e=>e.alive&&e.owner===11&&e.orderActive).length}마리`;
  $("rosterCount").textContent=roster.length;
  if(gemTowerPlayerState(w.vm).chosen===false)roster.sort((a,b)=>Number(b.owner===0)-Number(a.owner===0));
  const rosterSignature=String(Boolean(w.showRocks))+roster.map(e=>e.id+":"+e.typeId+(w.showRocks?":"+e.x+":"+e.y:"")).join(",");
  if(w.rosterSignature!==rosterSignature){
    w.rosterSignature=rosterSignature;$("gemRoster").replaceChildren();
    for(const [index,e] of roster.entries()){
      const button=document.createElement("button");button.className="gem-chip";button.dataset.unitId=String(e.id);button.textContent=fullName(w,e.typeId);button.setAttribute("aria-label",w.showRocks?`바위 ${Math.round((e.y-w.pm.originY)/w.pm.cellSize/buildGridCells(w))+1}행 ${Math.round((e.x-w.pm.originX)/w.pm.cellSize/buildGridCells(w))+1}열`:`${fullName(w,e.typeId)} · 보석 ${index+1}`);
      const family=gemTowerGemFamily(fullName(w,e.typeId));button.style.setProperty("--gem-color",LINE_COLORS[family?.line]??gemVisual(w,e.typeId).color);
      $("gemRoster").append(button);
    }
  }
  for(const button of $("gemRoster").children){
   const id=Number(button.dataset.unitId),canCombine=!w.showRocks&&comboIds.includes(id);
   button.setAttribute("aria-pressed",String(id===w.selectedGemId));button.dataset.combine=String(canCombine);
   if(canCombine)button.setAttribute('aria-description','특별 조합이나 슬레이트 조합을 사용할 수 있습니다');else button.removeAttribute('aria-description');
  }
  const hudWaveNum = $("hudWaveNum"), hudPhase = $("hudPhase");
  if (hudWaveNum) {
    hudWaveNum.textContent = w.prepActive ? "—" : String(waveNum > 0 ? waveNum : 1);
    // U-2b: 웨이브 전환 연출(펄스) — 새 웨이브 진입 순간에만 900ms간 확대(팝) 후 원복. 신규 애니메이션
    // 곡선 1개 추가(Motion Gate 2번째 포인트, RETURN §Motion Gate 표 참조) — CSS keyframes 대신 기존
    // 코드베이스 관례(연령 기반 인라인 스타일 계산, textTag/attackFx와 동일 패턴)를 따른다.
    if (!reducedMotion.matches && performance.now() < waveFlashUntil) {
      const age = 1 - (waveFlashUntil - performance.now()) / 900;
      hudWaveNum.style.transform = `scale(${(1 + 0.5 * Math.sin(Math.min(1, age) * Math.PI)).toFixed(2)})`;
      hudWaveNum.style.color = "#ffd166";
    } else { hudWaveNum.style.transform = ""; hudWaveNum.style.color = ""; }
  }
  if (hudPhase) hudPhase.textContent = w.gameOver ? "종료" : gemTowerPlayerState(w.vm).chosen !== true ? "보석 준비" : "웨이브 진행 중";
  // P-4: GameOver 오버레이 — 스크립트가 sim.endGame()을 호출했을 때만 등장(재구현 0, 값은 이벤트 그대로).
  renderControls(w);
  gameMenu.sync({solo:w.sim.playerState.getSlotState(1)!==1,playing});
  const over = $("gameOver");
  if (over) {
    if (w.gameOver) {
      over.style.display = "flex";
      if(!w.gameOver.focused){$("goRestart").focus();w.gameOver.focused=true;}
      const winner = w.gameOver.winner;
      $("goTitle").textContent = winner === null ? "패배" : `플레이어 ${winner + 1} 클리어`;
      $("goSummary").textContent = `웨이브 ${waveNum} · 골드 ${Math.floor(w.sim.ledger.gold(0))} · 게임 시간 ${(w.sim.tickCount * DT / 60).toFixed(1)}분`;
    } else {
      over.style.display = "none";
    }
  }
  const sourceState=gemTowerPlayerState(w.vm),difficulty=sourceState.difficulty??0;
  const difficultyName=difficulty?w.vm.getGlobalIndexed('vI',30+difficulty):null;
  $("difficultyTag").textContent=sourceDifficultyChoices(w)[difficulty-1]?.label??(difficultyName?.t==='string'?sourceText(w,difficultyName.v):w.startupChoice?'선택한 난이도 적용 중':'선택 전');
  const dialog=w.registry.dialogIds.map(id=>w.vm.handles.get(id)).find(d=>d?.kind==='dialog'&&d.id!==w.modeDialog?.dialogId&&(d.data.visibleTo??[]).includes(0)&&d.data.buttons?.length);
  $("sourceDialog").hidden=!dialog||Boolean(w.gameOver)||Boolean(w.startupChoice)&&sourceDifficultyChoices(w).some(c=>c.dialogId===dialog?.id);
  if(dialog&&!w.gameOver){
    const key=JSON.stringify([dialog.id,dialog.data.message,dialog.data.buttons]);
    if(w.nativeDialogKey!==key){w.nativeDialogKey=key;if(!preservePendingDialog)w.nativeDialogPendingId=null;$("sourceDialogTitle").textContent=sourceText(w,dialog.data.message)||'선택해 주세요';$("sourceDialogButtons").replaceChildren();
      for(const id of dialog.data.buttons){const handle=w.vm.handles.get(id);if(handle?.kind!=='button')continue;const button=document.createElement('button');button.className='sec';button.dataset.dialogButton=String(id);button.dataset.dialogId=String(dialog.id);button.textContent=sourceDifficultyLabel(w,dialog.id,id,sourceText(w,handle.data.text));$("sourceDialogButtons").append(button);}$("sourceDialogButtons").querySelector('button')?.focus();
    }
    for(const button of $("sourceDialogButtons").children)button.disabled=w.nativeDialogPendingId===dialog.id;
  }else {w.nativeDialogKey=null;w.nativeDialogPendingId=null;}
  refreshReplayOutput(w);
  // 준비 오버레이
  if (w.prepActive) {
    $("prep").style.display = "flex";
    const ready = gemTowerPlayerState(w.vm).chosen === true;
    $("prepTime").textContent = ready ? "준비 완료" : "보석 준비";
    $("skip").disabled = !ready;
    $("skip").textContent = "클래식 웨이브 시작";
  } else { $("prep").style.display = "none"; }
  // S-A2d: 모드 선택 오버레이 — 클릭 전까지만 노출(원작 Ne 다이얼로그와 동일하게 1회성).
  const modeSelectEl = $("modeSelect");
  if (modeSelectEl) modeSelectEl.style.display = w.modeDialog && !w.modeDialog.clicked ? "flex" : "none";renderStartupOptions(w);
  // U-2e: 공격 juice — 타겟팅 라인 + 임팩트 버스트(단일 콤보 이펙트, Motion Gate 1포인트). 좌표는 stepN()이
  // lastPos 스냅샷에서 얻은 값(재발명 0). 220ms 수명 — 다음 공격까지 잔상이 안 남을 만큼 짧게(남발 금지).
  const nowT = performance.now();
  attackFx = attackFx.filter((f) => nowT - f.born < 220);
  for (const f of attackFx) {
    const age = (nowT - f.born) / 220;
    const x1 = W2SX(f.x1), y1 = W2SY(f.y1), x2 = W2SX(f.x2), y2 = W2SY(f.y2);
    ctx.globalAlpha = Math.max(0, 1 - age * 1.3);
    ctx.strokeStyle = f.color; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    ctx.beginPath(); ctx.arc(x2, y2, 3 + age * 9, 0, 7); ctx.lineWidth = 1.5; ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // G-6: TextTag 렌더 — 피격 위치에서 위로 떠오르며 페이드(700ms). 재구현 0(엔진 hp 차분 관측치 그대로).
  // U-2e: "데미지 숫자 강화"(teardown juice 레슨 4) — 폰트만 굵게/크게 조정(신규 애니메이션 곡선 추가 X,
  // 기존 부유+페이드 궤적 그대로) — Motion Gate 예산에 신규 포인트로 잡지 않기 위한 의도적 절제.
  textTags = textTags.filter((t) => nowT - t.born < 700);
  for (const t of textTags) {
    const age = (nowT - t.born) / 700;
    const px = W2SX(t.x), py = W2SY(t.y) - 12 - age * 22;
    ctx.globalAlpha = Math.max(0, 1 - age);
    ctx.font = "bold 12px system-ui"; ctx.textAlign = "center";
    ctx.lineWidth = 3; ctx.strokeStyle = "#170f0b"; ctx.strokeText(t.text, px, py);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, px, py);
    ctx.globalAlpha = 1; ctx.textAlign = "left";
  }
  // G-6: 골드 태그 — 세계좌표 없음(플레이어 리소스) → HUD(mGold) 부근 캔버스 좌상단 고정 앵커에서 부유.
  // U-2c 파생 조정: 원 앵커(14,24)는 신규 resourceHud 골드 알약(top:12/left:12, HTML 오버레이)과 정확히
  // 겹친다(내 변경이 만든 하위 충돌, 즉시 수정) — objectiveHud(top:56~) 아래로 앵커를 내려 두 HUD 모두와
  // 분리한다. 재배치일 뿐 로직·값 무변경.
  goldTags = goldTags.filter((t) => nowT - t.born < 1200);
  goldTags.forEach((t, i) => {
    const age = (nowT - t.born) / 1200;
    ctx.globalAlpha = Math.max(0, 1 - age);
    ctx.font = "bold 12px system-ui"; ctx.textAlign = "left"; ctx.fillStyle = "#d4ac43";
    ctx.fillText(t.text, 24, 130 + i * 16 - age * 18);
    ctx.globalAlpha = 1;
  });
  // U-1c: 호버 툴팁 — 클릭선택 패널과 별개로 마우스오버만으로 라인·티어·공격력·사거리 즉시 확인
  // (roleTable/defOf 파생만, 발명 0). 드래그(팬) 중엔 억제(조작 충돌 방지).
  if (w.hoverGemId !== null && !drag.on) {
    const g = w.sim.getUnit(w.hoverGemId);
    const role = g ? GEMTOWER_BALANCE.roleTable[g.typeId] : null;
    if (g && g.alive && role && role.kind === "tower") {
      const gd = defOf(w, g.typeId);
      const lines = [fullName(w, g.typeId)];
      if (gd && gd.attack) lines.push(`대미지 ${gd.attack.dmgBase}±${gd.attack.dmgSpread}`, `사거리 ${gd.attack.rangeU}`);
      ctx.font = "12px system-ui";
      const tw = Math.max(...lines.map((t) => ctx.measureText(t).width)) + 16;
      const th = lines.length * 14 + 8;
      const tx = clamp(mouseScreen.x + 14, 0, W - tw), ty = clamp(mouseScreen.y + 14, 0, H - th);
      ctx.fillStyle = "rgba(23,15,11,.92)"; ctx.strokeStyle = "#59402c"; ctx.lineWidth = 1;
      ctx.fillRect(tx, ty, tw, th); ctx.strokeRect(tx, ty, tw, th);
      ctx.fillStyle = "#f0dfb2"; ctx.textAlign = "left";
      lines.forEach((t, i) => ctx.fillText(t, tx + 8, ty + 14 + i * 14));
    }
  }
  // Original P0 construct handler xTv writes I[1..5] after O[1] increments.
  // vuv/vUv/vwv/vWv/vyv are the exact O[1]==1..5 predicates. Never infer a
  // round hand from DOM order, coordinates or the retained R group.
  for(const threat of w.exitThreatViews??[])drawExitThreat(ctx,threat);
  ctx.restore();
  w.fieldFeedback?.draw(ctx,sprites,point=>pointInBattlefield(point,fieldBounds)?{x:W2SX(point.x),y:W2SY(point.y)}:null);
  if(fieldBounds)drawFieldRim(ctx,{left:W2SX(fieldBounds.minX),top:W2SY(fieldBounds.maxY),width:(fieldBounds.maxX-fieldBounds.minX)*z,height:(fieldBounds.maxY-fieldBounds.minY)*z},sprites);
  renderPlacementLoupe(w);
  renderRouteCues(w);
  const sourceHand=gemTowerPlayerState(w.vm);
  const skinGem=(entity,slot)=>{
   if(!entity?.alive)return null;
   const name=fullName(w,entity.typeId),family=gemTowerGemFamily(name),visual=gemObjectPresentation(entity.typeId,defOf(w,entity.typeId),family,sprites.aliases[entity.typeId]);
   return {slot,id:entity.id,name,alive:true,logical:visual.logical,kind:visual.kind,grade:gemGradePresentation(family?.grade),roleLabel:visual.label+(family?' · '+family.grade:''),tint:visual.kind==='stone'||visual.kind==='slate'?undefined:LINE_COLORS[family?.line]??gemVisual(w,entity.typeId).color};
  };
  const handIds=Array.from({length:Math.min(5,sourceHand.buildCount??0)},(_,i)=>w.vm.getGlobalIndexed('I',i+1)).filter(handle=>handle.t==='handle'&&handle.v!==null).map(handle=>handle.v);
  const combinations=combinationHints(w,handIds,{ready:!sourceHand.chosen&&!restoring&&Boolean(sourceHand.difficulty),playerId:w.viewPlayerId??0});
  recipeGuide.setBook(w.recipeBook);recipeGuide.setPriority(combinations.priorityRecipeIds);
  const specialName=combinations.specialType?fullName(w,combinations.specialType):'';

  gemSkin.render({specialMessage:specialName&&specialName!==combinations.specialType?'이번 5개로 '+specialName+' 만들 수 있어요':'',casino:{...gemTowerCasinoState(w.vm,w.sim),feedback:w.casinoFeedback?.snapshot()},round:sourceHand.round,buildCount:sourceHand.buildCount,chosen:sourceHand.chosen,selectedId:w.selectedGemId,
   desktop:isDesktopPlayLayout({width:window.innerWidth,height:window.innerHeight}),targetActions:(w.targetActionViews=w.selectedGemId===null?[]:targetGemActions(w,w.selectedGemId)),pendingTarget:w.pendingTargetAbility??null,
   combatActive:sourceHand.chosen===true&&!w.prepActive&&!w.gameOver,pendingPoint:Boolean(w.pendingPointAbility),
   selectedGem:skinGem(w.selectedGemId===null?null:w.sim.getUnit(w.selectedGemId),null),
   candidates:Array.from({length:5},(_,i)=>{
    const slot=i+1;if(slot>(sourceHand.buildCount??0))return null;
    const handle=w.vm.getGlobalIndexed('I',slot);
    const item=skinGem(handle.t==='handle'&&handle.v!==null?w.sim.getUnit(handle.v):null,slot);return item?{...item,combinable:combinations.combinableIds.includes(item.id)}:null;
   })});
  renderFieldView(w);
  renderSourceDescriptions(w);
  renderResearchShortcut(w,sourceHand);
  renderFirstRunGuide(w);
  syncDisabledReasons(w);
  lifeHud.draw();
  document.documentElement.dataset.gameReady='true';
}

// G-6(DISPATCH_SONNET_G3_G6 §2 G-6) — 멀티보드 6열×행(행=플레이어, §5.1 GEM_IDENTITY_MINE_DESIGN §5.1
// "행=플레이어; 값=이름·상태·골드류"). 열 선택(플레이어/골드/라이프/타워/웨이브/상태)은 hud_quests.json
// (부재) 콜사이트60 미확보에 따른 자체 결정(A-G10, RETURN.md 표) — 값 자체는 전부 기존 엔진 상태 재표시.
function updateMultiboard(w) {
  const panel = $("multiboard");
  if (!panel || !w) return;
  panel.style.display = "block";
  const towersByOwner = new Map();
  for (const e of w.sim.entities.values()) {
    if (!e.alive) continue;
    const d = defOf(w, e.typeId);
    if (d?.attack || w.knownGemIds.has(e.typeId)) towersByOwner.set(e.owner, (towersByOwner.get(e.owner) || 0) + 1);
  }
  const rows = [`<tr style="color:var(--dim);font-size:12px"><td>P</td><td>골드</td><td>라이프</td><td>타워</td><td>웨이브</td><td>상태</td></tr>`];
  for (let p = 0; p < 8; p++) {
    if (w.sim.playerState.getSlotState(p) !== 1) continue;
    const gold = Math.floor(w.sim.ledger.gold(p));
    const life = p === 0 ? (gemTowerPlayerState(w.vm,p).life ?? "—") : "—"; // LUMBER 라이프 카운터는 실측상 P0만 갱신(econ_death.json QMe_roundAdvance)
    const twr = towersByOwner.get(p) || 0;
    const wave = w.prepActive ? "준비" : (waveNum > 0 ? waveNum : 1);
    const status = w.gameOver ? (w.gameOver.winner === p ? "승리" : "종료") : "진행";
    rows.push(`<tr><td>${p}</td><td>${gold}</td><td>${life}</td><td>${twr}</td><td>${wave}</td><td>${status}</td></tr>`);
  }
  $("mbTable").innerHTML = rows.join("");
}

// P-1: roleTable(config, GEMTOWER_BALANCE) 밖 하드코딩 0 — 라인/티어 라벨은 데이터에서만 파생.
function gemLabel(typeId) {
  const role = GEMTOWER_BALANCE.roleTable[typeId];
  if (!role) return typeId; // 미등록(예: 라운드 시작 돌변환 h00G) — 발명 대신 원 typeId 그대로 표시
  if (role.kind === "tower") return `${role.line} T${role.tier}`;
  if (role.kind === "static") return role.archetype;
  return typeId;
}

const BUILD_REJECT_LABEL = { "inactive-player":"참가하지 않은 플레이어", "game-over":"게임 종료", "missing-builder": "원작 건설 요청 만료", "insufficient-gold": "골드 부족", "missing-def-store": "정의 누락" };
// G-2c: research() 3종(A-G1 실측 techId) — 뷰포트 패널·버튼 id는 이 목록 순회로 생성.
const RESEARCH_IDS = ["R000", "R001", "R002"];
const RESEARCH_REJECT_LABEL = { "unknown-tech": "미지 연구", "max-level": "만렙", "insufficient-gold": "골드 부족", "prereq-unmet":"선행 연구가 필요합니다" };

function renderTraining(w){
 const rows=trainingActions(w).map(row=>({...row,requirements:(w.sim.defStore?.getDef(row.typeId)?.techRequirements??[]).map(r=>({...r,name:trainingTechName(w,r.techId,r.count),current:w.sim.getPlayerTechCount?.(0,r.techId)??0})).filter(r=>r.current<r.count)})).sort((a,b)=>(a.cost??Infinity)-(b.cost??Infinity)),life=gemTowerPlayerState(w.vm).life,ready=w.modeDialog?.clicked&&gemTowerPlayerState(w.vm).difficulty;
 const stations=gemTowerCasinoState(w.vm,w.sim).stations,sourceOwned=new Set(stations.filter(station=>station.owned).map(station=>station.id)),sourceSpinning=new Set(stations.filter(station=>station.spinning).map(station=>station.id));
 const gold=w.sim.ledger.gold(0),signature=JSON.stringify([rows.map(r=>[r.producerId,r.typeId,r.cost,r.reason,r.requirements]),life,Boolean(ready),gold,playing,w.trainingBatch?.remaining,[...sourceSpinning],[...sourceOwned]]);
 if(w.trainingSignature!==signature){w.trainingSignature=signature;
  const hosts=[$("trainingOptions"),$("casinoTrainingOptions")];
  // Only a new world clears the host. State refreshes keep existing keyed targets attached.
  if(!w.trainingButtons){for(const host of hosts)host.replaceChildren();w.trainingButtons=new Map();}
  const buttons=w.trainingButtons,desired=[];
  for(const row of rows){
   const counts=row.typeId==='h01W'&&life<100&&row.cost>0?[1,Math.max(1,Math.min(10,100-life,Math.floor(gold/row.cost)))]:[1];
   for(const count of [...new Set(counts)])desired.push({row,count,key:`${row.producerId}:${row.typeId}:${count}`,host:hosts[sourceOwned.has(row.producerId)?1:0]});
  }
  const keep=new Set(desired.map(item=>item.key));
  for(const[key,button]of buttons)if(!keep.has(key)){button.remove();buttons.delete(key);}
  for(const host of hosts){let next=host.firstElementChild;
  for(const{row,count,key}of desired.filter(item=>item.host===host)){
   let button=buttons.get(key);
   if(!button){button=document.createElement('button');button.className='sec training-option';button.dataset.producerId=String(row.producerId);button.dataset.trainType=row.typeId;button.dataset.trainCount=String(count);const label=document.createElement('span'),reason=document.createElement('small'),help=document.createElement('small');label.className='training-label';help.className='training-help';help.id=`training-help-${row.producerId}-${row.typeId}-${count}`;help.textContent=sourceButtonHelp(row.typeId);help.hidden=!help.textContent;reason.className='training-reason';reason.id=`training-reason-${row.producerId}-${row.typeId}-${count}`;button.setAttribute('aria-describedby',[help.hidden?'':help.id,reason.id].filter(Boolean).join(' '));button.append(label,help,reason);buttons.set(key,button);}
   const view=trainingOptionView(row,{name:fullName(w,row.typeId),count,life,gold,ready,paused:!playing,batch:Boolean(w.trainingBatch),spinning:sourceSpinning.has(row.producerId)&&['h044','h046'].includes(row.typeId)});
   button.querySelector('.training-label').textContent=view.label;button.querySelector('.training-reason').textContent=view.reason;button.disabled=view.disabled;button.title=view.reason;
   if(button!==next){const focused=document.activeElement===button;host.insertBefore(button,next);if(focused)button.focus();}
   next=button.nextElementSibling;
  }}
 }
 const pending=[...w.sim.pendingTrainings.values()],batch=w.trainingBatch;
 // remaining excludes the accepted current request, which may still be queued before its next tick.
 const current=batch?pending.find(q=>q.producerId===batch.producerId&&q.typeId===batch.typeId):pending[0],queued=rows.some(row=>row.reason==='busy');
 $("trainingStatus").textContent=w.gameOver&&(pending.length||batch)?'게임 종료 · 구입 처리 중단':batch
  ?current?`묶음 구입 중 · 남은 ${batch.remaining+1}회 · 이번 1회: 게임 시간 ${(current.remainingTicks*DT).toFixed(1)}초 남음 · 완료 후 반영`:`묶음 구입 대기 · 남은 ${batch.remaining+1}회 · 1회씩 완료 후 반영`
  :current?`${fullName(w,current.typeId)} · 처리 중 · 게임 시간 ${(current.remainingTicks*DT).toFixed(1)}초 남음${current.typeId==='h01W'?' · 완료 후 반영':''}`:queued?'구입 예약 중 · 재개하면 진행됩니다':life>=100?'최대 수명에 도달했습니다':'';
 if(!playing&&(batch||current))$("trainingStatus").textContent='일시정지 · 상단 재개를 누르면 구입이 진행됩니다 · '+$("trainingStatus").textContent;
 if(w.trainingBatchNotice)$("trainingStatus").textContent=w.trainingBatchNotice+' · '+$("trainingStatus").textContent;
 $("cancelTrainingBatch").hidden=!batch||batch.remaining===0;if(batch)$("cancelTrainingBatch").textContent=`남은 ${batch.remaining}회 예약 취소`;
 const casinoCurrent=pending.find(q=>sourceOwned.has(q.producerId));
 $("casinoUse").hidden=sourceOwned.size===0;
 $("casinoTrainingStatus").textContent=sourceOwned.size===0?'':w.gameOver?'게임 종료 · 시설 이용 중단':!playing?'일시정지 · 상단 재개를 누르면 구입과 추첨이 진행됩니다':batch?$("trainingStatus").textContent:casinoCurrent?`${fullName(w,casinoCurrent.typeId)} · 처리 중 · 게임 시간 ${(casinoCurrent.remainingTicks*DT).toFixed(1)}초 남음`:[...sourceOwned].some(id=>sourceSpinning.has(id))?'추첨 중입니다 · 완료 후 다시 이용할 수 있어요':'코인 투입이나 나가기를 선택하세요';
 $("saveRun").disabled=Boolean(batch)||w.modeDialog?.pendingButtonId!==undefined;
}

function stepN(w, n) {
  for (let i = 0; i < n; i++) {
    w.sim.step();
    // G-6: hp 차분 → 특수뎀/엔진뎀 통합 TextTag(재구현 0 — 엔진이 이미 깎은 hp를 관측만). 사망 유닛은
    // step()에서 제거된 사망 유닛의 마지막 HP 전이는 아래 UnitDied 처리에서 관측한다.
    // U-4a(DISPATCH_SONNET_U4_FIXES §2 U-4a) — 이 순회에 크립(owner=11) 생존 카운트를 얹는다(추가 순회
    // 0, 재발명 0) — 재점화 게이트를 "타이머 꺼짐"만으로 판정하던 U-3b 방식(아래 옛 조건 그대로 복붙)이
    // 웨이브 클리어 여부와 무관하게 40틱(2초)마다 무조건 재점화해 크립을 무계 누적시키는 회귀를 냈다
    // (작가 피드백③ "웨이브 무한히 나옴" — 오케스트레이터 재현: 3000틱 만에 크립 2426체, U-4b owner
    // 필터 수정으로 이 카운트가 처음 정확해진 뒤 실측). U-4b 수정 전에는 이 카운트가 owner=11 크립
    // 전원이 attack def를 가져 항상 0으로 셌으므로(디스패치 §1 "이미 있음" 표기와 달리 실질적으로
    // 死코드) 웨이브클리어 기반 게이트를 U-4b보다 먼저 걸 수 없었다 — 두 결함이 얽혀 있었다.
    let creepsAliveNow = 0;
    for (const e of w.sim.entities.values()) {
      if (e.owner === 11) {
        creepsAliveNow++;
        const role=GEMTOWER_BALANCE.roleTable[e.typeId];
        if(e.orderActive && (role?.kind==="creep"||role?.archetype==="eventBoss")){
          const size=w.pm?.cellSize??32;
          const ax=Math.round(e.prevX/size)*size,ay=Math.round(e.prevY/size)*size,bx=Math.round(e.x/size)*size,by=Math.round(e.y/size)*size;
          const key=`${ax},${ay}:${bx},${by}`;
          if((ax!==bx||ay!==by)&&!w.routeSegments.has(key)){w.routeSegments.set(key,{x:ax,y:ay,toX:bx,toY:by});if(w.routeSegments.size>4096)w.routeSegments.delete(w.routeSegments.keys().next().value);}
        }
      }
      const before = prevHp.has(e.id) ? prevHp.get(e.id) : e.hp;
      if (e.hp < before) spawnTextTag(e.x, e.y, String(before - e.hp) + "!", "#d74e3c"); // "{n}!" 원문 3형 중 특수뎀 형
      prevHp.set(e.id, e.hp);
      // U-2e: lastPos는 이 루프(사망 전 엔티티만 순회) 직후 "Attacked" 이벤트 처리 *전*에 갱신되므로,
      // 이번 틱에 죽은 타겟은 자연히 갱신에서 빠져 직전 틱의 마지막 생존 위치가 남는다(사망 좌표 폴백,
      // 재구현 0 — 위치 보간·추정 없음).
      lastPos.set(e.id, { x: e.x, y: e.y, typeId: e.typeId, owner:e.owner });
    }
    // U-4a: 웨이브 클리어 기반 순차 재점화 — 이번 웨이브가 실제로 크립을 냈었고(waveHasSpawned) 그
    // 크립이 전부 소진(0)됐을 때만 "다음 웨이브 준비 완료"(waveReadyForNext) 플래그를 세운다. 재점화는
    // 그 플래그가 서 있고 타이머가 꺼져 있을 때 1회만 수행 — startWaves()가 쓰는 것과 정확히 동일한
    // 필드·값(재발명 0), 트리거 조건만 "타이머 꺼짐"에서 "타이머 꺼짐 AND 직전 웨이브 클리어 확인"으로
    // 좁혔다. 오케스트레이터 실측(scripts/playgate.mjs 1:1 재현, RETURN §③): 이 게이트로 3000틱에서
    // 크립 최댓값이 2426(무계)→80(웨이브당 상한, 유계)으로, 재점화 간격이 40틱→약 2270~2400틱(실제
    // 스폰+이동+소탕 소요 시간에 종속, 발명 0)으로 정상화된다.
    if (creepsAliveNow > 0) w.waveHasSpawned = true;
    if (w.waveHasSpawned && creepsAliveNow === 0) { w.waveHasSpawned = false; w.waveReadyForNext = true; }
    if (w.vm.getGlobal("Be").v === 1 && !w.prepActive && !w.gameOver && w.waveReadyForNext && w.roundTimer && w.roundTimer.kind === "timer" && !w.roundTimer.data.running) {
      w.roundTimer.data.remainingTicks = 40; w.roundTimer.data.timeoutTicks = 360; w.roundTimer.data.running = true; w.roundTimer.data.periodic = false;
      w.waveReadyForNext = false;
    }
    // G-6: 골드 차분 → "{n} 골드!"/"+{n} 골드"(원문 3형, MAP_DISSECTION §99). P0(로컬 관전 플레이어) 기준.
    const goldNow = w.sim.ledger.gold(0);
    if (goldNow > prevGold[0]) {
      if(!restoring)spawnGoldTag(goldNow - prevGold[0]);
      if((w.viewPlayerId??0)===0)w.fieldFeedback?.emit({kind:'gold',key:`${w.runId}:${w.sim.tickCount}:gold`,x:12,y:122,space:'screen',suppressed:restoring||document.hidden});
    }
    prevGold[0] = goldNow;
    for (const ev of w.sim.drainEvents()) {
      if (ev.kind === "RectEntered") rectEntered++;
      // P-2(경제 단일화, PLAYABLE §5): 뷰포트 킬 수익 근사 제거 — test/web/p2-economy.test.ts가 실측:
      // Source-enabled kill bounty is settled once by the existing ledger; source trigger
      // bonuses remain separate. The viewport only observes deaths and never adds gold.
      else if (ev.kind === "UnitDied") {
        deaths++;
        const hp=prevHp.get(ev.unitId),pos=lastPos.get(ev.unitId);
        observeConfirmedDeathSound(w,ev);
        if(pos&&hp>0)spawnTextTag(pos.x,pos.y,String(hp)+"!","#d74e3c");
        prevHp.delete(ev.unitId);
      }
      // P-4(라이프·승패, PLAYABLE §6): observe 모드 — 라이프 차감 0, 순수 관측 카운트만(엔진이 이미
      // 계산한 gate 판정을 그대로 표면화, D5 — 조용히 삼키지 않는다).
      else if (ev.kind === "LeakObserved") gatePassed++;
      else if (ev.kind === "GameOver") {
        w.gameOver = { winner: ev.winner, tick: w.sim.tickCount };
        queueSoundEvent(w,ev.winner===0?'clear':'defeat',{key:'outcome'});
        w.trainingBatch = null;
        playing = false;
        $("play").textContent = "게임 종료";
      }
      else if(ev.kind==='TrainingFinished'){advanceTrainingBatch(w,ev,ev.typeId==='h01W'&&gemTowerPlayerState(w.vm).life>=100);flash(fullName(w,ev.typeId)+' · 완료');}
      else if(ev.kind==='TrainingRejected'){advanceTrainingBatch(w,ev);flash(TRAIN_REASON[ev.reason]??"구입 조건을 충족하지 못했습니다");}
      else if (ev.kind === "BuildRejected") {
        w.pendingBuilds.shift(); // D5: 조용한 실패 금지 — 큐 적재순 그대로 소비, 사유 표면화
        flash("건설 거부: " + (BUILD_REJECT_LABEL[ev.reason] || ev.reason));
      } else if (ev.kind === "ConstructFinished") {
        if(ev.playerId!==undefined&&ev.playerId!==0)continue;
        // ReplaceUnitBJ는 위치·소유를 승계하되 id를 새로 발급한다(unit-entity.ts replaceEntity 계약) —
        // 원 unitId는 이미 제거돼 있으므로 우리가 큐잉 시 기록해둔 좌표로 결과 엔티티를 찾는다.
        const spot = w.pendingBuilds.shift();
        if (spot) {
          const rolled = [...w.sim.entities.values()].find((e) => e.alive && e.x === spot.x && e.y === spot.y && e.typeId !== "h006" && e.typeId !== "u000");
          flash(rolled ? "설치 완료: " + fullName(w, rolled.typeId) : "건설 완료 · 결과 확인 중");
          if(rolled){showActionSuccess(w,'place',rolled);observeRareGemSound(w,rolled);}
        }
      } else if (ev.kind === "UpgradeFinished") {
        flash("강화 완료: " + fullName(w,ev.targetTypeId));
        if(ev.owner===0)showActionSuccess(w,'upgrade',{id:ev.unitId,typeId:ev.targetTypeId});
      } else if(ev.kind === "UpgradeRejected") {
        flash(ev.reason==='not-owner'?'라운드가 바뀌어 강화를 취소했습니다 · 전투 중 다시 선택하세요':ev.reason==='insufficient-gold'?'강화할 골드가 부족합니다':ev.reason==='busy'?'이미 강화 중입니다':'강화 조건이 바뀌어 요청을 취소했습니다');
      } else if (ev.kind === "AbilityOrderRejected") {
        const index = w.pendingCasts.findIndex(request => request.unitId === ev.unitId && request.abilityId === ev.abilityId);
        if (index >= 0) w.pendingCasts.splice(index, 1);
        flash("시전 거부: " + abilityOrderReason(ev.reason));
      } else if (ev.kind === "SpellCast") {
        const req = w.pendingCasts.find(request => request.unitId === ev.unitId && request.abilityId === ev.abilityId);
        if (req) req.spellTick = w.sim.tickCount;
      } else if (ev.kind === "ResearchFinished" || ev.kind === "ResearchRejected") {
        observeResearchResult(w,ev);
      } else if (ev.kind === "Attacked") {
        if (w.sim.getUnit(ev.attackerUnitId)?.owner === 0) w.observedAttacks++;
        // U-2e: 발사 성공마다(사망 무관, world_api.ts 주석 "G-1") 발화 — 좌표는 lastPos 스냅샷에서
        // 가져온다(위 hp루프가 이번 틱 종료 시점 위치로 갱신, 사망 타겟은 직전 틱 위치 폴백). 색은
        // 공격자 typeId를 gemVisual()에 그대로 통과시켜(재발명 0) 타워 라인색과 시각적으로 연결.
        const atkPos = lastPos.get(ev.attackerUnitId), tgtPos = lastPos.get(ev.targetUnitId);
        if (atkPos && tgtPos) {
          attackFx.push({ x1: atkPos.x, y1: atkPos.y, x2: tgtPos.x, y2: tgtPos.y, color: gemVisual(w, atkPos.typeId).color, born: performance.now() });
        }
      }
    }
    const vmEvents=w.vm.drainEvents();
    for(const event of vmEvents)if(event.kind==='ThreadCrashed')w.runtimeCrashes.push(event);
    for(const result of w.casinoFeedback?.observe(gemTowerCasinoState(w.vm,w.sim),vmEvents,w.sim.tickCount)??[])if(!restoring)flash(result.message);
    flushModeChoice(w);advanceStartupChoice(w);w.observePlayView?.();
    if (!w.cameraFocused) focusPlayer(w);
    // A race wave is started by the actual gem choice/combine trigger, not the timer shim.
    if (w.vm.getGlobal("Be").v === 2 && gemTowerPlayerState(w.vm).chosen === true) w.prepActive = false;
    for (let i = w.pendingCasts.length - 1; i >= 0; i--) {
      const req=w.pendingCasts[i],keptCandidate=w.sim.getUnit(req.unitId);
      const keepNotice=req.abilityId==='A009'?completedKeepNotice({request:req,kept:keptCandidate,chosen:gemTowerPlayerState(w.vm).chosen,rocks:ownedRocks(w),name:keptCandidate?fullName(w,keptCandidate.typeId):''}):null;
      if(keepNotice){w.guideChoiceConfirmed=true;queueSoundEvent(w,'keep',{key:'keep:'+req.unitId});flash(keepNotice);w.pendingCasts.splice(i,1);continue;}
      const observed = observeGemCast(w, req, w.sim.tickCount);
      if (observed.state === "waiting") continue;
      if (observed.result) {
        w.knownGemIds.add(observed.result.typeId);
        if (w.selectedGemId === req.unitId || w.selectedGemId === null) w.selectedGemId = observed.result.id;
        const combined=["A007","A00R","A03M"].includes(req.abilityId);
        flash((combined?"조합 완료: ":"시전 결과: ") + fullName(w, observed.result.typeId));
        if(combined){w.guideChoiceConfirmed=true;showActionSuccess(w,'combine',observed.result);observeRareGemSound(w,observed.result);}
      } else {
        const kept=w.sim.getUnit(req.unitId);
        flash(req.abilityId==='A009'&&kept?.alive&&kept.owner===0&&gemTowerPlayerState(w.vm).chosen===true?keepResultNotice(fullName(w,kept.typeId),kept.id,req.hand,ownedRocks(w)):"능력 사용됨");
      }
      w.pendingCasts.splice(i, 1);
    }
    // P-4: 종결 후에도 sim.step()이 계속 도는 것은 무의미(endGame은 멱등이지만 자원 낭비+오버레이 표시
    // 중 배경이 계속 바뀌는 것은 D5 "관측 가능성"과 무관한 잡음) — 즉시 배치 중단.
    observeGameSoundState(w);flushGameSound(w);
    if (w.gameOver) break;
  }
}

// P-3: castAbility seam(E-3 기존) 호출 — 어빌 id 3종(A00R 조합·A007 유지·A02G 다운그레이드)은
// PLAYABLE_DESIGN §4.3 실측 대표 어휘 하드코딩(레시피 전수는 census 페이징, 값 판정은 스크립트 소유).
function abilityOrderReason(reason) {
  return ({"game-over":"게임이 끝났습니다", "invalid-order":"잘못된 명령", "missing-unit":"유닛 소실", "not-owner":"조종 권한 없음", "missing-ability":"스킬 미보유", "missing-target":"대상 소실", "out-of-range":"시전 사거리를 벗어났습니다", "unreachable":"대상까지 이동할 수 없습니다", "paused":"일시 정지된 유닛입니다", "stunned":"기절 중에는 시전할 수 없습니다", "busy":"강화 중에는 시전할 수 없습니다", "missing-ability-data":"원작 범위 자료가 필요합니다"})[reason] || "검증 실패";
}
function castGem(w, abilityId) {
  if((w.viewPlayerId??0)!==0)return;
  if(w.pendingTargetAbility)cancelGemTarget(w);
  const id = w.selectedGemId;
  if (id === null) return;
  const e = w.sim.getUnit(id);
  if (!e || !e.alive) { flash("젬 소실됨"); w.selectedGemId = null; return; }
  if(abilityId==='A02J'){
    if(armSlateMove(w,id)){flash('이동할 곳을 터치하거나 클릭하세요');w.buildCellsView=null;render(w);}return;
  }
  if (!w.sim.issueAbilityOrder(0, id, abilityId)) { flash("시전 거부: " + abilityOrderReason(w.sim.validateAbilityOrder(0, id, abilityId))); return; }
  recordInput(w,{kind:"ability",playerId:0,unitId:id,abilityId});
  const request=captureGemCast(w,e,abilityId);
  if(abilityId==='A009')request.hand=Array.from({length:5},(_,i)=>w.vm.getGlobalIndexed('I',i+1)).map(h=>h.t==='handle'&&h.v!==null?w.sim.getUnit(h.v):null).filter(e=>e?.alive).map(e=>({id:e.id,x:e.x,y:e.y}));
  w.pendingCasts.push(request);
  flash("능력 사용을 요청했습니다");
}

function requestCasinoApproach(w,stationId){
 if(!w||w.gameOver||(w.viewPlayerId??0)!==0)return false;
 const casino=gemTowerCasinoState(w.vm,w.sim),station=casino.stations.find(s=>s.id===stationId),entry=station?.entry;
 if(!station?.canApproach||!Number.isSafeInteger(casino.gamblerId)||casino.gamblerId<=0||!Number.isFinite(entry?.x)||!Number.isFinite(entry?.y)){flash('지금은 입장할 수 없습니다 · 빠칭코 상태를 확인하세요');return false;}
 const accepted=w.sim.issueMoveOrder(0,casino.gamblerId,entry.x,entry.y);
 recordInput(w,{kind:'move',playerId:0,unitId:casino.gamblerId,x:entry.x,y:entry.y,accepted});
 flash(accepted?(station.viaEntrance?'입구까지 이동합니다 · 도착 후 입장을 누르세요':'타짜 이동을 요청했습니다'):'타짜 이동 요청이 거부되었습니다');render(w);return accepted;
}

// Source slots select their live unit directly; a filtered roster is only a view.
function selectGemById(w,id){
 if(!w)return false;
 if((w.viewPlayerId??0)!==0)switchField(w,0);
 if(w.pendingTargetAbility){const accepted=requestGemTarget(w,id);render(w);return accepted;}
 const unit=w.sim.getUnit(id);if(!unit?.alive||unit.owner!==0&&!gemTowerPlayerGemIds(w.vm).includes(unit.id))return false;
 w.pendingPlacement=null;w.hover=null;
 if(w.overlapPick&&!w.overlapPick.ids.includes(unit.id))w.overlapPick=null;
 if(unit.typeId!=="h00G")w.showRocks=false;
 w.pendingPointAbility=null;w.pendingCombatFocus=false;w.selectedGemId=unit.id;
 const explorer=$("ownedExplorer");if(explorer)explorer.open=false;
 render(w);return true;
}

function requestGemTarget(w,targetUnitId){
 if((w.viewPlayerId??0)!==0)return false;
 const reason=gemTargetReason(w,targetUnitId);
 if(reason!==null){flash(reason==='invalid-target'?'교환할 다른 내 보석이나 바위를 선택하세요':abilityOrderReason(reason));return false;}
 const accepted=issueGemTarget(w,targetUnitId);flash(accepted?'교환 명령을 전달했습니다':'지금은 교환 명령을 전달할 수 없습니다');return accepted;
}

// Local-only review controls: record the actual battlefield canvas plus the
// same WebAudio gains sent to the speakers; no microphone or display capture.
function installLocalSoundReview() {
 if(!isLocalGameHost(location.hostname))return;
 const host=$('advancedOptions');if(!host)return;
 const details=document.createElement('details'),summary=document.createElement('summary'),note=document.createElement('p'),record=document.createElement('button'),stop=document.createElement('button'),show=document.createElement('button'),output=document.createElement('textarea');
 details.id='soundReview';summary.textContent='소리 점검';note.id='soundReviewStatus';note.className='local-note';note.textContent='이 맥의 전장 화면과 게임 소리만 녹화합니다 · 최대 5분';
 record.type=stop.type=show.type='button';record.className=stop.className=show.className='sec';record.textContent='전장 녹화 시작';stop.textContent='녹화 마치고 저장';stop.disabled=true;show.textContent='소리 기록 보기';output.id='soundReviewLog';output.readOnly=true;output.rows=10;output.setAttribute('aria-label','소리 재생 기록');
 const choose=document.createElement('select'),tryCue=document.createElement('button');choose.setAttribute('aria-label','개별 소리 점검');
 const labels={place:'설치',combine:'조합',upgrade:'강화',waveStart:'웨이브 시작',lifeLoss:'생명 감소',kill:'처치',boss:'보스',air:'공중',keep:'남기기',rare:'희귀 보석',research:'연구 완료',waveGold:'웨이브 골드',tap:'버튼',defeat:'패배',clear:'클리어'};
 for(const [value,label]of Object.entries(labels)){const option=document.createElement('option');option.value=value;option.textContent=label;choose.append(option);}choose.value='place';tryCue.type='button';tryCue.className='sec';tryCue.textContent='선택한 소리 듣기';
 tryCue.onclick=async()=>{const kind=choose.value;if(!Object.hasOwn(H_AUDIO_CUES,kind))return;await actionAudio.unlock();const played=actionAudio.play(kind,{origin:'controlled',kind,runId:world?.runId??'review',tick:world?.sim.tickCount??0,key:'controlled:'+Date.now()});note.textContent=played?'개별 소리 점검 · '+labels[kind]:'소리가 꺼져 있거나 준비 중입니다';};
 details.append(summary,note,record,stop,choose,tryCue,show,output);host.append(details);
 soundRecording=createGameRecording({canvas:cv,audio:actionAudio,onState:state=>{record.disabled=['recording','starting','stopping'].includes(state.state);stop.disabled=!['recording','starting','ready'].includes(state.state);note.textContent=({idle:'녹화를 시작할 수 있습니다',starting:'소리와 화면을 준비하고 있습니다',recording:'전장 화면과 게임 소리 녹화 중 · 최대 5분',stopping:'녹화 파일을 준비하고 있습니다',ready:'녹화가 끝났습니다',unsupported:'이 브라우저에서 소리 포함 녹화를 준비하지 못했습니다',failed:'녹화를 준비하지 못했습니다 · 게임은 계속할 수 있습니다'})[state.state];}});
 record.onclick=async()=>{await soundRecording.start();};
 stop.onclick=async()=>{const blob=await soundRecording.stop();if(!blob?.size)return;const link=document.createElement('a'),url=URL.createObjectURL(blob);link.href=url;link.download='gemtower-sound-'+Date.now()+(blob.type.includes('mp4')?'.mp4':'.webm');link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 show.onclick=()=>{output.value=JSON.stringify({build:contentBuild,replayBuild,recordedAt:new Date().toISOString(),game:world?{runId:world.runId,tick:world.sim.tickCount,hash:world.sim.stateHash(),state:gemTowerPlayerState(world.vm)}:null,sound:actionAudio.snapshot(),recording:soundRecording.snapshot()},null,2);};
}

// Sound is an observer of actual source completion, never an input or saved state.
function queueSoundEvent(w,kind,details={}) {
 if(!w||w!==world||restoring||loadingRun||runtimeFailed||document.hidden||(w.viewPlayerId??0)!==0)return false;
 (w.soundQueue??=[]).push({kind,playerId:0,...details});if(w.soundQueue.length>128)w.soundQueue.shift();return true;
}
function observeConfirmedDeathSound(w,ev) {
 const snapshot=w.soundDeaths?.get(ev.unitId);w.soundDeaths?.delete(ev.unitId);
 const unit=snapshot?.unit??lastPos.get(ev.unitId),owner=snapshot?.creditedOwner??snapshot?.killer?.owner??w.sim.getUnit(ev.killerUnitId)?.owner,bounds=w.mobileFields?.[0]?.bounds;
 if(unit?.owner===11&&bounds&&pointInBattlefield(unit,bounds)&&owner===0)queueSoundEvent(w,'kill',{key:'killed-unit:'+ev.unitId,unitId:ev.unitId});
}
function observeRareGemSound(w,unit) {
 const family=gemTowerGemFamily(fullName(w,unit.typeId)),grade=gemGradePresentation(family?.grade),view=gemObjectPresentation(unit.typeId,defOf(w,unit.typeId),family,sprites.aliases[unit.typeId]);
 if(grade?.rank>=4||view.kind==='special')queueSoundEvent(w,'rare',{key:'rare:'+unit.id,unitId:unit.id,rank:grade?.rank??0,special:view.kind==='special'});
}
function observeGameSoundState(w) {
 const state=sourceWaveState(w),life=gemTowerPlayerState(w.vm).life,gold=w.sim.ledger.gold(0),previous=w.soundState,round=state.round;
 if(previous&&Number.isFinite(life)&&life<previous.life)queueSoundEvent(w,'life-loss',{key:'life:'+w.sim.tickCount,amount:previous.life-life});
 if(previous&&round>previous.round&&gold>previous.gold)queueSoundEvent(w,'wave-gold',{key:'wave:'+round,amount:gold-previous.gold});
 const bounds=w.mobileFields?.[0]?.bounds,enemy=bounds?[...w.sim.entities.values()].find(unit=>unit.alive&&unit.owner===11&&pointInBattlefield(unit,bounds)):null;
 if(enemy&&!w.soundWaveSeen.has(round)){
  w.soundWaveSeen.add(round);const role=GEMTOWER_BALANCE.roleTable[enemy.typeId],visual=creepVisualPresentation(role,defOf(w,enemy.typeId));
  queueSoundEvent(w,'wave-start',{key:'wave:'+round,round});if(visual.airborne)queueSoundEvent(w,'air',{key:'wave:'+round,round});if(visual.band==='boss')queueSoundEvent(w,'boss',{key:'wave:'+round,round});
 }
 w.soundState={round,life,gold};
}
function flushGameSound(w) {
 if(!w?.soundRouter)return;const events=w.soundQueue.splice(0),state=sourceWaveState(w);
 for(const call of w.soundCalls.splice(0)){const source=sourceCueForCall(call);if(!source)continue;events.push({kind:'source-call',call,key:source.kind==='life-loss'?'life:'+call.tick:'wave:'+state.round});}
 const cueNames={'wave-start':'waveStart','life-loss':'lifeLoss','wave-gold':'waveGold'};
 for(const event of w.soundRouter.route(events,{runId:w.runId,tick:w.sim.tickCount,speed:tps,restoring:restoring||loadingRun,hidden:document.hidden||(w.viewPlayerId??0)!==0,failed:runtimeFailed})){
  actionAudio.play(cueNames[event.cue]??event.cue,{...event,playerId:0,round:state.round,sourceCaller:event.source?.caller,sourceLine:event.source?.line,sourceSymbol:event.source?.reference?.symbol,sourceIndex:event.source?.reference?.index});
 }
}
function syncGameSound(w) {
 const suppressed=!w||w!==world||restoring||loadingRun||runtimeFailed||document.hidden||w.gameOver||!w.modeDialog?.clicked||!gemTowerPlayerState(w.vm).difficulty;
 actionAudio.setPhase(suppressed?null:sourceWaveState(w).chosen?'combat':'prepare',{runId:w?.runId,tick:w?.sim.tickCount,playerId:0});
}

function showActionSuccess(w,kind,unit) {
 if(!w||w!==world||restoring||loadingRun||runtimeFailed||document.hidden||w.gameOver||!unit?.id)return null;
 if(kind==='combine'&&(w.viewPlayerId??0)===0){const actual=w.sim.getUnit(unit.id);if(actual?.alive)w.fieldFeedback?.emit({kind:'combine',key:`${w.runId}:${w.sim.tickCount}:combine:${unit.id}`,x:actual.x,y:actual.y,space:'world'});}
 return actionFeedback.confirm({key:`${w.runId}:${w.sim.tickCount}:${kind}:${unit.id}`,kind,unitId:unit.id,name:fullName(w,unit.typeId)});
}

function flash(t) { flashMsg = ""; flashUntil = performance.now() + 1800;gemSkin.notify(t); }

function virtualTouchActive(){return isLocalGameHost(location.hostname.replace(/\.$/,''))&&$('qaTouchDevice')?.checked===true;}
function syncRotationGate(){
 const screen=$('rotateScreen');if(!screen)return false;
 const qa=virtualTouchActive(),active=document.activeElement;
 const editing=Boolean(active?.isContentEditable||active?.tagName==='TEXTAREA'||active?.tagName==='INPUT'&&!['checkbox','radio','range','button','submit','reset','file','color','hidden'].includes(active.type));
 const physical=window.screen?.orientation?.type??(typeof window.orientation==='number'?(Math.abs(window.orientation)===90?'landscape':'portrait'):null);
 const blocked=!restoring&&isShortTouchLandscape({touch:qa||coarsePointer.matches||navigator.maxTouchPoints>0,width:window.innerWidth,height:window.innerHeight,orientation:qa?null:physical,editing});
 const root=document.documentElement,changed=root.dataset.rotationBlocked!==String(blocked);
 if(changed)root.dataset.rotationBlocked=String(blocked);if(screen.hidden!==!blocked)screen.hidden=!blocked;
 if(blocked&&(playing||changed)){playing=false;frameClock.reset();interruptUiOrders(world);checkpointRun(world,true);if(world)renderControls(world);}
 if(blocked&&root.dataset.loadState==='ready'&&active!==screen&&!active?.closest?.('#qaDevicePanel'))screen.focus({preventScroll:true});
 return blocked;
}

function loop(now = performance.now()) {
  requestAnimationFrame(loop);
  // loadFromUrl holds playing=false until the new source world accepts startup.
  // Then let its existing fixed-step startup delay overlap art loading. Inputs,
  // sound and checkpoints remain guarded by loadingRun and the loading overlay.
  if(runtimeFailed||loadingRun&&!playing)return;
  try{
    world?.syncDeviceView?.();
    const ticks=frameClock.advance(now,Boolean(world&&playing&&!restoring),tps);
    if(world&&!restoring){if(ticks>0)stepN(world,ticks);render(world);world.viewFeedback?.render(world.selectedGemId);checkpointRun(world);}
  }catch(error){runtimeFailed=true;playing=false;quietActionFeedback();frameClock.reset();window.showErr('게임 화면 오류',error);}
}

function resize() { resizeCanvasToHost(cv,cv.parentElement.getBoundingClientRect()); }
const queueResize=createFrameTask(resize);
window.addEventListener("resize",queueResize);
window.addEventListener("resize",()=>world?.syncDeviceView?.());
new ResizeObserver(queueResize).observe(cv.parentElement);

// P8 original 1.28 UnitData + 4x4SimpleSolid pathing image: h006/h00G occupy
// 4 WPM cells per side (128 units). Keep legacy fallback only when local identity is absent.
const BUILD_GRID_CELLS = 2; // legacy fallback only; original 1.28 hgtw is 4x4 WPM cells.
function buildGridCells(w){return defOf(w,"h006")?.pathing?.width??BUILD_GRID_CELLS;}
function buildBlockAt(pm, worldX, worldY, cells=BUILD_GRID_CELLS) {
  const c = worldToCell(pm, worldX, worldY);
  if (!c) return null;
  return { blockCol: Math.floor(c.col / cells) * cells, blockRow: Math.floor(c.row / cells) * cells };
}
function blockCenter(pm, blockCol, blockRow, cells=BUILD_GRID_CELLS) {
  const half = (cells - 1) / 2;
  return { x: pm.originX + (blockCol + half) * pm.cellSize, y: pm.originY + (blockRow + half) * pm.cellSize };
}
function isBlockBuildable(pm, blockCol, blockRow, cells=BUILD_GRID_CELLS) {
  for (let dr = 0; dr < cells; dr++) {
    for (let dc = 0; dc < cells; dc++) {
      const col = blockCol + dc, row = blockRow + dr;
      if (col < 0 || col >= pm.width || row < 0 || row >= pm.height) return false;
      const f = pm.cells[row * pm.width + col];
      if (f & FLAG_NO_BUILD || f & FLAG_NO_WALK) return false;
    }
  }
  return true;
}

function canPlaceBlock(w,col,row,cells){
 if(!isBlockBuildable(w.pm,col,row,cells))return false;
 const point=blockCenter(w.pm,col,row,cells),half=cells*w.pm.cellSize/2,b=w.viewBounds;
 if(b&&(point.x-half<b.minX||point.x+half>b.maxX||point.y-half<b.minY||point.y+half>b.maxY))return false;
 return !w.sim.navigation||w.sim.navigation.canBuild('h006',point.x,point.y,(w.pendingBuilds??[]).map(spot=>({typeId:'h006',...spot})));
}
function placeTower(w, worldX, worldY) {
  if((w.viewPlayerId??0)!==0){flash("상대 전장은 관전 중입니다 · 내 전장으로 돌아오세요");return false;}
  if (!w.pm) { flash("건설 불가 (지형 없음)"); return false; }
  const blk = buildBlockAt(w.pm, worldX, worldY,buildGridCells(w));
  // U-3c 부수 수정: "파란칸"은 U-2a(지형 재배색) 이전 텍스트 — 건설 펜이 초록으로 바뀐 뒤 갱신 안 된
  // 잔재(오케스트레이터 U-2a 세션의 orphan, 이번 세션이 발견). 초록칸으로 정정(로직 무변경, 문구만).
  if (!blk || !canPlaceBlock(w, blk.blockCol, blk.blockRow,buildGridCells(w))) { flash("지형이나 다른 건물과 겹칩니다"); return false; }
  if (remainingBuildSlots(gemTowerPlayerState(w.vm),w.pendingBuilds) === 0) { flash(w.pendingBuilds.length?"다섯 개 예약 완료 · 재개해서 완성하세요":"다섯 개 완성 · 보석을 선택하거나 조합하세요"); return false; }
  const { x, y } = blockCenter(w.pm, blk.blockCol, blk.blockRow,buildGridCells(w));
  const half = (buildGridCells(w) * w.pm.cellSize) / 2; // 블록 중심 간 최소 간격의 절반(같은 블록 중복 감지)
  if(!w.sim.navigation)for (const e of w.sim.entities.values()) { if (e.alive && Math.abs(e.x - x) < half && Math.abs(e.y - y) < half) { const d = defOf(w, e.typeId); if (d && d.attack) { flash("이미 타워 있음"); return false; } } }
  const state=gemTowerPlayerState(w.vm);
  if(w.gameOver){flash("게임이 종료되었습니다");return false;}
  if(!w.modeDialog?.clicked||!state.difficulty){flash("게임 방식과 난이도를 먼저 선택하세요");return false;}
  if(state.chosen===true){flash("웨이브가 끝나면 다음 보석을 지을 수 있어요");return false;}
  if (!w.sim.placeStructure(0, "h006", x, y)) { flash("건설할 수 없는 위치입니다"); return false; }
  recordInput(w,{kind:"place",playerId:0,typeId:"h006",x,y});
  w.pendingBuilds.push({ x, y });w.hover=null;w.buildCellsView=null;
  flash("보석을 짓고 있어요");
  return true;
}

// P-3: 클릭한 지점에 이미 젬(공격 가능 엔티티)이 있으면 선택(패널 오픈), 없으면 기존 건설(P-1)로.
function renderBuildCells(w){
 if((w.viewPlayerId??0)!==0){$("buildCells").hidden=true;$("cancelPoint").hidden=true;return;}
 if(w.pendingTargetAbility){$("buildCells").hidden=true;$("cancelPoint").hidden=true;return;}
 let point=w.pendingPointAbility;if(point&&w.sim.validateAbilityOrder(0,point.unitId,point.abilityId)!==null){w.pendingPointAbility=null;point=null;}
 $("cancelPoint").hidden=!point;
 const overlay=$("buildCells"),state=gemTowerPlayerState(w.vm),ready=w.pm&&w.modeDialog?.clicked&&state.difficulty&&!state.chosen&&remainingBuildSlots(state,w.pendingBuilds)>0&&!w.gameOver;
 overlay.hidden=!(ready||point);if(overlay.hidden)return;
 overlay.setAttribute("aria-label",point?"슬레이트 이동 위치":"건설 가능한 칸");
 const key=[cam.cx,cam.cy,cam.zoom,cv.width,cv.height,state.buildCount,Math.floor(w.sim.tickCount/4),w.pendingBuilds.length,point?.unitId??0].join(':');if(w.buildCellsCheck===key)return;w.buildCellsCheck=key;
 const cells=buildGridCells(w),rect=cv.getBoundingClientRect(),sx=rect.width/cv.width,sy=rect.height/cv.height,size=cells*w.pm.cellSize;
 const blocks=visibleBuildBlocks(w.pm,cam,cv.width,cv.height,cells).filter(b=>{const p=blockCenter(w.pm,b.col,b.row,cells);if(point)return w.sim.validatePointAbilityOrder(0,point.unitId,point.abilityId,p.x,p.y)===null;return canPlaceBlock(w,b.col,b.row,cells);});
 const viewKey=JSON.stringify([cam.cx,cam.cy,cam.zoom,cv.width,cv.height,Boolean(point),blocks]);if(w.buildCellsView===viewKey)return;w.buildCellsView=viewKey;
 const keep=new Set();for(const {col,row} of blocks){const id=`${col}:${row}`;keep.add(id);let button=overlay.querySelector(`[data-cell="${id}"]`);if(!button){button=document.createElement('button');button.className='build-cell';button.dataset.cell=id;overlay.append(button);}button.textContent=point?'◎':'+';button.setAttribute('aria-label',`${point?'슬레이트 이동':'보석 건설'} ${row/cells+1}행 ${col/cells+1}열`);const p=blockCenter(w.pm,col,row,cells);button.dataset.x=p.x;button.dataset.y=p.y;const box=screenFootprintBox(p,size,cam,cv.width,cv.height);button.style.left=(box.left*sx)+'px';button.style.top=(box.top*sy)+'px';button.style.width=(box.width*sx)+'px';button.style.height=(box.height*sy)+'px';}
 for(const button of [...overlay.children])if(!keep.has(button.dataset.cell))button.remove();
}
$("buildCells").addEventListener('focusin',event=>{const button=event.target.closest('.build-cell');if(!button||!world?.pm||world.pendingPlacement)return;const x=Number(button.dataset.x),y=Number(button.dataset.y);world.hoverGemId=null;world.hover={cx:x,cy:y,...buildBlockAt(world.pm,x,y,buildGridCells(world))};render(world);});
$("buildCells").addEventListener('focusout',event=>{if(event.relatedTarget?.closest?.('.build-cell')||drag.on||!world||world.pendingPlacement)return;world.hover=null;render(world);});
$("buildCells").addEventListener('click',event=>{const button=event.target.closest('.build-cell');if(event.detail===0&&button&&world){if(world.pendingTargetAbility)requestGemTarget(world,null);else if(world.pendingPointAbility)requestSlateDestination(world,Number(button.dataset.x),Number(button.dataset.y));else if(world.precisePlacement)previewPlacement(world,Number(button.dataset.x),Number(button.dataset.y));else placeTower(world,Number(button.dataset.x),Number(button.dataset.y));render(world);}});

function gemNear(w, worldX, worldY, candidateIds=null, all=false) {
  let best = null, bestD2 = Infinity;const hits=all?[]:null;
  for (const e of w.sim.entities.values()) {
    if (!e.alive || e.typeId === "u000" || candidateIds&&!candidateIds.has(e.id)) continue;
    const d = defOf(w, e.typeId);
    if (!isGemSelectable(e, d)) continue;
    const d2 = (e.x - worldX) ** 2 + (e.y - worldY) ** 2;
    const cell=w.pm?.cellSize??32,halfX=Math.max(24,(d?.pathing?.width??buildGridCells(w))*cell/2),halfY=Math.max(24,(d?.pathing?.height??buildGridCells(w))*cell/2);
    if (Math.abs(e.x-worldX)<=halfX&&Math.abs(e.y-worldY)<=halfY) {
      if(hits)hits.push({entity:e,d2,order:hits.length});
      if(d2<bestD2){best=e;bestD2=d2;}
    }
  }
  return hits?hits.sort((a,b)=>a.d2-b.d2||a.order-b.order).map(hit=>hit.entity):best;
}

function overlapChoices(w){
 if(!w?.overlapPick||(w.viewPlayerId??0)!==0||w.pendingTargetAbility||w.pendingPointAbility||w.gameOver||restoring||loadingRun)return [];
 const point=w.overlapPick,ids=new Set(point.ids.filter(id=>w.gemTargetCandidateIds?.has(id)));
 const hits=gemNear(w,point.x,point.y,ids,true);
 if(hits.length<2){w.overlapPick=null;return [];}
 return hits;
}

function selectOverlapGem(w,id){
 if(!overlapChoices(w).some(unit=>unit.id===id)){if(w){w.overlapPick=null;render(w);}return false;}
 const accepted=selectGemById(w,id);if(!accepted){w.overlapPick=null;render(w);}return accepted;
}

function selectMapGem(w,x,y,visualOnly=false){
 let choices=gemNear(w,x,y,w.gemTargetCandidateIds??new Set(),true);
 if(visualOnly)choices=visibleGemChoices(choices,x,y,{zoom:cam.zoom,footprintPixels:buildGridCells(w)*(w.pm?.cellSize??32)*cam.zoom});
 if(!choices.length)return false;
 w.overlapPick=choices.length>1?{x,y,ids:choices.map(unit=>unit.id)}:null;
 return selectGemById(w,choices[0].id);
}

function clearPlacement(w){
 if(!w)return;if(w.precisionCamera)resetPrecisionView(w);if(w.placementLoupe)w.placementLoupe=null;w.pendingPlacement=null;w.hover=null;w.hoverGemId=null;
}
function previewPlacement(w,x,y){
 const block=w.pm&&buildBlockAt(w.pm,x,y,buildGridCells(w)),state=gemTowerPlayerState(w.vm);
 if(!block||w.gameOver||!w.modeDialog?.clicked||!state.difficulty||state.chosen||remainingBuildSlots(state,w.pendingBuilds)===0||!canPlaceBlock(w,block.blockCol,block.blockRow,buildGridCells(w))){clearPlacement(w);flash('이 위치에는 건설할 수 없습니다');return false;}
 const point=blockCenter(w.pm,block.blockCol,block.blockRow,buildGridCells(w));
 w.pendingPlacement=point;w.overlapPick=null;w.hover={cx:point.x,cy:point.y,...block};w.hoverGemId=null;
 flash('길과 위치를 확인한 뒤 아래 건설을 누르세요');return true;
}
function smallPlacementAtCurrentZoom(w,pointerType,rect){
 if(!w?.pm||!cv.width)return false;
 return smallCellNeedsConfirmation({pointerType,cellCssPx:buildGridCells(w)*w.pm.cellSize*cam.zoom*rect.width/cv.width});
}
function renderPlacement(w){
 if(w.pendingPlacement&&(w.gameOver||(w.viewPlayerId??0)!==0||w.pendingTargetAbility||w.pendingPointAbility||gemTowerPlayerState(w.vm).chosen||remainingBuildSlots(gemTowerPlayerState(w.vm),w.pendingBuilds)===0))clearPlacement(w);
 const point=w.pendingPlacement,confirm=$("placementConfirm");if(confirm.hidden!==!point)confirm.hidden=!point;
 const app=$('gameApp');const small=String(Boolean(point&&w.placementLoupe));if(app&&app.dataset.smallPlacement!==small)app.dataset.smallPlacement=small;
 if(point){confirm.dataset.x=String(point.x);confirm.dataset.y=String(point.y);}
 if(point)$("placementHint").textContent='길과 위치 확인 중 · 사거리는 건설 후 확정돼요';
}
function renderPlacementLoupe(w){
 const host=$('placementLoupe'),point=w.pendingPlacement,anchor=w.placementLoupe;if(!host)return;
 host.hidden=!point||!anchor;if(host.hidden)return;
 const rect=cv.getBoundingClientRect(),box=placementLoupeBox({width:rect.width,height:rect.height,fingerX:anchor.clientX-rect.left,fingerY:anchor.clientY-rect.top});
 if(!box){host.hidden=true;return;}host.style.left=box.left+'px';host.style.top=box.top+'px';host.style.width=box.size+'px';
 const image=$('placementLoupeImage');if(image.width!==box.size)image.width=box.size;if(image.height!==box.size)image.height=box.size;
 if(!drawPlacementLoupe(image.getContext('2d'),cv,{x:W2SX(point.x),y:W2SY(point.y)},{cellPixels:buildGridCells(w)*w.pm.cellSize*cam.zoom}))host.hidden=true;
}
$("confirmPlacement").onclick=()=>{if(!world?.pendingPlacement)return;const point=world.pendingPlacement;clearPlacement(world);placeTower(world,point.x,point.y);render(world);};
$("precisePlacement").onchange=()=>{if(world){world.precisePlacement=$("precisePlacement").checked;clearPlacement(world);render(world);}};
$("cancelPlacement").onclick=()=>{if(world){clearPlacement(world);flash('건설 미리보기를 취소했습니다');render(world);}};
$('precisionOverview').onclick=()=>{if(world){resetPrecisionView(world);render(world);}};

function requestSlateDestination(w,x,y){
 if((w.viewPlayerId??0)!==0)return;
 const request=w.pendingPointAbility;
 if(issueSlateMove(w,x,y)){w.buildCellsView=null;flash('이동 명령을 전달했습니다');}
 else if(request)flash(abilityOrderReason(w.sim.validatePointAbilityOrder(0,request.unitId,request.abilityId,x,y)));
}
// Pointer Events share the same tap/drag/cancel path for mouse, touch and pen.
surface.addEventListener("pointerdown", (ev) => {
  if(ev.target!==cv&&!ev.target.closest?.(".build-cell"))return;
  if(ev.button!==0)return;
  try{surface.setPointerCapture(ev.pointerId);}catch{ /* Already-ended or virtual QA pointer; the shared gesture still owns cancellation. */ }
  if(precisionPointer(world,'down',ev))return;
  if(ev.isPrimary===false){drag.on=false;return;}
  drag.cell=ev.target.closest?.(".build-cell")??null;
  if(world?.pm&&drag.cell&&!world.pendingPlacement){world.hoverGemId=null;const block=buildBlockAt(world.pm,Number(drag.cell.dataset.x),Number(drag.cell.dataset.y),buildGridCells(world));world.hover={cx:Number(drag.cell.dataset.x),cy:Number(drag.cell.dataset.y),...block};render(world);}
  drag.on=true;drag.moved=false;drag.id=ev.pointerId;drag.sx=ev.clientX;drag.sy=ev.clientY;drag.pointerType=world?.uiPointerType?.(ev)??ev.pointerType;drag.startedAt=ev.timeStamp;
});
surface.addEventListener("pointerup", (ev) => {
  if(precisionPointer(world,'up',ev))return;
  if(!drag.on||ev.pointerId!==drag.id)return;
  const gesture=classifyMapGesture(drag,ev),tap=!drag.moved&&gesture!=="cancel";
  drag.on=false;
  if(!tap&&world&&!world.pendingPlacement)world.hover=null;
  if(tap&&world&&(world.viewPlayerId??0)===0){
    const r=cv.getBoundingClientRect();
    if(ev.clientX<r.left||ev.clientX>r.right||ev.clientY<r.top||ev.clientY>r.bottom)return;
    const wx=S2WX((ev.clientX-r.left)*cv.width/r.width),wy=S2WY((ev.clientY-r.top)*cv.height/r.height);
    if(world.pendingTargetAbility)requestGemTarget(world,gemNear(world,wx,wy,world.gemTargetCandidateIds)?.id??null);
    else if(world.pendingPointAbility)requestSlateDestination(world,drag.cell?Number(drag.cell.dataset.x):wx,drag.cell?Number(drag.cell.dataset.y):wy);
    else if(!selectMapGem(world,wx,wy,Boolean(drag.cell))){
      world.overlapPick=null;const x=drag.cell?Number(drag.cell.dataset.x):wx,y=drag.cell?Number(drag.cell.dataset.y):wy;
      if(!drag.cell&&gemNear(world,wx,wy))world.selectedGemId=gemNear(world,wx,wy).id;
      else{
       const small=world.confirmSmallPlacement?.(drag.pointerType??ev.pointerType,r)===true;
       if(gesture==='preview'||world.precisePlacement||small){const shown=previewPlacement(world,x,y);if(shown&&small)world.placementLoupe={clientX:ev.clientX,clientY:ev.clientY};else if(world.placementLoupe)world.placementLoupe=null;}
       else{world.pendingPlacement=null;placeTower(world,x,y);}
      }
    }
    render(world);
  }
});
surface.addEventListener("pointercancel",ev=>{precisionPointer(world,'cancel',ev);drag.on=false;if(world&&!world.pendingPlacement){world.hover=null;world.hoverGemId=null;}});
surface.addEventListener("lostpointercapture",ev=>{precisionPointer(world,'cancel',ev);drag.on=false;});
surface.addEventListener("pointermove", (ev) => {
  if(precisionPointer(world,'move',ev))return;
  if(ev.isPrimary===false)return;
  const r = cv.getBoundingClientRect();
  const px = (ev.clientX - r.left) * cv.width / r.width, py = (ev.clientY - r.top) * cv.height / r.height;
  mouseScreen.x = px; mouseScreen.y = py;
  if (drag.on && ev.pointerId===drag.id) {
    if (classifyMapGesture(drag,ev)==="cancel") drag.moved = true;
    return;
  }
  if (world&&!world.pendingPlacement) {
    const wx = S2WX(px), wy = S2WY(py);
    // U-1a: 호버 프리뷰도 건설과 동일한 2×2 블록 스냅(단일 셀 아님) — placeTower와 동일 좌표 계산 재사용.
    if (world.pm) {
      const blk = buildBlockAt(world.pm, wx, wy,buildGridCells(world));
      if (blk) { const p = blockCenter(world.pm, blk.blockCol, blk.blockRow,buildGridCells(world)); world.hover = { x: wx, y: wy, cx: p.x, cy: p.y, blockCol: blk.blockCol, blockRow: blk.blockRow }; }
      else world.hover = null;
    }
    // U-1c: 호버 대상 젬 감지(선택과 독립) — gemNear는 클릭 선택에서 이미 쓰던 탐색 그대로 재사용(발명 0).
    world.hoverGemId = drag.on ? null : (gemNear(world, wx, wy)?.id ?? null);
  }
});
surface.addEventListener('pointerleave',()=>{if(!drag.on&&world&&!world.pendingPlacement){world.hover=null;world.hoverGemId=null;}});
surface.addEventListener('contextmenu',event=>{if(event.target===cv||event.target.closest?.('.build-cell'))event.preventDefault();});
surface.addEventListener('wheel',event=>{
 if(event.target!==cv&&!event.target.closest?.('.build-cell')||!precisionViewActive(world))return;
 const camera=world.precisionCamera,r=cv.getBoundingClientRect(),delta=event.deltaY*(event.deltaMode===1?16:event.deltaMode===2?cv.height:1);
 const result=camera.zoomAt({x:(event.clientX-r.left)*cv.width/r.width,y:(event.clientY-r.top)*cv.height/r.height},camera.snapshot().scale*Math.exp(-delta*.002));
 event.preventDefault();if(result.changed){drag.on=false;drag.cell=null;render(world);}
},{passive:false});
function focusPlayer(w) {
  w.precisionCamera?.reset();
  w.cameraMode='fit';fitPlayerField(w);w.cameraFocused=true;
}

function startWaves(w) {
  w.prepActive = false;
  // P-5: 라운드 킥 shim(계약 — boot()의 최초 킥과 동일 근거·동일 필드). ▶/스킵으로 웨이브를 개시할
  // 때마다 재적용해야 하는 이유는 준비시간 중엔 아직 첫 시동을 걸지 않았기 때문(스크립트가 스스로
  // 감지할 방법이 없는 갭 — 위 boot() 주석 참조, 대체 조건 동일: X-1 다이얼로그 UI).
  if (w.roundTimer && w.roundTimer.kind === "timer") { w.roundTimer.data.remainingTicks = 40; w.roundTimer.data.timeoutTicks = 360; w.roundTimer.data.running = true; w.roundTimer.data.periodic = false; }
  playing = true; $("play").textContent = "일시정지";
  $("engineTag").textContent = "웨이브 진행 · 점이 있는 빈 칸을 눌러 건설";
}
$("play").onclick = () => { if (!world||restoring||loadingRun||runtimeFailed) return;if(world.replayMismatch){flash("기록이 일치하지 않습니다 · 새 게임을 시작하세요");return;} playing = !playing; $("play").textContent = playing ? "일시정지" : "재개";if(!playing)checkpointRun(world,true); };
$("skip").onclick = () => { if (world && world.prepActive) startWaves(world); };
$("stepBtn").onclick = () => { if (world&&!restoring&&!loadingRun&&!runtimeFailed) { stepN(world, 1); render(world);checkpointRun(world,true); } };
$("reset").onclick = () => startNewGame();
$("changeSetup").onclick = () => startNewGame(true);
$("speed").oninput = (e) => { tps = +e.target.value; $("spd").textContent = tps + "×";if($("speedCycle"))$("speedCycle").textContent='배속 '+tps+'×'; };
$("speedCycle").onclick=()=>{const slider=$("speed");if(slider.disabled)return;const next=Number(slider.value)+Number(slider.step||1);slider.value=String(next>Number(slider.max)?slider.min:next);slider.oninput({target:slider});};
for (const id of ["A009", "A007", "A00R", "A03M", "A02G", "A008", "A02J"]) {
  $("cast" + id).onclick = () => { if (world) castGem(world, id); };
}
$("cancelPoint").onclick=()=>{if(world){world.pendingPointAbility=null;world.buildCellsView=null;flash("이동을 취소했습니다");render(world);}};
$("gemDeselect").onclick = () => { if (world){world.selectedGemId = null;clearPlacement(world);world.overlapPick=null;world.pendingPointAbility=null;cancelGemTarget(world);} };
// One current-world handler; refresh immediately so consecutive UI actions read the selected gem.
$("sourceDialogButtons").addEventListener('click',event=>{
 const button=event.target.closest('button[data-dialog-button]');if(!button||!world||world.nativeDialogPendingId!==null&&world.nativeDialogPendingId!==undefined)return;
 const dialogId=Number(button.dataset.dialogId),buttonId=Number(button.dataset.dialogButton),dialog=world.vm.handles.get(dialogId);
 if(dialog?.kind!=='dialog'||!dialog.data.buttons.includes(buttonId)||!dialog.data.visibleTo.includes(0))return;
 world.sim.injectDialogClick(0,buttonId);recordInput(world,{kind:'dialog',playerId:0,buttonId,dialogId});world.nativeDialogPendingId=dialogId;render(world);
});
$("sourceDialog").addEventListener('keydown',e=>{
 if(e.key!=='Tab')return;const buttons=[...$("sourceDialogButtons").querySelectorAll('button:not(:disabled)')];if(!buttons.length)return;
 if(e.shiftKey&&document.activeElement===buttons[0]){e.preventDefault();buttons.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===buttons.at(-1)){e.preventDefault();buttons[0].focus();}
});
function handleTrainingClick(event){
 const button=event.target.closest('button[data-train-type]');if(!button||!world)return;
 const count=Number(button.dataset.trainCount??1);if(count>1&&!world.trainingBatch){const saved=checkpointRun(world,true);if(saved.kind==='failed'){flash('진행을 보관하지 못해 묶음 구입을 중단했습니다 · 한 번씩 구입할 수 있습니다');render(world);return;}}
 if(requestTrainingBatch(world,Number(button.dataset.producerId),button.dataset.trainType,count)){world.trainingBatchNotice='';world.trainingInterrupted=null;flash(playing?'구입을 시작했습니다':'구입을 예약했습니다 · 상단 재개를 누르면 진행됩니다');}else flash('지금은 구입할 수 없습니다');render(world);
}
$("cancelTrainingBatch").onclick=()=>{if(world?.trainingBatch){const remaining=world.trainingBatch.remaining;world.trainingBatch=null;if(remaining>0){world.trainingInterrupted={remaining,cause:'manual'};world.trainingBatchNotice=trainingInterruptionText(world.trainingInterrupted);}checkpointRun(world,true);render(world);}};
for(const id of ["trainingOptions","casinoTrainingOptions"])$(id).addEventListener('click',handleTrainingClick);
$("gemUpgrades").addEventListener('click',event=>{
 const button=event.target.closest('button[data-upgrade-target]');if(!button||!world||world.selectedGemId===null||(world.viewPlayerId??0)!==0)return;
 const accepted=world.sim.issueUnitUpgrade(0,world.selectedGemId,button.dataset.upgradeTarget);recordInput(world,{kind:'upgrade',playerId:0,unitId:world.selectedGemId,targetTypeId:button.dataset.upgradeTarget,accepted});if(!accepted)flash('지금은 강화할 수 없습니다');else flash('강화 요청 중…');render(world);
});
$("findCombination").onclick=()=>{
 if(!world)return;cancelGemTarget(world);const ids=availableGemCombinations(world,(world.availableComboIds??[]).map(id=>world.sim.getUnit(id)).filter(Boolean));
 if(!ids.length)return;const id=ids[(ids.indexOf(world.selectedGemId)+1)%ids.length];
 selectGemById(world,id);
};
$("showRocks").onclick=()=>{if(world){world.showRocks=!world.showRocks;render(world);}};
$("pathWarning").onclick=()=>{if(world){world.showRocks=true;setDrawer(true);gameMenu.reveal('ownedExplorer');$("ownedExplorer").open=true;render(world);$("gemRoster").querySelector("button")?.focus();}};
$("gemRoster").addEventListener("click",event=>{
 const button=event.target.closest("button[data-unit-id]");if(!button||!world)return;
 selectGemById(world,Number(button.dataset.unitId));
});
// S-A2d(DISPATCH_SONNET_SA2_MODE_RESTORE) — 복원된 Ne 다이얼로그 클릭 주입(injectDialogClick 재사용,
// 새 입력경로 0). Be 값 자체는 대입하지 않는다 — 원작 yc/Sc/uc가 세팅(발명 경계 준수).
$("modeClassic").onclick = () => {if(world&&!world.modeDialog?.clicked){world.startupMode="classic";renderStartupOptions(world);}};
$("modeRace").onclick = () => {if(world&&!world.modeDialog?.clicked){world.startupMode="race";renderStartupOptions(world);}};
$("startGame").onclick=()=>{if(world)chooseStartup(world.startupMode??"race",world.startupDifficulty??0);};
// Research remains an enqueue-only source order. The view locks stale prices until its result.
function requestResearch(w,techId) {
 if(!w||restoring||loadingRun||runtimeFailed||w.gameOver||w.replayMismatch||(w.viewPlayerId??0)!==0||w.pendingResearch||!RESEARCH_IDS.includes(techId)||$("rs"+techId+"Btn")?.disabled)return false;
 const accepted=w.sim.research(0,techId);
 recordInput(w,{kind:"research",playerId:0,techId,accepted});
 if(accepted){w.pendingResearch={techId};w.researchNotice='';}else w.researchNotice='지금은 연구할 수 없습니다';
 render(w);return accepted;
}
function observeResearchResult(w,ev) {
 if(ev.playerId!==0||!['ResearchFinished','ResearchRejected'].includes(ev.kind))return;
 if(ev.kind==='ResearchFinished')queueSoundEvent(w,'research',{key:'research:'+ev.techId+':'+ev.level});
 if(w.pendingResearch?.techId===ev.techId)w.pendingResearch=null;
 w.researchNotice=ev.kind==='ResearchFinished'?`${trainingTechName(w,ev.techId,ev.level)} 연구 완료 · ${ev.level}레벨`:`연구 취소 · ${RESEARCH_REJECT_LABEL[ev.reason]??'연구 조건을 확인하세요'}`;
 flash(w.researchNotice);
}
// G-2c(DISPATCH_SONNET_G2_CORE §2 G-2d) — 연구 버튼: IWorld.research(0, techId) 왕복 데모.
// 값 판정(비용/만렙/골드부족) 전부 엔진 소유(sim.researchConfig+researchLevels) — 여기는 요청만.
for (const techId of RESEARCH_IDS) {
  const btn = $("rs" + techId + "Btn");
  if (btn) btn.onclick = () => requestResearch(world,techId);
}
const goRestart = $("goRestart");
if (goRestart) goRestart.onclick = () => startNewGame();

// G-6(DISPATCH_SONNET_G3_G6 §2 G-6) — 채팅 콘솔: injectChat(P0,text) 왕복만(효과는 스크립트 소유, 재구현
// 0). 도움말은 실맵 registry.chatSubs 미러(chat_commands.json 부재 — 런타임 등록부가 원장 대체, A-G9).
// 관리자 계열($·@·# 접두) 5종은 기본 숨김(§2 G-6 "관리자 $·@ 계열 기본 숨김").
function isAdminChatText(text) { return /^[$@#]/.test(text); }
function renderChatHelp(w) {
  const container = $("chatHelp");
  if (!container || !w || !w.registry) return;
  const showAdmin = $("chatShowAdmin") && $("chatShowAdmin").checked;
  const seen = new Set(), items = [];
  for (const sub of w.registry.chatSubs) {
    if (seen.has(sub.text)) continue;
    seen.add(sub.text);
    if (!showAdmin && isAdminChatText(sub.text)) continue;
    items.push(sub.text);
  }
  container.innerHTML = items.length
    ? items.map((t) => `<div style="padding:1px 0"><code style="font-size:12px">${t.replace(/</g, "&lt;")}</code></div>`).join("")
    : "<span style='color:var(--dim)'>(등록된 명령 없음)</span>";
}
function sendChat() {
  if (!world) return;
  const input = $("chatInput");
  const text = input.value;
  if (!text) return;
  world.sim.injectChat(0, text); // P0 왕복 — 효과(§8.1)는 실맵 스크립트가 다음 triggerBridge 단계에서 수행
  recordInput(world,{kind:'chat',playerId:0,text});
  const log = $("chatLog");
  if (log) { const line=document.createElement('div');line.textContent='› '+text;log.prepend(line); }
  input.value = "";
}
if ($("chatSend")) $("chatSend").onclick = sendChat;
if ($("chatInput")) $("chatInput").addEventListener("keydown", (e) => { if (e.key === "Enter") sendChat(); });
if ($("chatShowAdmin")) $("chatShowAdmin").onchange = () => renderChatHelp(world);

function setMsg(t) { const m = $("msg"); if (m) { m.style.display = "flex"; m.textContent = t; } }
function startNewGame(showSetup=false){
 if(world&&!world.gameOver&&!confirm('진행 중인 판을 먼저 저장하고 새 판을 시작할까요?'))return false;
 if(checkpointRun(world,true).kind==='failed')return false;
 setDrawer(false);return loadFromUrl(freshSessionSeed(sessionSeed,crypto),{showSetup});
}
function commitSessionSeed(seed) {
  const url=new URL(location.href);url.searchParams.set('seed',String(seed));
  history.replaceState(history.state,'',url);sessionSeed=seed;
}
async function loadFromUrl(seed=sessionSeed,{publishSeed=true,showSetup=false}={}) {
  if(loadingRun)return false;
  checkpointRun(world,true);
  const priorWorld=world,priorFailure=runtimeFailed;let loaded=false;
  loadingRun=true;world?.viewFeedback?.clear();world?.fieldFeedback?.clear();world?.cueAudio?.stop();playing=false;frameClock.reset();
  runtimeFailed=false;document.documentElement.dataset.gameReady='false';
  const readBytes=(response,id)=>readResponseBytes(response,id,(...values)=>{if(!restoring)loadingScreen.receive(...values);});
  const reading=async()=>{if(!restoring)await loadingScreen.reading();};
  if(!restoring)loadingScreen.begin();
  try {
    setMsg("맵 로딩 중…");
    // U-6c(DISPATCH_SONNET_U6_INFOARCH §2 U-6c) — 맵과 이름 원장(gems_special+towers_full)을 병렬 fetch.
    // 이름 원장 실패는 loadNameMap() 내부에서 흡수(빈 맵 폴백) — 맵 로딩 자체를 막지 않는다.
    if(!selectedSource&&!localSourceMode){selectedSource=await loadHostedPlayFiles(globalThis.fetch.bind(globalThis),parseStockProfile,{readBytes,onReading:reading});if(!selectedSource){if(!restoring)showSourceFiles();return false;}}
    let buf,nameMap,stockProfile;
    if(selectedSource){buf=selectedSource.mapBytes;stockProfile=selectedSource.stockProfile;nameMap=extractGemPresentation();}
    else {
      const mapJob=fetch(MAP_URL).then(async response=>{if(!response.ok)throw Error("맵 fetch 실패 HTTP "+response.status);return readBytes(response,'map');});
      const [bytes,names,profile]=await Promise.all([mapJob,loadNameMap(),loadLocalStockProfile({readBytes,beforeParse:async()=>{await mapJob;await reading();}})]);
      buf=bytes;nameMap=names;stockProfile=profile;
    }
    await reading();
    setMsg("파싱·부팅 중…");
    frameClock.reset();
    drag.on=false; delete $("gameApp").dataset.mode;
    resize(); world = boot(buf, nameMap, stockProfile, seed); $("msg").style.display = "none"; $("sourceFiles").hidden=true;
    // G-6: 리셋/재부팅 시 hp/gold 차분 앵커·부유 태그·채팅 도움말 갱신(구 world 잔재로 인한 오탐 방지).
    prevHp = new Map(); prevGold = [0, 0, 0, 0, 0, 0, 0, 0];
    prevGold[0] = world.sim.ledger.gold(0); // source startup gold is the observation baseline
    textTags = []; goldTags = [];
    // U-2e: 재부팅 시 구 world의 위치/이펙트 잔재 초기화(오탐 attackFx 방지 — 위 prevHp/goldTags와 동일 이유).
    lastPos = new Map(); attackFx = []; waveNum = 0; prevCreeps = 0; waveFlashUntil = 0;
    renderChatHelp(world);
    $("engineTag").textContent = "보석 5개 건설 → 보석 선택 또는 같은 보석 조합";
    playing = false; $("play").textContent = "방식 선택";
    let returning=true;try{returning=listRunRecords(localStorage,contentBuild,replayBuild).some(r=>r.trace);}catch{ /* Storage access failure keeps the explicit choice screen. */ }
    if(!restoring&&!showSetup&&!returning)chooseStartup('race',0);
    render(world);
    if(!restoring){await visualReady;if(document.fonts?.ready)await document.fonts.ready;}
    if(!restoring)world?.syncDeviceView?.();
    if(runtimeFailed||world?.runtimeCrashes?.length)throw Error('게임 화면을 준비하지 못했습니다. 다시 열어 주세요.');
    if(!restoring)loadingScreen.finish();
    if(publishSeed)commitSessionSeed(seed);
    loaded=true;return true;
  } catch (e) {
    const alreadyFailed=runtimeFailed;
    playing=false;frameClock.reset();document.documentElement.dataset.gameReady='false';
    // An already-created candidate is unusable after a completion-stage failure.
    // Preserve prior-world health only for failures that occurred before replacement.
    if(world!==priorWorld)runtimeFailed=true;
    console.error(e);
    if(restoring)return false;
    if(world!==priorWorld){if(!alreadyFailed)window.showErr('게임 준비 오류',e);loadingScreen.error(e?.message??String(e));return false;}
    if(!localSourceMode){showSourceFiles(e?.message??String(e));return false;}
    setMsg(`게임을 열지 못했습니다\n${e?.message??e}\n\n‘보석타워 실행.command’로 다시 여세요.\n원작 맵·능력 자료와 게임 빌드가 같은 폴더에 필요합니다.\n기본 주소는 127.0.0.1:8097입니다.`);
    if(!restoring)loadingScreen.error(e?.message??String(e));
    return false;
  } finally {loadingRun=false;if(!loaded&&world===priorWorld)runtimeFailed=priorFailure;}
}

function showSourceFiles(message='두 파일을 선택하면 게임을 열 수 있습니다.'){
 if(!restoring)loadingScreen.intake($("sourceFiles"));
 $("sourceFiles").hidden=false;$("msg").style.display="none";$("sourceFilesStatus").textContent=message;
 $("play").disabled=true;$("reset").disabled=true;$("runState").textContent='자료 선택';
 syncDisabledReasons(world);
}
function updateSourceFiles(){const ready=Boolean($("mapFile").files[0]&&$("profileFile").files[0]);$("openSourceFiles").disabled=!ready;syncDisabledReasons(world);}
$("mapFile").addEventListener('change',updateSourceFiles);$("profileFile").addEventListener('change',updateSourceFiles);
$("openSourceFiles").addEventListener('click',async()=>{
 const button=$("openSourceFiles");button.disabled=true;$("sourceFilesStatus").textContent='자료를 확인하는 중…';
 try{loadingScreen.begin();await loadingScreen.reading();const source=await readPlayFiles($("mapFile").files[0],$("profileFile").files[0],parseStockProfile);selectedSource=source;await loadFromUrl();}
 catch(error){showSourceFiles(error.message);}
 finally{updateSourceFiles();}
});

function interruptUiOrders(w){
 drag.on=false;if(!w)return;clearPlacement(w);
 if(w.trainingBatch){const remaining=w.trainingBatch.remaining;w.trainingBatch=null;if(remaining>0){w.trainingInterrupted={remaining,cause:'background'};w.trainingBatchNotice=trainingInterruptionText(w.trainingInterrupted);}}
}
document.addEventListener("visibilitychange", () => {
  frameClock.reset();
  if (document.hidden) { playing = false;interruptUiOrders(world);checkpointRun(world,true);renderControls(world); }
});
window.addEventListener("pagehide", () => {
 frameClock.reset();playing=false;interruptUiOrders(world);checkpointRun(world,true);renderControls(world);
});
window.addEventListener("pageshow", event => {
 frameClock.reset();if(event?.persisted)playing=false;renderControls(world);
});
resize(); requestAnimationFrame(loop); loadFromUrl();

function renderStartupOptions(w){
 if(!w?.modeDialog||w.modeDialog.clicked)return;
 const choices=sourceDifficultyChoices(w),mode=w.startupMode??'race',selected=w.startupDifficulty??0;
 for(const [value,id]of [['classic','modeClassic'],['race','modeRace']])$(id).setAttribute('aria-pressed',String(mode===value));
 const host=$('startupDifficulties');
 if(w.startupOptionsKey!==JSON.stringify(choices)){
  w.startupOptionsKey=JSON.stringify(choices);host.replaceChildren();
  for(const choice of choices){const b=document.createElement('button');b.type='button';b.className='sec';b.dataset.difficultyIndex=String(choice.index);const title=document.createElement('strong'),note=document.createElement('small');title.textContent=choice.label;note.textContent=choice.description;b.append(title,note);b.onclick=()=>{w.startupDifficulty=choice.index;renderStartupOptions(w);};host.append(b);}
 }
 for(const button of host.children)button.setAttribute('aria-pressed',String(Number(button.dataset.difficultyIndex)===selected));
 $('startGame').disabled=!choices.length;$('startGame').textContent=`${mode==='classic'?'클래식':'레이스'} · ${choices[selected]?.label??'난이도 확인'} 시작`;
}
function chooseStartup(mode,index){
 if(!world||!requestStartupChoice(world,mode,index))return false;
 $('gameApp').dataset.mode=mode;frameClock.reset();playing=true;
 // Start through ordinary fixed steps. The original delayed difficulty timer
 // continues on the frame clock; advanceStartupChoice waits for its real buttons.
 stepN(world,4);render(world);cv.focus();return true;
}
function chooseMode(mode) {
  if (!world || !requestModeChoice(world, mode)) return;
  world.runMode=mode;$("gameApp").dataset.mode = mode;
  frameClock.reset(); playing = true; $("play").textContent = "일시정지";
  cv.focus();
}
function setDrawer(open) {
  if(open&&$("gameDrawer").hidden){clearPlacement(world);if(playing){checkpointRun(world,true);if(world)render(world,true);}}
  $("gameDrawer").hidden = !open; $("drawerScrim").hidden = !open;
  $("researchToggle").setAttribute("aria-expanded", String(open));
  if(open){refreshSavedRuns();$("drawerClose").focus();} else $("researchToggle").focus();
}
$("researchToggle").onclick = () => setDrawer($("gameDrawer").hidden);
$("drawerClose").onclick = () => setDrawer(false);
$("drawerScrim").onclick = () => setDrawer(false);
$("gameDrawer").addEventListener("keydown", e => {
  if(e.key !== "Tab") return;
  const items = [...$("gameDrawer").querySelectorAll("button:not(:disabled),input,select,textarea,summary")].filter(el=>el.getClientRects().length);
  const first=items[0],last=items.at(-1);
  if(e.shiftKey && document.activeElement===first){e.preventDefault();last.focus();}
  if(!e.shiftKey && document.activeElement===last){e.preventDefault();first.focus();}
});
document.addEventListener("keydown", e => {if(restoring&&e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();cancelRestore();return;}if(e.key==="Escape" && !$("gameDrawer").hidden)setDrawer(false);});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&world?.pendingTargetAbility){cancelGemTarget(world);flash("교환을 취소했습니다");render(world);}});
for(const [player,id] of ['fieldMine','fieldOther'].entries())$(id).onclick=()=>switchField(world,player);
$('fieldTabs').addEventListener('keydown',event=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 if(world?.sim.playerState.getSlotState(1)!==1)return;
 event.preventDefault();const player=event.key==='Home'?0:event.key==='End'?1:1-(world?.viewPlayerId??0);
 switchField(world,player);$(player===0?'fieldMine':'fieldOther').focus();
});
$('returnToMine').onclick=()=>switchField(world,0);
cv.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&world){if(cancelGemTarget(world))flash("교환을 취소했습니다");else{world.pendingPointAbility=null;world.selectedGemId=null;world.overlapPick=null;clearPlacement(world);}render(world);}
});


// Local file intake can be blocked before a world exists.
syncDisabledReasons(world);
