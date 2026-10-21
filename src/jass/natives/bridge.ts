/**
 * R-207 — 트리거 이벤트 브리지: chat + EnterRect + 사망(UnitDied)을 sim의 "triggerBridge" tick phase
 * 한 곳에서 소비해 등록된 구독과 매칭, fireTrigger()로 조건 평가 → 액션 스레드 스폰(등록순, INV-D4).
 *
 * chat: `sim.drainChat()`으로 들어온 채팅을 등록된 TriggerRegisterPlayerChatEvent 구독과 매칭.
 * 발화 순서: sim.step() 한 틱 안에서 여러 채팅이 큐잉됐으면 발생순(주입 호출 순서) → 그 안에서
 * 구독은 registry.chatSubs 등록순으로 매칭(같은 채팅에 여러 트리거가 걸려있을 수 있음).
 *
 * EnterRect/사망(R-207 확장): movement.ts("unitLoop" phase)·combat-system.ts("combat" phase)가 같은
 * 틱 앞선 phase에서 sim.emit()한 RectEntered/UnitDied를 `sim.drainBridgeEvents()`(sim.ts 보조 채널 —
 * drainEvents()의 외부 소비 계약과 독립)로 소비한다(적재순=발화 계약, MOVEMENT_LOOP_DESIGN §5.2).
 * EnterRect는 registry.rects에서 rectId가 일치하는 등록(등록 호출마다 유일한 rectId, registry.ts 참조)의
 * 트리거만 매칭 — 게이트처럼 같은 물리 rect에 트리거 N개가 걸려도 RectEntered N건 각각 1개씩만 발화해
 * 과다발화가 없다. 사망은 registry.deathSubs 전원에게 발화(v1: 필터 없음).
 * meta.unit = 핸들id(=엔티티id, RM-1 통일) — GetTriggerUnit()/GetDyingUnit()이 그대로 조회.
 * meta.killingUnit = 처치 타워(combat-pipe.ts CombatEvent.killerUnitId → SimEvent → 여기서 meta 주입, 2026-07-14
 * killer-id seam). GetKillingUnit()이 조회 — 실맵 per-kill 바운티(wee) 트리거가 소비. killerUnitId 없는 사망
 * (리크·엔진 정리)은 null.
 */
import type { JassVm } from "../vm.ts";
import type { Sim } from "../../sim/sim.ts";
import { vhandle, vint, vstring } from "../vm.ts";
import { TriggerRegistry, fireTrigger } from "./registry.ts";
import { getOrCreatePlayerHandle, type PlayerHandleCache } from "./players.ts";
import { createUnitEntityHandle, rawCodeOf } from "./units.ts";
import {trainFinishSubscriptions, upgradeFinishSubscriptions,constructSubscriptions, spellCastSubscriptions, attackSubscriptions, researchFinishSubscriptions } from "./triggers.ts";
import { researchCostForLevel } from "../../sim/balance/config.ts";
import {evaluateUnitFilter} from './groups.ts';

