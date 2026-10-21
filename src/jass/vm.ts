/**
 * JASS 코루틴 VM — R-205.
 * 계약 근거: docs/IMPLEMENTATION_MAP.md §3 R-205(핵심 스펙) · §4.2(VM 객체·스레드·핸들) ·
 * §5 INV 매트릭스 R-205 행 · STATUS.md D-2(틱 반올림).
 *
 * R-107 AST(JassModule/FuncDecl/Stmt/Expr)를 실행한다. 이 맵이 TriggerSleepAction을 540회
 * 쓰기 때문에("트리거 액션 실행 1건 = 스레드 1개") 함수 호출을 **중단·재개 가능한 그린스레드**로
 * 모델링해야 한다 — 그래서 모든 AST 노드 평가기가 `function*`(제너레이터)다. blocking native는
 * TriggerSleepAction 하나뿐이며(VM 자신이 특수 처리, native seam을 거치지 않음 — native seam은
 * 항상 동기 함수라 yield할 수 없다), 그 외 모든 native 호출은 즉시 값을 반환한다.
 *
 * 결정론은 실행기 자체가 아니라 **wake 큐 규율**에서 나온다: 같은 틱에 깨는 스레드는
 * (wakeTick, 스레드 생성 seq) strict 순으로 재개한다(INV-D4 동점 규율과 동일 정신).
 *
 * 스코프(AGENTS.md deny-first #4): 이 파일은 실제 sim native를 구현하지 않는다.
 * `registerNative(name, fn)` seam + 미등록 호출 스텁(UnimplementedNative 이벤트,
 * throw 금지)만 제공한다 — 실제 natives는 R-206a의 일.
 *
 * 순수성: src/jass/ 밖에서는 오직 src/sim/sim.ts(Sim, TickPhase)를 "읽기 전용으로 import"한다
 * (ARCHITECTURE.md: jass → sim 방향 허용). Math.random/Date.now 사용 금지(INV-D1).
 */

import type {
  Expr,
  Stmt,
  FuncDecl,
  GlobalDecl,
  JassModule,
  IfStmt,
  LoopStmt,
} from "./ast.ts";
import type { ParseResult } from "./parser.ts";
import type { Sim } from "../sim/sim.ts";
import { secondsToTicks } from "../sim/ticks.ts";

// =====================================================================================
// 값 타입 — integer/real/boolean/string/handle/code + null(범용) + unknown(스텁 반환).
// JASS의 정수/실수 구분(I2R/R2I 시맨틱)을 유지하기 위해 태그 유니온으로 표현한다
// (JS number 하나로는 3 vs 3.0을 구분할 수 없다 — 실측 근거: MAP §3 R-205 "값 타입" 절).
// =====================================================================================

export interface VInt {
  t: "int";
  v: number;
}
export interface VReal {
  t: "real";
  v: number;
}
export interface VBool {
  t: "bool";
  v: boolean;
}
export interface VString {
  t: "string";
  v: string;
}
/** unit/trigger/group/force/timer/location/rect/player/widget… 모든 handle 계열이 여기로 수렴. */
export interface VHandle {
  t: "handle";
  v: number | null;
}
/** `function Name` 값 — FunctionIndex 키를 담는다. null = 미할당 code. */
export interface VCode {
  t: "code";
  v: string | null;
}
/** JASS `null` 리터럴 — handle/code 어느 쪽에도 쓰일 수 있는 범용 null. */
export interface VNull {
  t: "null";
}
/** 미등록 native 호출의 반환값 — 사용 문맥(bool/int/real/string/handle)에서 강제 변환된다. */
export interface VUnknown {
  t: "unknown";
}

export type JassValue = VInt | VReal | VBool | VString | VHandle | VCode | VNull | VUnknown;

export const VNULL: VNull = { t: "null" };
export const VUNKNOWN: VUnknown = { t: "unknown" };
export function vint(v: number): VInt {
  return { t: "int", v: Math.trunc(v) };
}
export function vreal(v: number): VReal {
  return { t: "real", v };
}
export function vbool(v: boolean): VBool {
  return { t: "bool", v };
}
export function vstring(v: string): VString {
  return { t: "string", v };
}
export function vhandle(id: number | null): VHandle {
  return { t: "handle", v: id };
}
export function vcode(name: string | null): VCode {
  return { t: "code", v: name };
}

function isNullish(v: JassValue): boolean {
  return v.t === "null" || (v.t === "handle" && v.v === null) || (v.t === "code" && v.v === null);
}

function typeToTag(type: string): JassValue["t"] {
  switch (type) {
    case "integer":
      return "int";
    case "real":
      return "real";
    case "boolean":
      return "bool";
    case "string":
      return "string";
    case "code":
      return "code";
    default:
      return "handle";
  }
}

function defaultForType(type: string): JassValue {
  switch (type) {
    case "integer":
      return vint(0);
    case "real":
      return vreal(0);
    case "boolean":
      return vbool(false);
    case "string":
      return vstring("");
    case "code":
      return vcode(null);
    case "unknown":
      return VUNKNOWN;
    default:
      // unit/trigger/group/force/timer/location/rect/player/widget/... : 전부 handle 계열.
      return vhandle(null);
  }
}

/** 스텁 반환값(unknown)을 문맥이 기대하는 태그로 강제 변환한다 (deny-first #4 근거). */
function resolveUnknown(v: JassValue, hint: JassValue["t"]): JassValue {
  if (v.t !== "unknown") return v;
  switch (hint) {
    case "int":
      return vint(0);
    case "real":
      return vreal(0);
    case "bool":
      return vbool(false);
    case "string":
      return vstring("");
    case "code":
      return vcode(null);
    default:
      return vhandle(null);
  }
}

