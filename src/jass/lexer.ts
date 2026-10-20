/**
 * JASS 렉서 — R-107.
 * 실측 근거(docs/IMPLEMENTATION_MAP.md §2.2/§2.4/부록B): 개행은 \r | \n | \r\n 전부 처리해야
 * 한다(실맵 war3map.j는 \r 단독 78,157회 — 이걸 놓치면 "1줄짜리 2.2MB" 파싱 실패).
 * 실수 리터럴 `1.` `.1` 형태가 실재(TriggerSleepAction 인자) — 숫자 규칙에 포함.
 * 단일 패스 문자 렉서(정규식 전체 스캔 금지) — 78k줄 < 5초 성능 목표.
 * 순수 함수: 이 모듈은 sim/DOM/formats를 import하지 않는다 (deny-first #3).
 */

export type TokenKind =
  | "IDENT"
  | "KEYWORD"
  | "INTEGER"
  | "REAL"
  | "STRING"
  | "RAWCODE"
  | "LPAREN"
  | "RPAREN"
  | "LBRACKET"
  | "RBRACKET"
  | "COMMA"
  | "PLUS"
  | "MINUS"
  | "STAR"
  | "SLASH"
  | "ASSIGN"
  | "EQEQ"
  | "NEQ"
  | "LT"
  | "LE"
  | "GT"
  | "GE"
  | "NEWLINE"
  | "EOF";

export interface Token {
  kind: TokenKind;
  /** IDENT/KEYWORD: 이름 자체. 연산자/구두점: 기호. 리터럴: 원문(디버그용, 대량 인용 금지 정책은 fixture/스냅샷에만 적용). */
  text: string;
  line: number;
  value?: number | string | boolean;
}

export class JassLexError extends Error {
  line: number;
  constructor(message: string, line: number) {
    super(`JASS lex error at line ${line}: ${message}`);
    this.name = "JassLexError";
    this.line = line;
  }
}

const KEYWORDS = new Set([
  "globals",
  "endglobals",
  "function",
  "endfunction",
  "takes",
  "returns",
  "native",
  "local",
  "set",
  "call",
  "if",
  "then",
  "elseif",
  "else",
  "endif",
  "loop",
  "endloop",
  "exitwhen",
  "return",
  "type",
  "extends",
  "constant",
  "array",
  "nothing",
  "true",
  "false",
  "null",
  "not",
  "and",
  "or",
]);

function isDigitCh(cc: number): boolean {
  return cc >= 48 && cc <= 57;
}

function isIdentStartCh(cc: number): boolean {
  return (cc >= 65 && cc <= 90) || (cc >= 97 && cc <= 122) || cc === 95;
}

function isIdentPartCh(cc: number): boolean {
  return isIdentStartCh(cc) || isDigitCh(cc);
}

function isHexDigitCh(cc: number): boolean {
  return isDigitCh(cc) || (cc >= 65 && cc <= 70) || (cc >= 97 && cc <= 102);
}

