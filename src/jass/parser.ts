/**
 * JASS 파서 (재귀하강) — R-107.
 * war3map.j 텍스트 → JassModule AST + FunctionIndex(삽입순) + GlobalsIndex + NativeIndex.
 * 문법 범위(순수 JASS): globals/endglobals, function/endfunction, native, local, set, call,
 * if/elseif/else/endif, loop/exitwhen/endloop, return, type extends.
 * 표현식 우선순위(낮음→높음): or, and, 비교(==,!=,<,<=,>,>=), 가감(+,-), 곱나(star,slash), 단항(-,not) 순.
 * 스코프 밖 문법(vJass 등)을 만나면 명시적 파스 에러로 위치 보고 (deny-first #5).
 * 순수 함수: sim/DOM/formats import 없음 (deny-first #3).
 */

import { tokenize } from "./lexer.ts";
import type { Token, TokenKind } from "./lexer.ts";
import type {
  Expr,
  Stmt,
  Param,
  GlobalDecl,
  FuncDecl,
  NativeDecl,
  TypeDecl,
  LocalDecl,
  SetStmt,
  CallStmt,
  IfStmt,
  LoopStmt,
  ExitWhenStmt,
  ReturnStmt,
  JassModule,
} from "./ast.ts";

export class JassParseError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(`JASS parse error at line ${line}: ${message}`);
    this.name = "JassParseError";
    this.line = line;
  }
}

export interface ParseResult {
  ast: JassModule;
  functionIndex: Map<string, FuncDecl>;
  globalsIndex: Map<string, GlobalDecl>;
  nativeIndex: Map<string, NativeDecl>;
}

class TokenStream {
  private pos = 0;
  private tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  peek(offset = 0): Token {
    const idx = this.pos + offset;
    return idx < this.tokens.length ? this.tokens[idx]! : this.tokens[this.tokens.length - 1]!;
  }

  next(): Token {
    const t = this.peek();
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }
}

function isKeywordText(tok: Token, text: string): boolean {
  return tok.kind === "KEYWORD" && tok.text === text;
}

function isKeywordOneOf(tok: Token, texts: readonly string[]): boolean {
  return tok.kind === "KEYWORD" && texts.includes(tok.text);
}

function describe(tok: Token): string {
  return tok.kind === "EOF" ? "<EOF>" : `${tok.text || tok.kind}`;
}

function expectKeywordText(ts: TokenStream, text: string): Token {
  const tok = ts.peek();
  if (!isKeywordText(tok, text)) {
    throw new JassParseError(`expected '${text}', got '${describe(tok)}'`, tok.line);
  }
  return ts.next();
}

function expectIdent(ts: TokenStream): Token {
  const tok = ts.peek();
  if (tok.kind !== "IDENT") {
    throw new JassParseError(`expected identifier, got '${describe(tok)}'`, tok.line);
  }
  return ts.next();
}

function expectKind(ts: TokenStream, kind: TokenKind): Token {
  const tok = ts.peek();
  if (tok.kind !== kind) {
    throw new JassParseError(`expected ${kind}, got '${describe(tok)}'`, tok.line);
  }
  return ts.next();
}

function skipNewlines(ts: TokenStream): void {
  while (ts.peek().kind === "NEWLINE") ts.next();
}

function parseBlockGeneric<T>(ts: TokenStream, parseOne: () => T, terminators: readonly string[]): T[] {
  const items: T[] = [];
  skipNewlines(ts);
  while (!isKeywordOneOf(ts.peek(), terminators)) {
    if (ts.peek().kind === "EOF") {
      throw new JassParseError(`unexpected EOF, expected one of [${terminators.join(", ")}]`, ts.peek().line);
    }
    items.push(parseOne());
    skipNewlines(ts);
  }
  return items;
}

// ---- 표현식 ----

function parseArgList(ts: TokenStream): Expr[] {
  const args: Expr[] = [];
  if (ts.peek().kind === "RPAREN") return args;
  args.push(parseExpr(ts));
  while (ts.peek().kind === "COMMA") {
    ts.next();
    args.push(parseExpr(ts));
  }
  return args;
}

export function parseExpr(ts: TokenStream): Expr {
  return parseOr(ts);
}

function parseOr(ts: TokenStream): Expr {
  let left = parseAnd(ts);
  while (isKeywordText(ts.peek(), "or")) {
    const op = ts.next();
    const right = parseAnd(ts);
    left = { kind: "BinaryExpr", line: op.line, op: "or", left, right };
  }
  return left;
}

function parseAnd(ts: TokenStream): Expr {
  let left = parseEquality(ts);
  while (isKeywordText(ts.peek(), "and")) {
    const op = ts.next();
    const right = parseEquality(ts);
    left = { kind: "BinaryExpr", line: op.line, op: "and", left, right };
  }
  return left;
}

