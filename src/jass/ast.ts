/**
 * JASS AST 타입 — R-107.
 * 계약: docs/IMPLEMENTATION_MAP.md §3 R-107. AST는 JSON 직렬화 가능한 plain object
 * (각 노드 `kind` 필드 + line 번호만; 토큰 오프셋은 과설계 — IR 원칙 상속).
 * 이 모듈은 순수 타입 정의만 담는다. sim/DOM/formats import 없음 (deny-first #3).
 */

export type FourCC = string;

export interface Param {
  type: string;
  name: string;
}

// ---- 표현식 ----

export type Expr =
  | BinaryExpr
  | UnaryExpr
  | CallExpr
  | ArrayIndexExpr
  | VarExpr
  | IntLiteral
  | RealLiteral
  | StringLiteral
  | RawcodeLiteral
  | BoolLiteral
  | NullLiteral
  | FunctionRefExpr;

export interface BinaryExpr {
  kind: "BinaryExpr";
  line: number;
  /** or | and | == | != | < | <= | > | >= | + | - | * | / */
  op: string;
  left: Expr;
  right: Expr;
}

export interface UnaryExpr {
  kind: "UnaryExpr";
  line: number;
  /** - | not */
  op: string;
  operand: Expr;
}

export interface CallExpr {
  kind: "CallExpr";
  line: number;
  name: string;
  args: Expr[];
}

export interface ArrayIndexExpr {
  kind: "ArrayIndexExpr";
  line: number;
  name: string;
  index: Expr;
}

export interface VarExpr {
  kind: "VarExpr";
  line: number;
  name: string;
}

export interface IntLiteral {
  kind: "IntLiteral";
  line: number;
  value: number;
}

export interface RealLiteral {
  kind: "RealLiteral";
  line: number;
  value: number;
}

export interface StringLiteral {
  kind: "StringLiteral";
  line: number;
  value: string;
}

/** 'ABCD' 형태 rawcode — 4CC를 u32(부호있는 int32 재현)로 패킹한 값 + 원문 텍스트 보존. */
export interface RawcodeLiteral {
  kind: "RawcodeLiteral";
  line: number;
  value: number;
  text: string;
}

export interface BoolLiteral {
  kind: "BoolLiteral";
  line: number;
  value: boolean;
}

export interface NullLiteral {
  kind: "NullLiteral";
  line: number;
}

/** `function <name>` — code 타입 값으로서의 함수 참조 (ExecuteFunc 등의 인자). */
export interface FunctionRefExpr {
  kind: "FunctionRefExpr";
  line: number;
  name: string;
}

// ---- 문(statement) ----

export type Stmt = LocalDecl | SetStmt | CallStmt | IfStmt | LoopStmt | ExitWhenStmt | ReturnStmt;

export interface LocalDecl {
  kind: "LocalDecl";
  line: number;
  type: string;
  name: string;
  isArray: boolean;
  init: Expr | null;
}

export interface SetStmt {
  kind: "SetStmt";
  line: number;
  name: string;
  /** 배열 대입(`set a[i] = ...`)이면 인덱스 표현식, 아니면 null. */
  index: Expr | null;
  value: Expr;
}

export interface CallStmt {
  kind: "CallStmt";
  line: number;
  name: string;
  args: Expr[];
}

export interface IfStmt {
  kind: "IfStmt";
  line: number;
  cond: Expr;
  then: Stmt[];
  elseifs: Array<{ cond: Expr; body: Stmt[] }>;
  elseBody: Stmt[] | null;
}

export interface LoopStmt {
  kind: "LoopStmt";
  line: number;
  body: Stmt[];
}

export interface ExitWhenStmt {
  kind: "ExitWhenStmt";
  line: number;
  cond: Expr;
}

export interface ReturnStmt {
  kind: "ReturnStmt";
  line: number;
  value: Expr | null;
}

// ---- 선언(top-level) ----

export interface GlobalDecl {
  kind: "GlobalDecl";
  line: number;
  constant: boolean;
  type: string;
  name: string;
  isArray: boolean;
  init: Expr | null;
}

export interface FuncDecl {
  kind: "FuncDecl";
  line: number;
  name: string;
  takes: Param[];
  /** "nothing" 또는 타입명. */
  returns: string;
  body: Stmt[];
}

export interface NativeDecl {
  kind: "NativeDecl";
  line: number;
  constant: boolean;
  name: string;
  takes: Param[];
  returns: string;
}

export interface TypeDecl {
  kind: "TypeDecl";
  line: number;
  name: string;
  extends: string;
}

export interface JassModule {
  kind: "JassModule";
  globals: GlobalDecl[];
  functions: FuncDecl[];
  natives: NativeDecl[];
  types: TypeDecl[];
  /** globals 블록 실측 검증용 — 블록이 없으면 null, 여러 블록이면 마지막 블록 span. */
  globalsSpan: { startLine: number; endLine: number } | null;
}