export class JassRuntimeError extends Error {}

function toIntValue(v: JassValue): number {
  const r = resolveUnknown(v, "int");
  if (r.t === "int") return r.v;
  if (r.t === "null") return 0;
  throw new JassRuntimeError(`integer 문맥에 ${r.t} 값`);
}

function toStringValue(v: JassValue): string {
  const r = resolveUnknown(v, "string");
  switch (r.t) {
    case "string":
      return r.v;
    case "int":
      return String(r.v);
    case "real":
      return String(r.v);
    case "bool":
      return r.v ? "true" : "false";
    case "null":
      return "null";
    case "handle":
      return r.v === null ? "null" : `handle#${r.v}`;
    case "code":
      return r.v ?? "null";
    default:
      return "";
  }
}

/** 값 동등성 — null/handle/code 계열의 null 비교를 특별 취급한다. */
function valuesEqual(a: JassValue, b: JassValue): boolean {
  const ra = a.t === "unknown" ? resolveUnknown(a, b.t) : a;
  const rb = b.t === "unknown" ? resolveUnknown(b, a.t) : b;
  if (isNullish(ra) || isNullish(rb)) return isNullish(ra) && isNullish(rb);
  if (ra.t !== rb.t) throw new JassRuntimeError(`타입 불일치 비교: ${ra.t} vs ${rb.t}`);
  switch (ra.t) {
    case "int":
    case "real":
    case "bool":
    case "string":
      return ra.v === (rb as typeof ra).v;
    case "handle":
      return ra.v === (rb as VHandle).v;
    case "code":
      return ra.v === (rb as VCode).v;
    default:
      return true;
  }
}

// =====================================================================================
// 환경 — 전역/지역 변수, 배열(희소 인덱스).
// =====================================================================================

interface VarSlot {
  type: string;
  isArray: boolean;
  value?: JassValue;
  array?: Map<number, JassValue>;
}

type Scope = Map<string, VarSlot>;

function makeSlot(type: string, isArray: boolean): VarSlot {
  return isArray ? { type, isArray, array: new Map() } : { type, isArray, value: defaultForType(type) };
}

// =====================================================================================
// 핸들 테이블 — Map<u32, HandleObj>, id 순차 발급(결정론). group 등은 삽입순 배열로 보관.
// =====================================================================================

export type HandleKind =
  | "location"
  | "rect"
  | "group"
  | "force"
  | "trigger"
  | "timer"
  | "dialog"
  | "multiboard"
  | "texttag"
  | "sound"
  | "effect"
  | "player"
  | "unit"
  | "generic";

export interface HandleObj {
  readonly id: number;
  readonly kind: HandleKind;
  /** kind별 자유형 payload. group은 data.units:number[]를 삽입순 배열로 유지(Set 금지 — INV-D4). */
  data: Record<string, unknown>;
}

export class HandleTable {
  private nextId = 1;
  private readonly table = new Map<number, HandleObj>();

  create(kind: HandleKind, data: Record<string, unknown> = {}): HandleObj {
    const id = this.nextId++;
    const h: HandleObj = { id, kind, data };
    this.table.set(id, h);
    return h;
  }

  get(id: number | null): HandleObj | undefined {
    if (id === null) return undefined;
    return this.table.get(id);
  }

  delete(id: number): void {
    this.table.delete(id);
  }

  get size(): number {
    return this.table.size;
  }
}

// =====================================================================================
// 이벤트 — VM 자체 이벤트 채널. UnimplementedNative는 world_api.ts의 SimEvent 변형과
// 구조적으로 동일하게 유지해(deny-first #2: world_api.ts 수정 금지) attachToSim()에서
// sim.emit()으로 그대로 전달할 수 있게 한다.
// =====================================================================================

export type VmEvent =
  | { kind: "UnimplementedNative"; name: string }
  | { kind: "ExecuteFuncTargetMissing"; name: string }
  /** 실맵 실측(R-205 보너스 프로브): war3map.j가 common.j 상수(CAMERA_MARGIN_LEFT 등)처럼
   *  파일에 선언되지 않은 전역을 참조하는 사례가 있다 — native 미등록과 동일한 스텁 철학을
   *  전역 심볼 해석에도 적용한다(throw 금지, unknown 슬롯 자동 생성 + 이벤트). */
  | { kind: "UndefinedGlobal"; name: string }
  | { kind: "ThreadBudgetExceeded"; threadId: number; functionName: string; steps: number }
  | { kind: "ThreadCallDepthExceeded"; threadId: number; functionName: string; depth: number }
  | { kind: "ThreadCrashed"; threadId: number; message: string }
  /** R-207: 등록된 트리거가 실제로 발화했다는 관측 가능 증거(스모크 done-gate ③). */
  | { kind: "ChatTriggerFired"; triggerId: number; playerId: number; text: string }
  /** Tier3 lite: DisplayTextToForce 등 UI 표시계를 헤드리스에서 관측 가능하게(로그만, no-op 아님). */
  | { kind: "TextDisplayed"; text: string; playerIds?:number[]; sourceUnitId?:number };

// =====================================================================================
// 스레드 — 트리거 액션 실행 1건 = 스레드 1개. wake 큐 = (wakeTick, seq) strict.
// =====================================================================================

type ThreadStatus = "running" | "sleeping" | "done" | "aborted";