/** 소스 텍스트 → 토큰 배열. 단일 패스, 정규식 미사용(핫루프). */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const n = source.length;
  let i = 0;
  let line = 1;

  const push = (kind: TokenKind, text: string, tline: number, value?: number | string | boolean) => {
    tokens.push({ kind, text, line: tline, value });
  };

  while (i < n) {
    const cc = source.charCodeAt(i);

    // 개행 런 (\r|\n|\r\n 혼합 전부, 연속분은 NEWLINE 토큰 1개로 병합)
    if (cc === 13 || cc === 10) {
      const startLine = line;
      while (i < n) {
        const c2 = source.charCodeAt(i);
        if (c2 === 13 && source.charCodeAt(i + 1) === 10) {
          i += 2;
          line++;
        } else if (c2 === 13 || c2 === 10) {
          i += 1;
          line++;
        } else {
          break;
        }
      }
      push("NEWLINE", "\n", startLine);
      continue;
    }

    // 공백/탭
    if (cc === 32 || cc === 9) {
      i++;
      continue;
    }

    // 줄 주석
    if (cc === 47 /* / */ && source.charCodeAt(i + 1) === 47) {
      i += 2;
      while (i < n) {
        const c2 = source.charCodeAt(i);
        if (c2 === 13 || c2 === 10) break;
        i++;
      }
      continue;
    }

    // 식별자/키워드
    if (isIdentStartCh(cc)) {
      const start = i;
      i++;
      while (i < n && isIdentPartCh(source.charCodeAt(i))) i++;
      const text = source.slice(start, i);
      push(KEYWORDS.has(text) ? "KEYWORD" : "IDENT", text, line);
      continue;
    }

    // 숫자: 십진/0x/8진/실수(1. .1)
    if (isDigitCh(cc) || (cc === 46 /* . */ && isDigitCh(source.charCodeAt(i + 1)))) {
      const startLine = line;
      const start = i;

      if (cc === 48 && (source.charCodeAt(i + 1) === 120 || source.charCodeAt(i + 1) === 88)) {
        // 0x / 0X hex
        i += 2;
        const hexStart = i;
        while (i < n && isHexDigitCh(source.charCodeAt(i))) i++;
        if (i === hexStart) throw new JassLexError("hex literal에 자릿수가 없음", startLine);
        const hexText = source.slice(hexStart, i);
        push("INTEGER", source.slice(start, i), startLine, parseInt(hexText, 16));
        continue;
      }

      let j = i;
      while (j < n && isDigitCh(source.charCodeAt(j))) j++;

      if (j < n && source.charCodeAt(j) === 46 /* . */) {
        // 실수: 1.5 / 1. / .1
        let k = j + 1;
        while (k < n && isDigitCh(source.charCodeAt(k))) k++;
        const text = source.slice(i, k);
        i = k;
        push("REAL", text, startLine, parseFloat(text));
        continue;
      }

      const text = source.slice(i, j);
      i = j;
      let value: number;
      if (text.length > 1 && text.charCodeAt(0) === 48 && /^[0-7]+$/.test(text.slice(1))) {
        value = parseInt(text, 8);
      } else {
        value = parseInt(text, 10);
      }
      push("INTEGER", text, startLine, value);
      continue;
    }

    // $HEX 리터럴
    if (cc === 36 /* $ */) {
      const startLine = line;
      const start = i;
      i++;
      const hexStart = i;
      while (i < n && isHexDigitCh(source.charCodeAt(i))) i++;
      if (i === hexStart) throw new JassLexError("$hex literal에 자릿수가 없음", startLine);
      const hexText = source.slice(hexStart, i);
      push("INTEGER", source.slice(start, i), startLine, parseInt(hexText, 16));
      continue;
    }

    // 문자열
    if (cc === 34 /* " */) {
      const startLine = line;
      i++;
      let value = "";
      while (i < n) {
        const c2 = source.charCodeAt(i);
        if (c2 === 34) break;
        if (c2 === 13 || c2 === 10) throw new JassLexError("문자열 리터럴이 개행 전에 닫히지 않음", startLine);
        if (c2 === 92 /* \ */) {
          const esc = source[i + 1];
          switch (esc) {
            case '"':
              value += '"';
              i += 2;
              break;
            case "\\":
              value += "\\";
              i += 2;
              break;
            case "n":
              value += "\n";
              i += 2;
              break;
            case "r":
              value += "\r";
              i += 2;
              break;
            case "t":
              value += "\t";
              i += 2;
              break;
            default:
              value += source[i];
              i += 1;
          }
        } else {
          value += source[i];
          i++;
        }
      }
      if (i >= n) throw new JassLexError("문자열 리터럴이 EOF 전에 닫히지 않음", startLine);
      i++; // closing quote
      push("STRING", value, startLine, value);
      continue;
    }

    // rawcode 'ABCD'
    if (cc === 39 /* ' */) {
      const startLine = line;
      i++;
      const start = i;
      while (i < n) {
        const c2 = source.charCodeAt(i);
        if (c2 === 39 || c2 === 13 || c2 === 10) break;
        i++;
      }
      if (i >= n || source.charCodeAt(i) !== 39) throw new JassLexError("rawcode 리터럴이 닫히지 않음", startLine);
      const text = source.slice(start, i);
      i++; // closing '
      let packed = 0;
      for (let k = 0; k < text.length; k++) packed = (packed * 256 + text.charCodeAt(k)) >>> 0;
      push("RAWCODE", text, startLine, packed | 0);
      continue;
    }

    // 구두점/연산자
    switch (cc) {
      case 40: // (
        push("LPAREN", "(", line);
        i++;
        continue;
      case 41: // )
        push("RPAREN", ")", line);
        i++;
        continue;
      case 91: // [
        push("LBRACKET", "[", line);
        i++;
        continue;
      case 93: // ]
        push("RBRACKET", "]", line);
        i++;
        continue;
      case 44: // ,
        push("COMMA", ",", line);
        i++;
        continue;
      case 43: // +
        push("PLUS", "+", line);
        i++;
        continue;
      case 45: // -
        push("MINUS", "-", line);
        i++;
        continue;
      case 42: // *
        push("STAR", "*", line);
        i++;
        continue;
      case 47: // / (단독 — //는 위에서 이미 처리됨)
        push("SLASH", "/", line);
        i++;
        continue;
      case 61: // =
        if (source.charCodeAt(i + 1) === 61) {
          push("EQEQ", "==", line);
          i += 2;
        } else {
          push("ASSIGN", "=", line);
          i++;
        }
        continue;
      case 33: // !
        if (source.charCodeAt(i + 1) === 61) {
          push("NEQ", "!=", line);
          i += 2;
          continue;
        }
        throw new JassLexError(`예기치 않은 문자 '!'`, line);
      case 60: // <
        if (source.charCodeAt(i + 1) === 61) {
          push("LE", "<=", line);
          i += 2;
        } else {
          push("LT", "<", line);
          i++;
        }
        continue;
      case 62: // >
        if (source.charCodeAt(i + 1) === 61) {
          push("GE", ">=", line);
          i += 2;
        } else {
          push("GT", ">", line);
          i++;
        }
        continue;
      default:
        throw new JassLexError(`예기치 않은 문자 코드 ${cc}`, line);
    }
  }

  push("EOF", "", line);
  return tokens;
}