export function registerEventBridge(vm: JassVm, sim: Sim, registry: TriggerRegistry, playerHandleCache: PlayerHandleCache): void {
  const finishTraining=(q:{playerId:number;producerId:number;typeId:string;owner:number;cost:number})=>{
    const producer=sim.getUnit(q.producerId);if(!producer?.alive||sim.gameOver)return;
    const child=createUnitEntityHandle(vm.syncContext(),q.owner,rawCodeOf(q.typeId),producer.x,producer.y,0);
    sim.emit({kind:'TrainingFinished',producerId:q.producerId,unitId:child.id,typeId:q.typeId,owner:q.owner,cost:q.cost});
    for(const sub of [...trainFinishSubscriptions(registry)]){
      if(sub.unitId!==undefined&&sub.unitId!==q.producerId)continue;
      if(sub.playerId!==null&&sub.playerId!==q.owner)continue;const trigger=vm.handles.get(sub.triggerId);
      if(trigger)fireTrigger(vm,trigger,{trigger:vhandle(trigger.id),unit:vhandle(q.producerId),trainedUnit:vhandle(child.id),player:vhandle(getOrCreatePlayerHandle(vm.handles,playerHandleCache,q.owner))});
    }
  };
  sim.registerTickPhase('timers',()=>{
    for(const [id,q]of sim.pendingTrainings){
      if(sim.gameOver||!sim.getUnit(id)?.alive){sim.pendingTrainings.delete(id);sim.emit({kind:'TrainingRejected',producerId:id,playerId:q.playerId,typeId:q.typeId,reason:sim.gameOver?'game-over':'missing-unit'});continue;}
      if(--q.remainingTicks<=0){sim.pendingTrainings.delete(id);finishTraining(q);}
    }
  });
  sim.registerTickPhase("triggerBridge", () => {
    for(const q of sim.drainTrainingRequests()){
      const reason=sim.validateTrainUnit(q.playerId,q.producerId,q.typeId);if(reason){sim.emit({kind:'TrainingRejected',...q,reason});continue;}
      const producer=sim.getUnit(q.producerId)!,target=sim.defStore!.getDef(q.typeId),cost=target.sourceGoldCost!;
      if(cost)sim.ledger.adjustGold(producer.owner,-cost,'cost');
      const pending={...q,owner:producer.owner,cost,remainingTicks:target.buildTimeTicks!};
      sim.emit({kind:'TrainingStarted',producerId:q.producerId,typeId:q.typeId,owner:producer.owner,cost,durationTicks:pending.remainingTicks});
      if(pending.remainingTicks===0)finishTraining(pending);else sim.pendingTrainings.set(q.producerId,pending);
    }

    for (const sub of registry.timedTriggerSubs) {
      if (sub.remainingTicks <= 0) continue;
      sub.remainingTicks -= 1;
      if (sub.remainingTicks > 0) continue;
      const trig = vm.handles.get(sub.triggerId);
      if (trig) fireTrigger(vm, trig, { trigger: vhandle(trig.id) });
      sub.remainingTicks = sub.periodic ? sub.intervalTicks : 0;
    }

    for (const request of sim.drainBuildRequests()) {
      const builder = request.builderId === null ? null : sim.getUnit(request.builderId);
      const owner=request.builderId===null?request.playerId:builder?.owner;
      const reason=sim.gameOver?'game-over':request.builderId!==null&&!builder?.alive?'missing-builder':owner===undefined||sim.playerState.getSlotState(owner)!==1?'inactive-player':null;
      if(reason){sim.emit({kind:'BuildRejected',builderId:request.builderId,playerId:owner,typeId:request.typeId,reason});continue;}
      const playerId=owner!;
      if (!sim.defStore) {
        sim.emit({ kind: "BuildRejected", builderId: request.builderId, typeId: request.typeId, reason: "missing-def-store" });
        continue;
      }
      if(sim.navigation&&!sim.navigation.canBuild(request.typeId,request.x,request.y)){
        sim.emit({kind:"BuildRejected",builderId:request.builderId,typeId:request.typeId,reason:"blocked-placement"});continue;
      }
      const def = sim.defStore.getDef(request.typeId);
      if (def.goldCost > sim.ledger.gold(playerId)) {
        sim.emit({ kind: "BuildRejected", builderId: request.builderId, typeId: request.typeId, reason: "insufficient-gold" });
        continue;
      }
      if (def.goldCost > 0) sim.ledger.adjustGold(playerId, -def.goldCost, "cost");
      const unit = createUnitEntityHandle(vm.syncContext(), playerId, rawCodeOf(request.typeId), request.x, request.y, 0);
      sim.emit({ kind: "ConstructFinished", builderId: request.builderId, playerId, unitId: unit.id, typeId: request.typeId });
      for (const sub of constructSubscriptions(registry)) {
        if (sub.playerId !== null && sub.playerId !== playerId) continue;
        const trig = vm.handles.get(sub.triggerId);
        // R-2(DISPATCH_SONNET_R2_TECH_WIRING) 발견 교정: player 미주입이면 GetTriggerPlayer()가 null 핸들을
        // 반환해 실맵의 GetPlayerTechCountSimple(techId,GetTriggerPlayer()) 580콜사이트 중 대다수(건설-완료
        // 경로, R000 577회)가 항상 playerIdx<0→레벨0으로 읽힌다 — WC3 실제 시맨틱상 CONSTRUCT_FINISH의
        // GetTriggerPlayer()는 건설자(builder) 소유자다(다른 이벤트 종류의 기존 배선 — 연구/채팅/대화상자 —
        // 는 이미 player를 채우고 있었음, 건설만 누락). 새 이벤트 종류 발명 0 — 기존 constructSubscriptions
        // 발화에 필드 하나만 보강.
        if (trig) {
          fireTrigger(vm, trig, {
            trigger: vhandle(trig.id),
            unit: vhandle(unit.id),
            player: vhandle(getOrCreatePlayerHandle(vm.handles, playerHandleCache, playerId)),
          });
        }
      }
    }

    try { for (const request of sim.drainCastRequests(true)) {
      if(!sim.prepareAbilityCast(request))continue;
      const unit = sim.getUnit(request.unitId);
      if (!unit?.alive) continue;
      const abilityId = rawCodeOf(request.abilityId);
      sim.emit({ kind: "SpellCast", unitId: unit.id, abilityId: request.abilityId });
      // C-1b(DISPATCH_SONNET_C1_COMBINE §2 C-1b) — GetSpellTargetUnit() 발화 컨텍스트: 기존 castAbility
      // seam의 선택적 targetUnitId를 그대로 실어 threadMeta로 전달(새 이벤트 종류 발명 0).
      const spellTargetUnit = vhandle(request.targetUnitId ?? null);
      const point=request.targetPoint??sim.getUnit(request.targetUnitId??-1);
      for (const sub of spellCastSubscriptions(registry)) {
        if (sub.playerId !== null && sub.playerId !== unit.owner) continue;
        const trig = vm.handles.get(sub.triggerId);
        if (trig) fireTrigger(vm, trig, {
          trigger: vhandle(trig.id), unit: vhandle(unit.id), spellAbilityId: vint(abilityId), spellTargetUnit,spellTargetX:{t:"real",v:point?.x??0},spellTargetY:{t:"real",v:point?.y??0},
          // Player-unit spell events belong to the caster owner, including shared commands.
          player: vhandle(getOrCreatePlayerHandle(vm.handles, playerHandleCache, unit.owner)),
        });
      }
    } } finally {sim.finishCastRequests();}

    // G-2c(DISPATCH_SONNET_G2_CORE §2 G-2c) — buildStructure의 검증·차감·발화 순서를 그대로 재사용:
    // ① config 부재(unknown-tech) ② 만렙 도달(max-level) ③ 선행조건 미충족(prereq-unmet, R-1 C-2 신설)
    // ④ 골드 부족(insufficient-gold) 순으로 거부하고, 전부 통과해야만 비용 차감("cost" 소스, buildStructure의
    // goldCost 차감과 동일 라벨) + 레벨 증가 + RESEARCH_FINISH 발화(효과는 nL/QM/tM 스크립트 소관 — 여기는
    // 사실만 통지, deny-first §3①). 비용은 researchCostForLevel(R-1 C-1)로 레벨별 계산 — 격리 지점 단일.
    for (const request of sim.drainResearchRequests()) {
      const spec = sim.researchConfig?.[request.techId];
      if (!spec) {
        sim.emit({ kind: "ResearchRejected", playerId: request.playerId, techId: request.techId, reason: "unknown-tech" });
        continue;
      }
      const currentLevel = sim.getResearchLevel(request.playerId, request.techId);
      if (currentLevel >= spec.maxLevel) {
        sim.emit({ kind: "ResearchRejected", playerId: request.playerId, techId: request.techId, reason: "max-level" });
        continue;
      }
      if (spec.requires && sim.getResearchLevel(request.playerId, spec.requires.techId) < spec.requires.count) {
        sim.emit({ kind: "ResearchRejected", playerId: request.playerId, techId: request.techId, reason: "prereq-unmet" });
        continue;
      }
      const nextLevel = currentLevel + 1;
      const cost = researchCostForLevel(spec, nextLevel);
      if (cost > sim.ledger.gold(request.playerId)) {
        sim.emit({ kind: "ResearchRejected", playerId: request.playerId, techId: request.techId, reason: "insufficient-gold" });
        continue;
      }
      if (cost > 0) sim.ledger.adjustGold(request.playerId, -cost, "cost");
      sim.setResearchLevel(request.playerId, request.techId, nextLevel);
      sim.emit({ kind: "ResearchFinished", playerId: request.playerId, techId: request.techId, level: nextLevel });
      for (const sub of researchFinishSubscriptions(registry)) {
        if (sub.playerId !== null && sub.playerId !== request.playerId) continue;
        const trig = vm.handles.get(sub.triggerId);
        if (!trig) continue;
        fireTrigger(vm, trig, {
          trigger: vhandle(trig.id),
          player: vhandle(getOrCreatePlayerHandle(vm.handles, playerHandleCache, request.playerId)),
          researched: vint(rawCodeOf(request.techId)),
        });
      }
    }

    // Native unit-range registrations reuse ordinary moved entity positions and source conditions.
    for(const sub of [...registry.unitRangeSubs]){
      const center=sim.getUnit(sub.unitId),trigger=vm.handles.get(sub.triggerId);
      if(!center?.alive||!trigger){sub.inside.clear();continue;}
      const inside=new Set<number>(),entrants:number[]=[];
      for(const e of sim.entities.values())if(e.alive&&e.id!==center.id&&(e.x-center.x)**2+(e.y-center.y)**2<=sub.radiusU**2){inside.add(e.id);if(!sub.inside.has(e.id))entrants.push(e.id);}
      sub.inside=inside;
      for(const id of entrants){
        if(!sim.getUnit(id)?.alive||!sim.getUnit(sub.unitId)?.alive||!vm.handles.get(sub.triggerId))continue;
        if(evaluateUnitFilter(vm.syncContext(),id,sub.filter))fireTrigger(vm,trigger,{trigger:vhandle(trigger.id),unit:vhandle(id)});
      }
    }

    const chats = sim.drainChat();
    for (const { playerId, text } of chats) {
      for (const sub of registry.chatSubs) {
        if (sub.playerId !== playerId) continue;
        const matched = sub.exact ? text === sub.text : text.includes(sub.text);
        if (!matched) continue;
        const trig = vm.handles.get(sub.triggerId);
        if (!trig) continue;
        const meta = {
          player: vhandle(getOrCreatePlayerHandle(vm.handles, playerHandleCache, playerId)),
          trigger: vhandle(trig.id),
          chatText: vstring(text),
        };
        const fired = fireTrigger(vm, trig, meta);
        if (fired) {
          vm.syncContext().emit({ kind: "ChatTriggerFired", triggerId: trig.id, playerId, text });
        }
      }
    }

    const clicks = sim.drainDialogClicks();
    for (const { playerId, buttonId } of clicks) {
      const button = vm.handles.get(buttonId);
      const dialogId = button?.kind === ("button" as never) && typeof button.data.dialogId === "number" ? button.data.dialogId : -1;
      if (dialogId < 0) continue;
      // A normal dialog button closes that player's dialog before its action runs.
      const clickedDialog=vm.handles.get(dialogId);if(clickedDialog?.kind==='dialog'){
        const visibleTo=clickedDialog.data.visibleTo as number[];const index=visibleTo.indexOf(playerId);if(index>=0)visibleTo.splice(index,1);clickedDialog.data.visible=visibleTo.length>0;
      }
      for (const sub of registry.dialogSubs) {
        if (sub.dialogId !== dialogId) continue;
        const trig = vm.handles.get(sub.triggerId);
        if (!trig) continue;
        const fired = fireTrigger(vm, trig, {
          trigger: vhandle(trig.id),
          clickedButton: vhandle(buttonId),
          clickedDialog: vhandle(dialogId),
          player: vhandle(getOrCreatePlayerHandle(vm.handles, playerHandleCache, playerId)),
        });
        if (fired) sim.emit({ kind: "DialogClicked", playerId, dialogId, buttonId });
      }
    }

    // R-207 확장: EnterRect + 사망 — 같은 틱 unitLoop/combat phase가 emit한 SimEvent를 소비(§5.2).
    const bridgeEvents = sim.drainBridgeEvents();
    for (const event of bridgeEvents) {
      if(event.kind==='UpgradeFinished'){
        const handle=vm.handles.get(event.unitId),entity=sim.getUnit(event.unitId);
        if(handle?.kind==='unit'&&entity){handle.data.typeId=rawCodeOf(entity.typeId);handle.data.hp=entity.hp;handle.data.hpMax=entity.hpMax;}
        for(const sub of upgradeFinishSubscriptions(registry)){if(sub.playerId!==null&&sub.playerId!==event.owner)continue;const trigger=vm.handles.get(sub.triggerId);if(trigger)fireTrigger(vm,trigger,{trigger:vhandle(trigger.id),unit:vhandle(event.unitId),player:vhandle(getOrCreatePlayerHandle(vm.handles,playerHandleCache,event.owner))});}
      }else if (event.kind === "RectEntered") {
        for (const reg of registry.rects) {
          if (reg.rectId !== event.rectId) continue;
          const lifeResult = sim.handleLifeRect(reg, event.unitId);
          if (lifeResult === "enforced") continue;
          const trig = vm.handles.get(reg.triggerId);
          if (!trig) continue;
          fireTrigger(vm, trig, { trigger: vhandle(trig.id), unit: vhandle(event.unitId) });
        }
      } else if (event.kind === "UnitDied") {
        // meta.killingUnit = 처치 타워(combat-pipe killerUnitId) — GetKillingUnit()이 조회, 실맵 바운티 트리거가 소비.
        // killerUnitId 없음(리크·엔진 정리 등) → null(킬러 없는 사망).
        const killingUnit = vhandle(event.killerUnitId ?? null);
        for (const triggerId of registry.deathSubs) {
          const trig = vm.handles.get(triggerId);
          if (!trig) continue;
          fireTrigger(vm, trig, { trigger: vhandle(trig.id), unit: vhandle(event.unitId), killingUnit });
        }
      } else if (event.kind === "Attacked") {
        // G-1(GEM_IDENTITY_MINE_DESIGN §5.1) — 명중할 때마다(사망 무관) 발화. 실맵 트리거뎀 9사이트가
        // GetTriggerUnit()=피격자(victim)·GetAttacker()=공격자로 읽는다(units.ts native가 threadMeta.attacker
        // 조회) — hJ 광산 릴레이도 동일 meta 모양을 그대로 소비한다(§3.2 재해석: "mine-hit relay").
        // Snapshot the victim owner once per dispatch, as the other player-event
        // paths do. A lethal hit may already have removed its Sim entity; the
        // existing unit handle retains its last owner for this pending event.
        const victim = sim.getUnit(event.targetUnitId), victimHandle = vm.handles.get(event.targetUnitId);
        const victimOwner = victim?.owner ?? (victimHandle?.kind === "unit" && typeof victimHandle.data.owner === "number" ? victimHandle.data.owner : undefined);
        const player = victimOwner === undefined ? vhandle(null) : vhandle(getOrCreatePlayerHandle(vm.handles, playerHandleCache, victimOwner));
        for (const sub of attackSubscriptions(registry)) {
          if (sub.playerId !== null && sub.playerId !== victimOwner) continue;
          const trig = vm.handles.get(sub.triggerId);
          if (!trig) continue;
          fireTrigger(vm, trig, {
            trigger: vhandle(trig.id),
            unit: vhandle(event.targetUnitId),
            attacker: vhandle(event.attackerUnitId),
            player,
          });
        }
      }
    }

    for (const transition of sim.playerState.drainTransitions()) {
      for (const sub of registry.playerStateSubs) {
        if (sub.playerId !== transition.playerId || sub.stateKey !== transition.stateKey) continue;
        const matched = sub.op === 0 ? transition.value < sub.value
          : sub.op === 1 ? transition.value <= sub.value
          : sub.op === 2 ? transition.value === sub.value
          : sub.op === 3 ? transition.value >= sub.value
          : sub.op === 4 ? transition.value > sub.value
          : transition.value !== sub.value;
        if (!matched) continue;
        const trig = vm.handles.get(sub.triggerId);
        if (trig) fireTrigger(vm, trig, { trigger: vhandle(trig.id) });
      }
    }
  });
}