/** 실행 1회(스레드 또는 동기 호출)를 관통하는 예산/재진입 카운터. */
interface RunCtx {
  readonly threadId: number;
  steps: number;
  depth: number;
}

interface SleepYield {
  kind: "sleep";
  ticks: number;
}

type Yielded = SleepYield;

type ThreadGen = Generator<Yielded, JassValue, void>;

interface JassThread {
  readonly id: number;
  gen: ThreadGen;
  status: ThreadStatus;
  wakeTick: number;
  readonly runCtx: RunCtx;
  readonly functionName: string;
  /** R-207: 이 스레드가 어떤 이벤트로 스폰됐는지(예: {player, trigger, unit}) — GetTriggerPlayer 등이
   *  ctx.threadMeta로 조회. TSA로 재개돼도 스레드 수명 동안 유지된다. */
  readonly meta: Record<string, JassValue>;
}

// ---- 제어 흐름 신호(예외 기반) ----
class ReturnSignal {
  value: JassValue | null;
  constructor(value: JassValue | null) {
    this.value = value;
  }
}
class ExitLoopSignal {}
class ThreadBudgetExceededError extends Error {}
class ThreadCallDepthExceededError extends Error {}

// =====================================================================================
// NativeRegistry seam
// =====================================================================================

export interface NativeCallContext {
  readonly threadId: number;
  readonly handles: HandleTable;
  readonly sim: Sim | undefined;
  getGlobal(name: string): JassValue;
  setGlobal(name: string, value: JassValue): void;
  /** S-A2(DISPATCH_SONNET_SA2_MODE_RESTORE) seam — 배열 전역의 개별 원소 세팅. 기존 SetStmt(위
   *  execStmt "SetStmt" 분기, slot.array.set(idx,value))의 능력을 native 계층에 그대로 노출하는
   *  어댑터일 뿐(getGlobal/setGlobal과 동일 패턴) — 새 평가기·새 로직 아님. 인터프리터 실행 경로 변경 금지
   *  제약(디스패치 §4) 준수: 아래 구현은 기존 slot.array.set 호출을 감싸기만 한다. */
  setGlobalIndexed(name: string, index: number, value: JassValue): void;
  /** 동기 재진입 호출 — ForGroupBJ 등 콜백을 받는 BJ가 code 값을 즉시 실행할 때 사용.
   *  대상 함수 안에서 TriggerSleepAction을 만나면 동기 문맥이라 suspend가 불가능하므로
   *  JassRuntimeError를 던진다(스레드 크래시 이벤트로 수렴 — throw가 VM 밖으로 새지 않는다). */
  callVm(code: JassValue, args: JassValue[]): JassValue;
  /** 새 그린스레드 스폰(트리거 발화 스타일 비동기 실행) — 반환값은 새 스레드 id. */
  spawnThread(code: JassValue, args: JassValue[]): number;
  emit(event: VmEvent): void;
  /** R-207: 현재 호출 스레드(또는 동기 문맥)의 이벤트 메타데이터 — GetTriggerPlayer/GetTriggerUnit 등. */
  readonly threadMeta: Record<string, JassValue>;
}

export type NativeFn = (ctx: NativeCallContext, args: JassValue[]) => JassValue;

export interface JassVmOptions {
  /** 스레드당 누적 명령 예산(무한루프 방어). 기본 200,000. */
  threadBudget?: number;
  /** 함수 호출 재진입 깊이 상한(재귀/재진입 폭주 방어). 기본 256. */
  maxCallDepth?: number;
}

const DEFAULT_THREAD_BUDGET = 200_000;
const DEFAULT_MAX_CALL_DEPTH = 256;

// =====================================================================================
// JassVm
// =====================================================================================

export class JassVm {
  private readonly ast: JassModule;
  private readonly functionIndex: Map<string, FuncDecl>;
  private readonly globalsIndex: Map<string, GlobalDecl>;
  private readonly globals: Scope = new Map();
  private readonly natives = new Map<string, NativeFn>();
  readonly handles = new HandleTable();

  private readonly threadBudget: number;
  private readonly maxCallDepth: number;

  private readonly threads = new Map<number, JassThread>();
  private nextThreadSeq = 1;
  private clockTick = 0;
  private sim: Sim | undefined;

  private readonly eventQueue: VmEvent[] = [];
  /** R-207: threadId===-1(동기 문맥, 예: 트리거 조건 평가)일 때 참조되는 임시 이벤트 메타. */
  private syncMeta: Record<string, JassValue> = {};
  /** R-3: boolexpr(kind:"generic" 핸들 트리, Condition/Filter/GetBooleanAnd/Or/Not이 만든다) 평가 훅.
   *  vm.ts는 natives/보다 하위 레이어라 natives/registry.ts::evalBoolExpr를 직접 import하면 순환참조가
   *  된다 — installNatives()가 이 훅에 그 함수 참조를 그대로 주입한다(새 평가기 작성 금지, 이미 있는
   *  and/or/not/code 재귀평가를 재사용). 미주입 상태(레거시/단독 테스트)에서는 boolean 문맥의 handle을
   *  기존처럼 비-null=true로 관용 처리한다(evalCondBool 참조). */
  private boolExprHook: ((ctx: NativeCallContext, v: JassValue) => boolean) | undefined;

