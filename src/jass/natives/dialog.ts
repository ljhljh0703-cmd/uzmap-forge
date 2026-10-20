/** R-307b — headless dialog state. Rendering remains presentation-owned. */
import type { JassVm, NativeCallContext, JassValue } from "../vm.ts";
import { vhandle, vint } from "../vm.ts";
import { playerIndexOf } from "./players.ts";
import type { TriggerRegistry } from "./registry.ts";

function handleOf(ctx: NativeCallContext, value: JassValue | undefined, kind: string) {
  if (value?.t !== "handle" || value.v === null) return undefined;
  const handle = ctx.handles.get(value.v);
  return handle?.kind === kind ? handle : undefined;
}

export function registerDialogNatives(vm: JassVm, registry: TriggerRegistry): void {
  vm.registerNative("DialogCreate", (ctx) => {
    const dialog = ctx.handles.create("dialog", { buttons: [] as number[], message: "", visible: false, visibleTo: [] as number[] });
    registry.dialogIds.push(dialog.id);
    return vhandle(dialog.id);
  });

  vm.registerNative("DialogDestroy", (ctx, args) => {
    const dialog = handleOf(ctx, args[0], "dialog");
    if (dialog) ctx.handles.delete(dialog.id);
    return vint(0);
  });

  const addButton = (ctx: NativeCallContext, args: JassValue[]) => {
    const dialog = handleOf(ctx, args[0], "dialog");
    if (!dialog) return vhandle(null);
    const text = args[1]?.t === "string" ? args[1].v : "";
    const quickkey = args[2]?.t === "int" ? args[2].v : undefined;
    // HandleKind cannot be broadened without touching vm.ts (forbidden path); runtime still carries the exact kind.
    const button = ctx.handles.create("button" as never, { dialogId: dialog.id, text, quickkey });
    (dialog.data.buttons as number[]).push(button.id);
    ctx.setGlobal("bj_lastCreatedButton", vhandle(button.id));
    return vhandle(button.id);
  };
  vm.registerNative("DialogAddButtonBJ", addButton);
  vm.registerNative("DialogAddButton", addButton);

  vm.registerNative("DialogDisplay", (ctx, args) => {
    const playerId = args[0] ? playerIndexOf(ctx, args[0]) : -1;
    const dialog = handleOf(ctx, args[1], "dialog");
    const show = args[2]?.t === "bool" ? args[2].v : false;
    if (dialog) {
      const visibleTo = dialog.data.visibleTo as number[];
      const index = visibleTo.indexOf(playerId);
      if (show && playerId >= 0 && index < 0) visibleTo.push(playerId);
      if (!show && index >= 0) visibleTo.splice(index, 1);
      dialog.data.visible=visibleTo.length>0;
    }
    return vint(0);
  });
  vm.registerNative("DialogDisplayBJ", (ctx, args) => {
    const show = args[0]?.t === "bool" ? args[0].v : false;
    const dialog = handleOf(ctx, args[1], "dialog");
    const playerId = args[2] ? playerIndexOf(ctx, args[2]) : -1;
    if (dialog) {
      const visibleTo = dialog.data.visibleTo as number[];
      const index = visibleTo.indexOf(playerId);
      if (show && playerId >= 0 && index < 0) visibleTo.push(playerId);
      if (!show && index >= 0) visibleTo.splice(index, 1);
      dialog.data.visible=visibleTo.length>0;
    }
    return vint(0);
  });

  vm.registerNative("DialogClear", (ctx, args) => {
    const dialog = handleOf(ctx, args[0], "dialog");
    if (dialog) (dialog.data.buttons as number[]).length = 0;
    return vint(0);
  });
  vm.registerNative("DialogSetMessage", (ctx, args) => {
    const dialog = handleOf(ctx, args[0], "dialog");
    if (dialog) dialog.data.message = args[1]?.t === "string" ? args[1].v : "";
    return vint(0);
  });

  vm.registerNative("GetClickedButton", (ctx) => ctx.threadMeta.clickedButton ?? vhandle(null));
  vm.registerNative("GetClickedButtonBJ", (ctx) => ctx.threadMeta.clickedButton ?? vhandle(null));
  vm.registerNative("GetClickedDialog", (ctx) => ctx.threadMeta.clickedDialog ?? vhandle(null));
}

/**
 * S-A2(DISPATCH_SONNET_SA2_MODE_RESTORE, 원장 docs/dissection/mode_dialog.json:ycModeBranches) —
 * 이 fixture 맵(GemTower_Max_7C.w3x) 고유 deprotection 손실 복원. war3map.j 실측(전수 스캔):
 * `dialog Ne=null` / `button array be` / `integer Be=0` 전역이 선언돼 있고, 다른 다이얼로그
 * (kv/pv/nv/MA, `DialogAddButton` 31회)와 달리 `Ne`만 `DialogAddButton(Ne,...)` 호출이 0회다.
 * 원장 `ycModeBranches`가 버튼 개수(2)·Be 매핑(be[1]→Be=1 클래식 / be[2]→Be=2 레이스)을 완전 명세
 * — 이 함수는 그 명세대로만 재구성한다(발명 아님). 이름(Ne/be/Be)은 이 맵 전용 심볼(다른 맵엔
 * 적용 안 됨·일반 엔진 로직 아님) — 다른 곳(예: typeId "h006")이 이미 이 맵 전용 리터럴을 직접
 * 참조하는 것과 동일한 성격.
 *
 * 호출 지점 = `TriggerRegisterDialogEvent` native(triggers.ts) — war3map.j 실측상 이 호출이
 * `call TriggerRegisterDialogEvent(zr,Ne)` 그 자체이고, 직후 `TriggerAddAction(zr,function yc)`가
 * 콜백을 붙인다(Ne는 이미 DialogCreate()로 생성 완료된 뒤). idempotent(버튼이 이미 있으면 skip)라
 * 재호출·Ne 재바인딩에도 안전.
 *
 * ⚠ 발명 경계: `be[1]`/`be[2]`에 저장하는 것은 *버튼 핸들*뿐(원작 `set be[1]=DialogAddButton(...)`의
 * 복원)이다. `Be`/`E`/`be[]` 자체의 정수·불리언 *값*은 이 함수가 절대 대입하지 않는다 — 원작
 * `yc`/`Sc`/`uc`가 클릭 후 그 값을 세팅한다.
 */
export function restoreLostModeDialogButtons(vm: JassVm, ctx: NativeCallContext, dialogId: number): void {
  const neGlobal = vm.getGlobal("Ne");
  if (neGlobal.t !== "handle" || neGlobal.v !== dialogId) return; // Ne가 아닌 다른 다이얼로그는 손대지 않음.
  const dialog = ctx.handles.get(dialogId);
  if (!dialog || dialog.kind !== "dialog") return;
  const buttons = dialog.data.buttons as number[];
  if (buttons.length > 0) return; // 이미 버튼 보유 — idempotent, 재실행 방지.

  // 라벨 텍스트는 원장에 없음(mode_dialog.json:buttonsByDialog에 Ne 키 없음, 실측) → 중립 라벨(가정 A-SA2-3).
  const classic = ctx.handles.create("button" as never, { dialogId, text: "클래식", quickkey: undefined });
  buttons.push(classic.id);
  ctx.setGlobalIndexed("be", 1, vhandle(classic.id));

  const race = ctx.handles.create("button" as never, { dialogId, text: "레이스", quickkey: undefined });
  buttons.push(race.id);
  ctx.setGlobalIndexed("be", 2, vhandle(race.id));
}
