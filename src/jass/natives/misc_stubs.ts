/**
 * R-206a Tier3/4 lite — UI 표시계/사운드/카메라/시네마틱 no-op 화이트리스트.
 * 원칙(MAP §3 R-206b 예고, 이 슬라이스에선 최소 서브셋만): "no-op이어도 등록" —
 * UnimplementedNative 이벤트는 진짜 미지 native에만 남긴다(신호 대 잡음). 값 반환은 문맥이 기대하는
 * 무해한 기본값(0/false/빈문자열/handle null)이며, DisplayTextToForce류만 관측 가능한 이벤트로 남긴다.
 */
import type { JassVm } from "../vm.ts";
import { vint, vbool, vhandle } from "../vm.ts";

/** 인자·반환형 상관없이 항상 무해한 기본값(int 0)을 돌려주는 카탈로그형 no-op 등록. */
function registerVoidStubs(vm: JassVm, names: string[]): void {
  for (const name of names) {
    vm.registerNative(name, () => vint(0));
  }
}

export function registerMiscStubs(vm: JassVm): void {
  // 사운드 — 완전 no-op(D-4: 로그만, 소리는 M3 몫).
  registerVoidStubs(vm, [
    "CreateSound",
    "CreateSoundFromLabel",
    "SetSoundParamsFromLabel",
    "SetSoundDuration",
    "SetSoundVolume",
    "SetSoundChannel",
    "SetSoundDistanceCutoff",
    "SetSoundDistances",
    "SetSoundPitch",
    "SetSoundPosition",
    "StartSound",
    "StopSound",
    "KillSoundWhenDone",
    "NewSoundEnvironment",
    "SetAmbientDaySound",
    "SetAmbientNightSound",
    "SetMapMusic",
    "ClearMapMusic",
  ]);

  // 카메라/시네마틱/포그/환경 — no-op.
  registerVoidStubs(vm, [
    "SetCameraBounds",
    "CreateCameraSetup",
    "CameraSetupSetField",
    "CameraSetupSetDestPosition",
    "CameraSetupApply",
    "CameraSetupApplyForceDuration",
    "SetDayNightModels",
    "SetTerrainFogEx",
    "SetTerrainFog",
    "DisplayTextToPlayer",
    "ClearTextMessages",
  ]);
  vm.registerNative("IsFogEnabled", () => vbool(false));
  vm.registerNative("IsFogMaskEnabled", () => vbool(false));

  // config-time 잔재(InitBlizzard 인라인) — 값이 사실상 무의미(헤드리스), 안정 상수만.
  registerVoidStubs(vm, [
    "ConfigureNeutralVictim",
    "DelayedSuspendDecayCreate",
    "InitQueuedTriggers",
    "InitRescuableBehaviorBJ",
    "InitDNCSounds",
    "InitMapRects",
    "InitSummonableCaps",
    "SetAllItemTypeSlots",
    "SetAllUnitTypeSlots",
    "DetectGameStarted",
  ]);
  vm.registerNative("VersionGet", () => vint(1));

  // 다이얼로그는 R-307b dialog.ts가 소유. 멀티보드만 이 lite 카탈로그에 남긴다.
  vm.registerNative("CreateMultiboard", (ctx) => vhandle(ctx.handles.create("multiboard", {}).id));

  // 텍스트 표시 — 실측 DisplayTextToForce 514회(전체파일 top20). 헤드리스 증거로 이벤트 로그 남김
  // (UnimplementedNative와 구분되는 전용 kind — 구현된 native를 미구현 카운트에 오염시키지 않는다).
  vm.registerNative("DisplayTextToForce", (ctx, args) => {
    const text = args[1]?.t === "string" ? args[1].v : "";
    const force=args[0]?.t==='handle'&&args[0].v!==null?ctx.handles.get(args[0].v):undefined;
    const playerIds=force?.kind==='force'&&Array.isArray(force.data.players)?[...force.data.players] as number[]:undefined;
    const unitMeta=ctx.threadMeta.unit,source=unitMeta?.t==='handle'&&unitMeta.v!==null?ctx.handles.get(unitMeta.v):undefined;
    // Read-only observations: snapshot recipients before a source callback clears its force.
    ctx.emit({ kind: "TextDisplayed", text,...(playerIds===undefined?{}:{playerIds}),...(source?.kind==='unit'?{sourceUnitId:source.id}:{}) });
    return vint(0);
  });

  vm.registerNative("GetGameSpeed", () => vint(0));
  vm.registerNative("SetGameSpeed", () => vint(0));

  // 타이머 — 핸들만 발급(주기 디스패치는 R-207 스코프 밖, "여유 시" 다음 슬라이스 — MAP §3 R-207).
  vm.registerNative("CreateTimer", (ctx) => vhandle(ctx.handles.create("timer", {}).id));
  vm.registerNative("DestroyTimer", (ctx, args) => {
    if (args[0]?.t === "handle" && args[0].v !== null) ctx.handles.delete(args[0].v);
    return vint(0);
  });
  registerVoidStubs(vm, ["TimerStart", "PauseTimer", "ResumeTimer", "UseTimeOfDayBJ", "SetTimeOfDay", "LockGameSpeedBJ"]);
}