  constructor(
    ast: JassModule,
    functionIndex: Map<string, FuncDecl>,
    globalsIndex: Map<string, GlobalDecl>,
    opts: JassVmOptions = {},
  ) {
    this.ast = ast;
    this.functionIndex = functionIndex;
    this.globalsIndex = globalsIndex;
    this.threadBudget = opts.threadBudget ?? DEFAULT_THREAD_BUDGET;
    this.maxCallDepth = opts.maxCallDepth ?? DEFAULT_MAX_CALL_DEPTH;
    this.initGlobals();
  }

  static fromParseResult(pr: ParseResult, opts?: JassVmOptions): JassVm {
    return new JassVm(pr.ast, pr.functionIndex, pr.globalsIndex, opts);
  }

  // ---- 전역 초기화 (삽입순 = 선언순, GlobalsIndex는 Map 삽입순) ----
  private initGlobals(): void {
    // 슬롯을 먼저 전부 만든다(선언 순서와 무관하게 서로 참조 가능하도록 기본값부터 채움).
    for (const g of this.ast.globals) {
      this.globals.set(g.name, makeSlot(g.type, g.isArray));
    }
    // 그 다음 init 표현식을 선언순(=ast.globals 배열 순서, 삽입순)으로 평가한다.
    // 전역 초기화는 "동기 문맥"(sleep 불가) — 극히 드물게 native 호출(예: InitHashtable())을
    // 포함할 수 있어 callFunctionSyncInternal과 동일한 드라이브 로직을 재사용한다.
    const runCtx: RunCtx = { threadId: -1, steps: 0, depth: 0 };
    for (const g of this.ast.globals) {
      if (g.isArray || g.init === null) continue;
      const slot = this.globals.get(g.name)!;
      const value = this.driveSync(this.evalExpr(g.init, null, runCtx), runCtx);
      slot.value = value;
    }
  }

  // ---- native seam ----
  registerNative(name: string, fn: NativeFn): void {
    this.natives.set(name, fn);
  }

  /** R-3: installNatives()가 natives/registry.ts::evalBoolExpr 참조를 그대로 주입한다(층 분리 —
   *  vm.ts → natives/ 직접 import 금지). */
  setBoolExprEvaluator(hook: (ctx: NativeCallContext, v: JassValue) => boolean): void {
    this.boolExprHook = hook;
  }

  // ---- sim 통합 ----
  attachToSim(sim: Sim): void {
    this.sim = sim;
    sim.registerTickPhase("timers", (s) => this.pump(s.tickCount));
  }

  /** 독립 실행용 자체 클록(Sim 없이 테스트할 때). */
  tick(): void {
    this.clockTick += 1;
    this.pump(this.clockTick);
  }

  get tickCount(): number {
    return this.sim ? this.sim.tickCount : this.clockTick;
  }

  get threadCount(): number {
    return this.threads.size;
  }

  threadStatus(id: number): ThreadStatus | undefined {
    return this.threads.get(id)?.status;
  }

  drainEvents(): VmEvent[] {
    const drained = this.eventQueue.slice();
    this.eventQueue.length = 0;
    return drained;
  }

  private emitEvent(event: VmEvent): void {
    this.eventQueue.push(event);
    // UnimplementedNative는 world_api.ts의 SimEvent 변형과 구조적으로 동일 — 그대로 전달 가능.
    if (this.sim && event.kind === "UnimplementedNative") {
      this.sim.emit(event);
    }
  }

  /** 미선언 이름이면 자동 생성한다(resolveSlot과 동일 철학 — native seam이 bj_ 관례 전역을
   *  자유롭게 읽고 쓸 수 있어야 한다, 예: bj_lastReplacedUnit). throw 금지(INV-D5 정신). */
  private ensureGlobalSlot(name: string): VarSlot {
    let slot = this.globals.get(name);
    if (!slot) {
      slot = { type: "unknown", isArray: true, value: VUNKNOWN, array: new Map() };
      this.globals.set(name, slot);
    }
    return slot;
  }

  getGlobal(name: string): JassValue {
    const slot = this.ensureGlobalSlot(name);
    return slot.value ?? defaultForType(slot.type);
  }

  setGlobal(name: string, value: JassValue): void {
    const slot = this.ensureGlobalSlot(name);
    slot.value = value;
  }

  /** Read-only access for explicit map adapters; missing cells keep JASS defaults. */
  getGlobalIndexed(name: string, index: number): JassValue {
    const slot=this.globals.get(name);
    if(!slot?.isArray || !Number.isInteger(index))return VUNKNOWN;
    return slot.array?.get(index) ?? defaultForType(slot.type);
  }

  /** S-A2 seam adapter — see NativeCallContext.setGlobalIndexed 주석. 정상 케이스(선언된 array 전역)는
   *  ensureGlobalSlot이 이미 `.array` Map을 가진 슬롯을 반환하므로 아래 방어 분기는 타지 않는다 — 미선언
   *  이름으로 호출되는 비정상 경로에서만 조용히 배열로 승격시켜 스레드 크래시를 피한다(INV-D5 정신). */
  setGlobalIndexed(name: string, index: number, value: JassValue): void {
    const slot = this.ensureGlobalSlot(name);
    if (!slot.array) slot.array = new Map();
    slot.array.set(Math.trunc(index), value);
  }

  /** 등록된 native 이름 목록(커버리지 리포트용 — R-210). */
  get registeredNativeNames(): string[] {
    return [...this.natives.keys()];
  }

  // ---- 스레드 스폰/스케줄러 ----