function parseEquality(ts: TokenStream): Expr {
  let left = parseRelational(ts);
  while (ts.peek().kind === "EQEQ" || ts.peek().kind === "NEQ") {
    const op = ts.next();
    const right = parseRelational(ts);
    left = { kind: "BinaryExpr", line: op.line, op: op.text, left, right };
  }
  return left;
}

const RELATIONAL_KINDS: readonly TokenKind[] = ["LT", "LE", "GT", "GE"];

function parseRelational(ts: TokenStream): Expr {
  let left = parseAdditive(ts);
  while (RELATIONAL_KINDS.includes(ts.peek().kind)) {
    const op = ts.next();
    const right = parseAdditive(ts);
    left = { kind: "BinaryExpr", line: op.line, op: op.text, left, right };
  }
  return left;
}

function parseAdditive(ts: TokenStream): Expr {
  let left = parseMultiplicative(ts);
  while (ts.peek().kind === "PLUS" || ts.peek().kind === "MINUS") {
    const op = ts.next();
    const right = parseMultiplicative(ts);
    left = { kind: "BinaryExpr", line: op.line, op: op.text, left, right };
  }
  return left;
}

function parseMultiplicative(ts: TokenStream): Expr {
  let left = parseUnary(ts);
  while (ts.peek().kind === "STAR" || ts.peek().kind === "SLASH") {
    const op = ts.next();
    const right = parseUnary(ts);
    left = { kind: "BinaryExpr", line: op.line, op: op.text, left, right };
  }
  return left;
}

function parseUnary(ts: TokenStream): Expr {
  const tok = ts.peek();
  if (tok.kind === "MINUS") {
    ts.next();
    const operand = parseUnary(ts);
    return { kind: "UnaryExpr", line: tok.line, op: "-", operand };
  }
  if (isKeywordText(tok, "not")) {
    ts.next();
    const operand = parseUnary(ts);
    return { kind: "UnaryExpr", line: tok.line, op: "not", operand };
  }
  return parsePrimary(ts);
}

function parsePrimary(ts: TokenStream): Expr {
  const tok = ts.peek();
  switch (tok.kind) {
    case "LPAREN": {
      ts.next();
      const inner = parseExpr(ts);
      expectKind(ts, "RPAREN");
      return inner;
    }
    case "INTEGER":
      ts.next();
      return { kind: "IntLiteral", line: tok.line, value: tok.value as number };
    case "REAL":
      ts.next();
      return { kind: "RealLiteral", line: tok.line, value: tok.value as number };
    case "STRING":
      ts.next();
      return { kind: "StringLiteral", line: tok.line, value: tok.value as string };
    case "RAWCODE":
      ts.next();
      return { kind: "RawcodeLiteral", line: tok.line, value: tok.value as number, text: tok.text };
    case "IDENT": {
      ts.next();
      if (ts.peek().kind === "LPAREN") {
        ts.next();
        const args = parseArgList(ts);
        expectKind(ts, "RPAREN");
        return { kind: "CallExpr", line: tok.line, name: tok.text, args };
      }
      if (ts.peek().kind === "LBRACKET") {
        ts.next();
        const index = parseExpr(ts);
        expectKind(ts, "RBRACKET");
        return { kind: "ArrayIndexExpr", line: tok.line, name: tok.text, index };
      }
      return { kind: "VarExpr", line: tok.line, name: tok.text };
    }
    case "KEYWORD": {
      if (tok.text === "true") {
        ts.next();
        return { kind: "BoolLiteral", line: tok.line, value: true };
      }
      if (tok.text === "false") {
        ts.next();
        return { kind: "BoolLiteral", line: tok.line, value: false };
      }
      if (tok.text === "null") {
        ts.next();
        return { kind: "NullLiteral", line: tok.line };
      }
      if (tok.text === "function") {
        ts.next();
        const nameTok = expectIdent(ts);
        return { kind: "FunctionRefExpr", line: tok.line, name: nameTok.text };
      }
      break;
    }
    default:
      break;
  }
  throw new JassParseError(`unexpected token '${describe(tok)}' in expression`, tok.line);
}

// ---- 문(statement) ----

const IF_TERMINATORS = ["elseif", "else", "endif"] as const;

function parseLocalDecl(ts: TokenStream): LocalDecl {
  const line = expectKeywordText(ts, "local").line;
  const typeTok = expectIdent(ts);
  let isArray = false;
  if (isKeywordText(ts.peek(), "array")) {
    ts.next();
    isArray = true;
  }
  const nameTok = expectIdent(ts);
  let init: Expr | null = null;
  if (ts.peek().kind === "ASSIGN") {
    ts.next();
    init = parseExpr(ts);
  }
  return { kind: "LocalDecl", line, type: typeTok.text, name: nameTok.text, isArray, init };
}