  /** 새 그린스레드 스폰. 트리거 액션 실행 1건 = 스레드 1개(MAP §4.2). 즉시 첫 구간을 실행한다
   *  (실제 WC3도 TriggerExecute는 액션을 즉시 시작해 첫 blocking 지점까지 동기 진행한다). */
  spawnThread(nameOrCode: string | JassValue, args: JassValue[], meta: Record<string, JassValue> = {}): number {
    const name = typeof nameOrCode === "string" ? nameOrCode : this.codeToName(nameOrCode);
    const id = this.nextThreadSeq++;
    const runCtx: RunCtx = { threadId: id, steps: 0, depth: 0 };
    const gen = this.execFunctionByName(name, args, runCtx);
    const thread: JassThread = { id, gen, status: "running", wakeTick: -1, runCtx, functionName: name, meta };
    this.threads.set(id, thread);
    this.resumeThread(thread);
    return id;
  }

  /** R-207: threadId===-1(동기 문맥) 호출에서 참조될 이벤트 메타를 설정한다 — 트리거 조건 평가처럼
   *  스레드 없이(sync) native를 호출해야 하지만 GetTriggerPlayer 등이 필요한 경우 사용. 호출 직후
   *  리셋하는 것은 호출자 책임(natives/ 모듈이 try/finally로 관리). */
  setSyncMeta(meta: Record<string, JassValue>): void {
    this.syncMeta = meta;
  }

  /** R-207: native seam 밖(예: tick 훅 안)에서 동기 native 호출이 필요할 때 쓰는 컨텍스트. */
  syncContext(): NativeCallContext {
    return this.makeNativeContext(-1);
  }

  private codeToName(v: JassValue): string {
    if (v.t === "code" && v.v !== null) return v.v;
    throw new JassRuntimeError(`code 값이 아니거나 null: ${JSON.stringify(v)}`);
  }

  /** 동기 호출(예: config()/main() 최초 진입, 또는 ExecuteFunc 밖에서의 편의 호출).
   *  대상이 TriggerSleepAction을 만나면 "즉시 깨움"으로 접어(sleep을 no-op 취급) 항상 완주한다. */
  callFunctionSync(name: string, args: JassValue[]): JassValue {
    const runCtx: RunCtx = { threadId: -1, steps: 0, depth: 0 };
    return this.driveSync(this.execFunctionByName(name, args, runCtx), runCtx);
  }

  private driveSync(gen: Generator<Yielded, JassValue, void>, _runCtx: RunCtx): JassValue {
    let r = gen.next();
    while (!r.done) {
      // 동기 문맥에서는 sleep을 즉시 통과시킨다(문서화된 절충 — 결정론 스파이크는 spawnThread 경로로 검증).
      r = gen.next();
    }
    return r.value;
  }

  /** 주어진 tick까지 깬 스레드를 (wakeTick, id) strict 순으로 재개한다. */
  private pump(currentTick: number): void {
    const ready: JassThread[] = [];
    for (const th of this.threads.values()) {
      if (th.status === "sleeping" && th.wakeTick <= currentTick) ready.push(th);
    }
    ready.sort((a, b) => (a.wakeTick !== b.wakeTick ? a.wakeTick - b.wakeTick : a.id - b.id));
    for (const th of ready) {
      th.status = "running";
      this.resumeThread(th);
    }
  }

  private resumeThread(th: JassThread): void {
    try {
      const r = th.gen.next();
      if (r.done) {
        th.status = "done";
        this.threads.delete(th.id);
        return;
      }
      // r.value: SleepYield
      const wake = this.tickCount + Math.max(0, r.value.ticks);
      th.status = "sleeping";
      th.wakeTick = wake;
    } catch (err) {
      if (err instanceof ThreadBudgetExceededError) {
        th.status = "aborted";
        this.threads.delete(th.id);
        this.emitEvent({ kind: "ThreadBudgetExceeded", threadId: th.id, functionName: th.functionName, steps: th.runCtx.steps });
        return;
      }
      if (err instanceof ThreadCallDepthExceededError) {
        th.status = "aborted";
        this.threads.delete(th.id);
        this.emitEvent({ kind: "ThreadCallDepthExceeded", threadId: th.id, functionName: th.functionName, depth: th.runCtx.depth });
        return;
      }
      // 예산 가드 외의 런타임 오류도 VM 전체를 죽이지 않는다(크래시 금지 — 예산가드와 같은 정신).
      th.status = "aborted";
      this.threads.delete(th.id);
      const message = err instanceof Error ? err.message : String(err);
      this.emitEvent({ kind: "ThreadCrashed", threadId: th.id, message });
    }
  }

  // ---- 명령 예산/재진입 가드 ----
  private tick_(runCtx: RunCtx): void {
    runCtx.steps++;
    if (runCtx.steps > this.threadBudget) throw new ThreadBudgetExceededError();
  }

  private enterCall(runCtx: RunCtx): void {
    runCtx.depth++;
    if (runCtx.depth > this.maxCallDepth) throw new ThreadCallDepthExceededError();
  }

  private exitCall(runCtx: RunCtx): void {
    runCtx.depth--;
  }

  // =====================================================================================
  // 함수 실행
  // =====================================================================================

  private *execFunctionByName(name: string, args: JassValue[], runCtx: RunCtx): Generator<Yielded, JassValue, void> {
    const fn = this.functionIndex.get(name);
    if (fn) {
      return yield* this.execFunction(fn, args, runCtx);
    }
    // C-2(DISPATCH_SONNET_C2_GROUPENUM) — evalCall(966-970)과 동일한 폴백 체인으로 정합. 기존엔
    // functionIndex만 보고 네이티브를 건너뛰어, "function X" code값으로 native를 참조하는 경로
    // (예: Filter(function GetUnitsOfPlayerAndTypeIdFilter) — 표준 Blizzard.j 필터가 war3map.j엔
    // 없고 native로만 등록됨, natives/groups.ts 참조)가 매번 "미구현"으로 흘렀다. 새 평가기 발명
    // 아님 — evalCall이 이미 쓰는 순서(functionIndex → native → 스텁 이벤트) 그대로 여기도 적용.
    const native = this.natives.get(name);
    if (native) {
      const ctx = this.makeNativeContext(runCtx.threadId);
      return native(ctx, args);
    }
    // 이름이 FunctionIndex에도 native에도 없다 — 미정의(스텁) 취급. throw 금지(INV-D5 정신).
    this.emitEvent({ kind: "ExecuteFuncTargetMissing", name });
    return VUNKNOWN;
  }

  private *execFunction(fn: FuncDecl, args: JassValue[], runCtx: RunCtx): Generator<Yielded, JassValue, void> {
    this.enterCall(runCtx);
    try {
      const frame: Scope = new Map();
      for (let i = 0; i < fn.takes.length; i++) {
        const p = fn.takes[i]!;
        frame.set(p.name, { type: p.type, isArray: false, value: args[i] ?? defaultForType(p.type) });
      }
      try {
        yield* this.execBlock(fn.body, frame, runCtx);
      } catch (sig) {
        if (sig instanceof ReturnSignal) {
          if (fn.returns === "nothing") return VUNKNOWN;
          const raw = sig.value ?? defaultForType(fn.returns);
          return resolveUnknown(raw, typeToTag(fn.returns)); // 스텁(unknown) 반환값을 선언 타입으로 강제 변환
        }
        throw sig;
      }
      return fn.returns === "nothing" ? VUNKNOWN : defaultForType(fn.returns);
    } finally {
      this.exitCall(runCtx);
    }
  }

  private *execBlock(stmts: Stmt[], frame: Scope, runCtx: RunCtx): Generator<Yielded, void, void> {
    for (const s of stmts) {
      yield* this.execStmt(s, frame, runCtx);
    }
  }