function parseSetStmt(ts: TokenStream): SetStmt {
  const line = expectKeywordText(ts, "set").line;
  const nameTok = expectIdent(ts);
  let index: Expr | null = null;
  if (ts.peek().kind === "LBRACKET") {
    ts.next();
    index = parseExpr(ts);
    expectKind(ts, "RBRACKET");
  }
  expectKind(ts, "ASSIGN");
  const value = parseExpr(ts);
  return { kind: "SetStmt", line, name: nameTok.text, index, value };
}

function parseCallStmt(ts: TokenStream): CallStmt {
  const line = expectKeywordText(ts, "call").line;
  const nameTok = expectIdent(ts);
  expectKind(ts, "LPAREN");
  const args = parseArgList(ts);
  expectKind(ts, "RPAREN");
  return { kind: "CallStmt", line, name: nameTok.text, args };
}

function parseIfStmt(ts: TokenStream): IfStmt {
  const line = expectKeywordText(ts, "if").line;
  const cond = parseExpr(ts);
  expectKeywordText(ts, "then");
  const thenBody = parseBlockGeneric(ts, () => parseStatement(ts), IF_TERMINATORS);
  const elseifs: Array<{ cond: Expr; body: Stmt[] }> = [];
  while (isKeywordText(ts.peek(), "elseif")) {
    ts.next();
    const c = parseExpr(ts);
    expectKeywordText(ts, "then");
    const body = parseBlockGeneric(ts, () => parseStatement(ts), IF_TERMINATORS);
    elseifs.push({ cond: c, body });
  }
  let elseBody: Stmt[] | null = null;
  if (isKeywordText(ts.peek(), "else")) {
    ts.next();
    elseBody = parseBlockGeneric(ts, () => parseStatement(ts), ["endif"]);
  }
  expectKeywordText(ts, "endif");
  return { kind: "IfStmt", line, cond, then: thenBody, elseifs, elseBody };
}

function parseLoopStmt(ts: TokenStream): LoopStmt {
  const line = expectKeywordText(ts, "loop").line;
  const body = parseBlockGeneric(ts, () => parseStatement(ts), ["endloop"]);
  expectKeywordText(ts, "endloop");
  return { kind: "LoopStmt", line, body };
}

function parseExitWhenStmt(ts: TokenStream): ExitWhenStmt {
  const line = expectKeywordText(ts, "exitwhen").line;
  const cond = parseExpr(ts);
  return { kind: "ExitWhenStmt", line, cond };
}

const RETURN_STOP_KEYWORDS = ["endfunction", "elseif", "else", "endif", "endloop"] as const;

function parseReturnStmt(ts: TokenStream): ReturnStmt {
  const line = expectKeywordText(ts, "return").line;
  const tok = ts.peek();
  let value: Expr | null = null;
  if (tok.kind !== "NEWLINE" && tok.kind !== "EOF" && !isKeywordOneOf(tok, RETURN_STOP_KEYWORDS)) {
    value = parseExpr(ts);
  }
  return { kind: "ReturnStmt", line, value };
}

function parseStatement(ts: TokenStream): Stmt {
  const tok = ts.peek();
  if (tok.kind === "KEYWORD") {
    switch (tok.text) {
      case "local":
        return parseLocalDecl(ts);
      case "set":
        return parseSetStmt(ts);
      case "call":
        return parseCallStmt(ts);
      case "if":
        return parseIfStmt(ts);
      case "loop":
        return parseLoopStmt(ts);
      case "exitwhen":
        return parseExitWhenStmt(ts);
      case "return":
        return parseReturnStmt(ts);
      default:
        break;
    }
  }
  throw new JassParseError(`unexpected token '${describe(tok)}' — statement expected`, tok.line);
}

// ---- 선언(top-level) ----

function parseParamList(ts: TokenStream): Param[] {
  if (isKeywordText(ts.peek(), "nothing")) {
    ts.next();
    return [];
  }
  const params: Param[] = [];
  for (;;) {
    const typeTok = expectIdent(ts);
    const nameTok = expectIdent(ts);
    params.push({ type: typeTok.text, name: nameTok.text });
    if (ts.peek().kind === "COMMA") {
      ts.next();
      continue;
    }
    break;
  }
  return params;
}

function parseReturnType(ts: TokenStream): string {
  if (isKeywordText(ts.peek(), "nothing")) {
    ts.next();
    return "nothing";
  }
  return expectIdent(ts).text;
}