  private *execStmt(s: Stmt, frame: Scope, runCtx: RunCtx): Generator<Yielded, void, void> {
    this.tick_(runCtx);
    switch (s.kind) {
      case "LocalDecl": {
        const slot = makeSlot(s.type, s.isArray);
        if (!s.isArray && s.init) {
          slot.value = yield* this.evalExpr(s.init, frame, runCtx);
        }
        frame.set(s.name, slot);
        return;
      }
      case "SetStmt": {
        const value = yield* this.evalExpr(s.value, frame, runCtx);
        const slot = this.resolveSlot(s.name, frame);
        if (s.index) {
          const idx = toIntValue(yield* this.evalExpr(s.index, frame, runCtx));
          if (!slot.array) throw new JassRuntimeError(`'${s.name}'는 배열이 아님`);
          slot.array.set(idx, value);
        } else {
          slot.value = value;
        }
        return;
      }
      case "CallStmt": {
        yield* this.evalCall(s.name, s.args, frame, runCtx);
        return;
      }
      case "IfStmt": {
        yield* this.execIf(s, frame, runCtx);
        return;
      }
      case "LoopStmt": {
        yield* this.execLoop(s, frame, runCtx);
        return;
      }
      case "ExitWhenStmt": {
        const cond = this.evalCondBool(yield* this.evalExpr(s.cond, frame, runCtx), runCtx);
        if (cond) throw new ExitLoopSignal();
        return;
      }
      case "ReturnStmt": {
        const value = s.value ? yield* this.evalExpr(s.value, frame, runCtx) : null;
        throw new ReturnSignal(value);
      }
      default: {
        const _exhaustive: never = s;
        throw new JassRuntimeError(`unknown stmt ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  private *execIf(s: IfStmt, frame: Scope, runCtx: RunCtx): Generator<Yielded, void, void> {
    if (this.evalCondBool(yield* this.evalExpr(s.cond, frame, runCtx), runCtx)) {
      yield* this.execBlock(s.then, frame, runCtx);
      return;
    }
    for (const ei of s.elseifs) {
      if (this.evalCondBool(yield* this.evalExpr(ei.cond, frame, runCtx), runCtx)) {
        yield* this.execBlock(ei.body, frame, runCtx);
        return;
      }
    }
    if (s.elseBody) yield* this.execBlock(s.elseBody, frame, runCtx);
  }

  private *execLoop(s: LoopStmt, frame: Scope, runCtx: RunCtx): Generator<Yielded, void, void> {
    for (;;) {
      this.tick_(runCtx); // 루프 반복 자체도 예산 소모(무한루프 방어 — MAP §3 R-205 예산가드).
      try {
        yield* this.execBlock(s.body, frame, runCtx);
      } catch (sig) {
        if (sig instanceof ExitLoopSignal) return;
        throw sig;
      }
    }
  }

  private resolveSlot(name: string, frame: Scope | null): VarSlot {
    if (frame && frame.has(name)) return frame.get(name)!;
    let g = this.globals.get(name);
    if (!g) {
      // 미정의 전역(스텁): scalar+array 겸용 슬롯을 만들어 어느 쪽으로 쓰여도 throw하지 않는다.
      // 사용 문맥(evalExpr/evalBinary의 resolveUnknown)이 unknown을 알맞은 타입으로 강제 변환한다.
      g = { type: "unknown", isArray: true, value: VUNKNOWN, array: new Map() };
      this.globals.set(name, g);
      this.emitEvent({ kind: "UndefinedGlobal", name });
    }
    return g;
  }

  /** boolean 문맥 강제 변환. R-3 이전에는 handle을 만나면 무조건 비-null=true로 관용 처리했는데,
   *  실맵의 `if (GetBooleanAnd(f5(),F5()))` 관용구(1070회)가 만드는 값은 실제로는 boolexpr 핸들
   *  (kind:"generic", Condition/Filter/GetBooleanAnd/Or/Not 산출)이라 이 강제 변환이 조건을 전부
   *  참으로 만들어버렸다(젬 전량 최상급 근본원인). 이제 boolexpr 핸들이면 boolExprHook(=natives/
   *  registry.ts::evalBoolExpr, and/or/not/code 재귀평가를 이미 구현)으로 실제 평가한다.
   *  boolexpr가 *아닌* handle(unit/group 등, 엄밀 JASS 밖이나 실맵 존재)은 기존 관용 처리를 그대로
   *  유지한다(비-null=true) — 그건 별개 사안, 이번 스코프 밖. throw로 스레드를 죽이지 않는다는 원칙도
   *  유지(조건 평가 중 스폰/이동 체인이 끊기는 것 방지). */
  private evalCondBool(v: JassValue, runCtx: RunCtx): boolean {
    const r = resolveUnknown(v, "bool");
    if (r.t === "bool") return r.v;
    if (r.t === "null") return false;
    if (r.t === "handle") {
      if (r.v !== null && this.boolExprHook) {
        const h = this.handles.get(r.v);
        if (h && h.kind === "generic" && typeof h.data.op === "string") {
          return this.boolExprHook(this.makeNativeContext(runCtx.threadId), v);
        }
      }
      return r.v !== null;
    }
    throw new JassRuntimeError(`boolean 문맥에 ${r.t} 값`);
  }

  // =====================================================================================
  // 표현식 평가
  // =====================================================================================

  private *evalExpr(e: Expr, frame: Scope | null, runCtx: RunCtx): Generator<Yielded, JassValue, void> {
    this.tick_(runCtx);
    switch (e.kind) {
      case "IntLiteral":
        return vint(e.value);
      case "RealLiteral":
        return vreal(e.value);
      case "StringLiteral":
        return vstring(e.value);
      case "RawcodeLiteral":
        return vint(e.value);
      case "BoolLiteral":
        return vbool(e.value);
      case "NullLiteral":
        return VNULL;
      case "FunctionRefExpr":
        return vcode(e.name);
      case "VarExpr": {
        const slot = this.resolveSlot(e.name, frame);
        return slot.value ?? defaultForType(slot.type);
      }
      case "ArrayIndexExpr": {
        const slot = this.resolveSlot(e.name, frame);
        if (!slot.array) throw new JassRuntimeError(`'${e.name}'는 배열이 아님`);
        const idx = toIntValue(yield* this.evalExpr(e.index, frame, runCtx));
        return slot.array.get(idx) ?? defaultForType(slot.type);
      }
      case "UnaryExpr": {
        const v = yield* this.evalExpr(e.operand, frame, runCtx);
        if (e.op === "not") return vbool(!this.evalCondBool(v, runCtx));
        // "-"
        const r = resolveUnknown(v, "int");
        if (r.t === "int") return vint(-r.v);
        if (r.t === "real") return vreal(-r.v);
        throw new JassRuntimeError(`단항 '-'는 int/real만 지원, got ${r.t}`);
      }
      case "BinaryExpr":
        return yield* this.evalBinary(e.op, e.left, e.right, frame, runCtx);
      case "CallExpr":
        return yield* this.evalCall(e.name, e.args, frame, runCtx);
      default: {
        const _exhaustive: never = e;
        throw new JassRuntimeError(`unknown expr ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  private *evalBinary(op: string, leftE: Expr, rightE: Expr, frame: Scope | null, runCtx: RunCtx): Generator<Yielded, JassValue, void> {
    // and/or는 JASS 언어 연산자 — 단락 평가(short-circuit)한다. GetBooleanAnd/Or 같은 native
    // 함수(인자로 두 값을 미리 평가)와 달리, 언어 키워드는 단락 평가가 정확한 JASS 시맨틱이다.
    if (op === "and") {
      const l = this.evalCondBool(yield* this.evalExpr(leftE, frame, runCtx), runCtx);
      if (!l) return vbool(false);
      const r = this.evalCondBool(yield* this.evalExpr(rightE, frame, runCtx), runCtx);
      return vbool(r);
    }
    if (op === "or") {
      const l = this.evalCondBool(yield* this.evalExpr(leftE, frame, runCtx), runCtx);
      if (l) return vbool(true);
      const r = this.evalCondBool(yield* this.evalExpr(rightE, frame, runCtx), runCtx);
      return vbool(r);
    }

    const left = yield* this.evalExpr(leftE, frame, runCtx);
    const right = yield* this.evalExpr(rightE, frame, runCtx);

    if (op === "==") return vbool(valuesEqual(left, right));
    if (op === "!=") return vbool(!valuesEqual(left, right));

    // unknown(스텁 반환)은 상대 타입에 맞춰 강제 변환한다(deny-first #4).
    const hint = left.t !== "unknown" ? left.t : right.t;
    const l = resolveUnknown(left, hint === "unknown" ? "int" : hint);
    const r = resolveUnknown(right, l.t);

    if (op === "+" && l.t === "string" && r.t === "string") return vstring(l.v + r.v);

    if (l.t === "int" && r.t === "int") {
      switch (op) {
        case "+":
          return vint(l.v + r.v);
        case "-":
          return vint(l.v - r.v);
        case "*":
          return vint(l.v * r.v);
        case "/":
          return vint(r.v === 0 ? 0 : Math.trunc(l.v / r.v)); // JASS 정수나눗셈: 0 방향 절삭
        case "<":
          return vbool(l.v < r.v);
        case "<=":
          return vbool(l.v <= r.v);
        case ">":
          return vbool(l.v > r.v);
        case ">=":
          return vbool(l.v >= r.v);
        default:
          break;
      }
    }
    if (l.t === "real" && r.t === "real") {
      switch (op) {
        case "+":
          return vreal(l.v + r.v);
        case "-":
          return vreal(l.v - r.v);
        case "*":
          return vreal(l.v * r.v);
        case "/":
          return vreal(r.v === 0 ? 0 : l.v / r.v);
        case "<":
          return vbool(l.v < r.v);
        case "<=":
          return vbool(l.v <= r.v);
        case ">":
          return vbool(l.v > r.v);
        case ">=":
          return vbool(l.v >= r.v);
        default:
          break;
      }
    }
    // C-1(DISPATCH_SONNET_C1_COMBINE) 실측 발견 — JASS는 int/real 혼합 산술·비교에서 int를 real로
    // 자동승격한다(예: `real DB` 를 `DB<=0` 처럼 int 리터럴과 비교하는 관용구가 war3map.j PolledWait(CB)에
    // 실제로 등장 — 실측: ThreadCrashed "이항 연산 '<=' 타입 불일치/미지원: real vs int"). 기존 평가기는
    // int-int/real-real 동종 케이스만 다뤄 혼합 시 조용히 throw했다(R-3의 evalBoolExpr 누락 leaf와 동일
    // 유형 — 새 연산자 발명이 아니라 기존 이항연산 평가기의 누락된 타입조합 1개 추가).
    if ((l.t === "int" || l.t === "real") && (r.t === "int" || r.t === "real")) {
      const lv = l.v as number;
      const rv = r.v as number;
      switch (op) {
        case "+":
          return vreal(lv + rv);
        case "-":
          return vreal(lv - rv);
        case "*":
          return vreal(lv * rv);
        case "/":
          return vreal(rv === 0 ? 0 : lv / rv);
        case "<":
          return vbool(lv < rv);
        case "<=":
          return vbool(lv <= rv);
        case ">":
          return vbool(lv > rv);
        case ">=":
          return vbool(lv >= rv);
        default:
          break;
      }
    }
    throw new JassRuntimeError(`이항 연산 '${op}' 타입 불일치/미지원: ${l.t} vs ${r.t}`);
  }

  // ---- 함수 호출 디스패치 (TSA/ExecuteFunc는 VM 특수처리 → 사용자함수 → native → 스텁) ----
  private *evalCall(name: string, argExprs: Expr[], frame: Scope | null, runCtx: RunCtx): Generator<Yielded, JassValue, void> {
    // 인자는 언제나 좌→우 평가(부수효과 순서 결정론).
    const args: JassValue[] = [];
    for (const a of argExprs) args.push(yield* this.evalExpr(a, frame, runCtx));

    if (name === "TriggerSleepAction") {
      const seconds = args[0]?.t === "real" ? args[0].v : args[0]?.t === "int" ? args[0].v : 0;
      const ticks = secondsToTicks(seconds);
      yield { kind: "sleep", ticks };
      return VUNKNOWN;
    }

    if (name === "ExecuteFunc") {
      const target = args[0] && args[0].t === "string" ? args[0].v : "";
      return yield* this.execFunctionByName(target, [], runCtx);
    }

    if (this.functionIndex.has(name)) {
      return yield* this.execFunction(this.functionIndex.get(name)!, args, runCtx);
    }

    const native = this.natives.get(name);
    if (native) {
      const ctx = this.makeNativeContext(runCtx.threadId);
      return native(ctx, args);
    }

    this.emitEvent({ kind: "UnimplementedNative", name });
    return VUNKNOWN;
  }

  private makeNativeContext(threadId: number): NativeCallContext {
    const vm = this;
    return {
      threadId,
      handles: this.handles,
      sim: this.sim,
      threadMeta: threadId === -1 ? this.syncMeta : (this.threads.get(threadId)?.meta ?? {}),
      getGlobal: (name) => vm.getGlobal(name),
      setGlobal: (name, value) => vm.setGlobal(name, value),
      setGlobalIndexed: (name, index, value) => vm.setGlobalIndexed(name, index, value),
      callVm: (code, args) => {
        const name = vm.codeToName(code);
        const innerCtx: RunCtx = { threadId, steps: 0, depth: 0 };
        return vm.driveSyncStrict(vm.execFunctionByName(name, args, innerCtx));
      },
      spawnThread: (code, args) => vm.spawnThread(code, args),
      emit: (event) => vm.emitEvent(event),
    };
  }

  /** callVm 전용: sleep을 만나면 동기 문맥이라 진행할 수 없으므로 명시적으로 오류를 던진다
   *  (호출한 native의 상위 스레드가 잡아 ThreadCrashed 이벤트로 수렴 — VM 밖으로 새지 않음). */
  private driveSyncStrict(gen: Generator<Yielded, JassValue, void>): JassValue {
    const r = gen.next();
    if (!r.done) {
      throw new JassRuntimeError("동기 재진입 호출(callVm) 안에서 TriggerSleepAction 사용 불가");
    }
    return r.value;
  }
}