function parseGlobalDecl(ts: TokenStream): GlobalDecl {
  const startTok = ts.peek();
  let constant = false;
  if (isKeywordText(ts.peek(), "constant")) {
    ts.next();
    constant = true;
  }
  const typeTok = expectIdent(ts);
  let isArray = false;
  if (isKeywordText(ts.peek(), "array")) {
    ts.next();
    isArray = true;
  }
  const nameTok = expectIdent(ts);
  let init: Expr | null = null;
  if (ts.peek().kind === "ASSIGN") {
    ts.next();
    init = parseExpr(ts);
  }
  return { kind: "GlobalDecl", line: startTok.line, constant, type: typeTok.text, name: nameTok.text, isArray, init };
}

function parseGlobalsBlock(ts: TokenStream): { decls: GlobalDecl[]; startLine: number; endLine: number } {
  const startLine = expectKeywordText(ts, "globals").line;
  const decls = parseBlockGeneric(ts, () => parseGlobalDecl(ts), ["endglobals"]);
  const endLine = expectKeywordText(ts, "endglobals").line;
  return { decls, startLine, endLine };
}

function parseFuncDecl(ts: TokenStream): FuncDecl {
  const line = expectKeywordText(ts, "function").line;
  const nameTok = expectIdent(ts);
  expectKeywordText(ts, "takes");
  const takes = parseParamList(ts);
  expectKeywordText(ts, "returns");
  const returns = parseReturnType(ts);
  const body = parseBlockGeneric(ts, () => parseStatement(ts), ["endfunction"]);
  expectKeywordText(ts, "endfunction");
  return { kind: "FuncDecl", line, name: nameTok.text, takes, returns, body };
}

function parseNativeDecl(ts: TokenStream, constant: boolean): NativeDecl {
  const line = expectKeywordText(ts, "native").line;
  const nameTok = expectIdent(ts);
  expectKeywordText(ts, "takes");
  const takes = parseParamList(ts);
  expectKeywordText(ts, "returns");
  const returns = parseReturnType(ts);
  return { kind: "NativeDecl", line, constant, name: nameTok.text, takes, returns };
}

function parseTypeDecl(ts: TokenStream): TypeDecl {
  const line = expectKeywordText(ts, "type").line;
  const nameTok = expectIdent(ts);
  expectKeywordText(ts, "extends");
  const parentTok = expectIdent(ts);
  return { kind: "TypeDecl", line, name: nameTok.text, extends: parentTok.text };
}

function parseModule(ts: TokenStream): ParseResult {
  const globals: GlobalDecl[] = [];
  const functions: FuncDecl[] = [];
  const natives: NativeDecl[] = [];
  const types: TypeDecl[] = [];
  const functionIndex = new Map<string, FuncDecl>();
  const globalsIndex = new Map<string, GlobalDecl>();
  const nativeIndex = new Map<string, NativeDecl>();
  let globalsSpan: { startLine: number; endLine: number } | null = null;

  skipNewlines(ts);
  while (ts.peek().kind !== "EOF") {
    const tok = ts.peek();
    if (isKeywordText(tok, "globals")) {
      const block = parseGlobalsBlock(ts);
      for (const g of block.decls) {
        globals.push(g);
        globalsIndex.set(g.name, g);
      }
      globalsSpan = { startLine: block.startLine, endLine: block.endLine };
    } else if (isKeywordText(tok, "function")) {
      const fn = parseFuncDecl(ts);
      functions.push(fn);
      functionIndex.set(fn.name, fn);
    } else if (isKeywordText(tok, "constant") && isKeywordText(ts.peek(1), "native")) {
      ts.next(); // consume "constant"
      const nat = parseNativeDecl(ts, true);
      natives.push(nat);
      nativeIndex.set(nat.name, nat);
    } else if (isKeywordText(tok, "native")) {
      const nat = parseNativeDecl(ts, false);
      natives.push(nat);
      nativeIndex.set(nat.name, nat);
    } else if (isKeywordText(tok, "type")) {
      const t = parseTypeDecl(ts);
      types.push(t);
    } else {
      throw new JassParseError(`unexpected top-level token '${describe(tok)}'`, tok.line);
    }
    skipNewlines(ts);
  }

  return {
    ast: { kind: "JassModule", globals, functions, natives, types, globalsSpan },
    functionIndex,
    globalsIndex,
    nativeIndex,
  };
}

/** war3map.j 텍스트 → AST + 함수/전역/native 인덱스. 결정론 순수함수(같은 텍스트 → 같은 AST). */
export function parseJass(source: string): ParseResult {
  const tokens = tokenize(source);
  const ts = new TokenStream(tokens);
  return parseModule(ts);
}
