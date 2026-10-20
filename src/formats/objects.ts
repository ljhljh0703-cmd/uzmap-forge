/**
 * WC3 오브젝트 수정 파일 파서 — w3u(유닛)/w3t(아이템)/w3b(destructable)/w3h(버프)의
 * "basic" 레이아웃과 w3a(어빌리티)/w3d(doodad)/w3q(업그레이드)의 "extended" 레이아웃을
 * 공통 코어 1개로 읽는다. R-106 (docs/IMPLEMENTATION_MAP.md §3).
 *
 * 계약: src/formats/는 순수 함수만(부수효과 0), sim/jass/DOM import 금지 — 바이너리→IR만.
 * 손실 정책: mods의 raw 4CC 필드명·값은 그대로 보존한다(의미 해석은 R-202 몫). 값 타입
 * (0=int/1=real/2=unreal/3=string)은 ParsedObjectFile 단계에서 보존하고, IR용 `ObjectMod`로
 * 좁힐 때(toObjectMods)만 버린다 — IR 스키마는 계약대로 `column?: number` 추가분만 반영.
 *
 * 레이아웃 출처: docs/UPSTREAM_LEDGER.md의 wc3maptranslator 항목(포맷 지식 참조, 코드 차용 0)과
 * 정합하는 일반적인 WC3 오브젝트 수정 포맷 지식을, fixtures/maps/GemTower_Max_7C.w3x의
 * war3map.w3u/w3t/w3h(basic)·war3map.w3a/w3q(extended) 5개 파일을 실제로 바이트 단위 프로빙해
 * 확정했다(레포 밖 1회성 스크립트, src/** 무변경 — AGENTS.md §부록B 지침). 확정된 순서:
 *
 *   file      := version:u32 originalTable customTable trailing:bytes
 *   table     := count:u32 entry*
 *   entry     := oldId:FourCC newId:FourCC modCount:u32 mod*
 *   mod(basic)    := fieldId:FourCC varType:u32 value(varType) endMarker:u32
 *   mod(extended) := fieldId:FourCC varType:u32 level:u32 column:u32 value(varType) endMarker:u32
 *   value(0=int)    := i32
 *   value(1=real)   := f32
 *   value(2=unreal) := f32
 *   value(3=string) := 널종결 UTF-8 문자열
 *
 * 원본수정 테이블(첫 번째 table)의 entry.newId는 실측상 항상 4바이트 0 — IR에서는 baseId만
 * 의미 있는 "원본 수정"이므로 newId를 null로 접는다(테이블 소속으로 판정, 바이트 값으로 판정하지
 * 않음). 커스텀 테이블(두 번째 table)의 entry.newId는 실제 새 4CC.
 *
 * endMarker(각 mod 끝 4바이트)는 실측 7,190+6,027+124+256개 mod 전수에서 항상 0이었다 — 의미
 * 불명(예약/패딩으로 추정). 읽고 버린다(재직렬화가 필요해지면 0 고정으로 손실 없이 복원 가능).
 * 파일 전체 끝의 trailing bytes는 별개 문제로, 실측 5파일 전부 정확히 4B였다(정체 미확인 —
 * IMPLEMENTATION_MAP A-1/R7) — 에러로 취급하지 않고 `trailing`에 그대로 보존한다.
 */
import type { FourCC, ObjectMod } from "../ir/types.ts";

export type ObjectFileMode = "basic" | "extended";

/** 0=int, 1=real, 2=unreal, 3=string. */
export type ValueType = 0 | 1 | 2 | 3;

export const VALUE_TYPE = {
  INT: 0,
  REAL: 1,
  UNREAL: 2,
  STRING: 3,
} as const;

/** src/formats/ 계약: 실패는 항상 타입드 예외로 표면화(조용한 오파싱 금지). */
export class ObjectFileFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ObjectFileFormatError";
  }
}

export interface ParsedObjectMod {
  field: FourCC;
  varType: ValueType;
  value: number | string;
  /** extended 모드에서만 존재(basic에는 키 자체가 없음). */
  level?: number;
  /** extended 모드에서만 존재(basic에는 키 자체가 없음). */
  column?: number;
}

export interface ParsedObjectEntry {
  oldId: FourCC;
  /** null = 원본수정 테이블 소속(원본 4CC만 의미 있음), 값 = 커스텀 테이블의 새 4CC. */
  newId: FourCC | null;
  mods: ParsedObjectMod[];
}

export interface ParsedObjectFile {
  version: number;
  mode: ObjectFileMode;
  kind: ObjectMod["kind"];
  original: ParsedObjectEntry[];
  custom: ParsedObjectEntry[];
  /** 두 테이블을 다 읽은 뒤 남는 파일 꼬리 바이트 — 실측 5파일 전부 4B, 보존만(에러 아님). */
  trailing: Uint8Array;
}

interface Cursor {
  tell(): number;
  readUint32(what: string): number;
  readInt32(what: string): number;
  readFloat32(what: string): number;
  readFourCC(what: string): string;
  readCString(what: string): string;
  remaining(): Uint8Array;
}

function createCursor(bytes: Uint8Array): Cursor {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;

  function need(n: number, what: string): void {
    if (offset + n > bytes.length) {
      throw new ObjectFileFormatError(
        `unexpected end of file while reading ${what} at offset ${offset} (need ${n} byte(s), have ${bytes.length - offset})`,
      );
    }
  }

  return {
    tell(): number {
      return offset;
    },
    readUint32(what: string): number {
      need(4, what);
      const v = view.getUint32(offset, true);
      offset += 4;
      return v;
    },
    readInt32(what: string): number {
      need(4, what);
      const v = view.getInt32(offset, true);
      offset += 4;
      return v;
    },
    readFloat32(what: string): number {
      need(4, what);
      const v = view.getFloat32(offset, true);
      offset += 4;
      return v;
    },
    readFourCC(what: string): string {
      need(4, what);
      let s = "";
      for (let i = 0; i < 4; i++) s += String.fromCharCode(bytes[offset + i]!);
      offset += 4;
      return s;
    },
    readCString(what: string): string {
      const start = offset;
      let end = start;
      while (end < bytes.length && bytes[end] !== 0) end++;
      if (end >= bytes.length) {
        throw new ObjectFileFormatError(`unterminated string while reading ${what} starting at offset ${start} (no null byte before EOF)`);
      }
      const strBytes = bytes.subarray(start, end);
      offset = end + 1; // 널 종결자 건너뛰기
      return new TextDecoder("utf-8", { fatal: false }).decode(strBytes);
    },
    remaining(): Uint8Array {
      return bytes.subarray(offset);
    },
  };
}

function parseMod(cursor: Cursor, mode: ObjectFileMode): ParsedObjectMod {
  const field = cursor.readFourCC("mod field id");
  const varTypeRaw = cursor.readUint32("mod value type");

  let level: number | undefined;
  let column: number | undefined;
  if (mode === "extended") {
    level = cursor.readUint32("mod level/variation");
    column = cursor.readUint32("mod data pointer (column)");
  }

  let value: number | string;
  switch (varTypeRaw) {
    case VALUE_TYPE.INT:
      value = cursor.readInt32("int value");
      break;
    case VALUE_TYPE.REAL:
    case VALUE_TYPE.UNREAL:
      value = cursor.readFloat32("real/unreal value");
      break;
    case VALUE_TYPE.STRING:
      value = cursor.readCString("string value");
      break;
    default:
      throw new ObjectFileFormatError(
        `unknown value type ${varTypeRaw} at offset ${cursor.tell()} for field "${field}" (expected 0=int/1=real/2=unreal/3=string)`,
      );
  }

  cursor.readUint32("mod end marker"); // 실측: 항상 0, 의미 불명 — 소비만 하고 버림

  const mod: ParsedObjectMod = { field, varType: varTypeRaw as ValueType, value };
  if (level !== undefined) mod.level = level;
  if (column !== undefined) mod.column = column;
  return mod;
}

function parseEntry(cursor: Cursor, mode: ObjectFileMode, isCustomTable: boolean): ParsedObjectEntry {
  const oldId = cursor.readFourCC("entry oldId");
  const rawNewId = cursor.readFourCC("entry newId");
  const modCount = cursor.readUint32("entry mod count");
  const mods: ParsedObjectMod[] = [];
  for (let i = 0; i < modCount; i++) mods.push(parseMod(cursor, mode));

  // 원본수정 테이블은 항상 newId=0000(실측) — table 소속으로 null 판정한다(바이트 값이 아니라
  // "어느 테이블이었는가"로 판정 — 방어적: 설령 0이 아니어도 원본수정 테이블 소속이면 null).
  return { oldId, newId: isCustomTable ? rawNewId : null, mods };
}

function parseTable(cursor: Cursor, mode: ObjectFileMode, isCustomTable: boolean): ParsedObjectEntry[] {
  const count = cursor.readUint32("table entry count");
  const entries: ParsedObjectEntry[] = [];
  for (let i = 0; i < count; i++) entries.push(parseEntry(cursor, mode, isCustomTable));
  return entries;
}

/**
 * 오브젝트 수정 파일(w3u/w3t/w3b/w3h/w3a/w3d/w3q) 코어 파서.
 * mode="basic"이면 mod에 level/column이 없고, "extended"면 fieldId 뒤에 level·column이 추가된다.
 * kind는 호출자가 "이 파일이 무슨 종류인가"를 명시한다(바이트에서 유도되지 않음 — 파일명이 결정).
 */
export function parseObjectFile(bytes: Uint8Array, mode: ObjectFileMode, kind: ObjectMod["kind"]): ParsedObjectFile {
  const cursor = createCursor(bytes);
  const version = cursor.readUint32("file version");
  const original = parseTable(cursor, mode, false);
  const custom = parseTable(cursor, mode, true);
  const trailing = cursor.remaining();
  return { version, mode, kind, original, custom, trailing };
}

// ---- 파일 종류별 편의 래퍼 (mode+kind 고정) ----

export function parseUnitFile(bytes: Uint8Array): ParsedObjectFile {
  return parseObjectFile(bytes, "basic", "unit"); // war3map.w3u
}

export function parseItemFile(bytes: Uint8Array): ParsedObjectFile {
  return parseObjectFile(bytes, "basic", "item"); // war3map.w3t
}

export function parseDestructableFile(bytes: Uint8Array): ParsedObjectFile {
  return parseObjectFile(bytes, "basic", "destructable"); // war3map.w3b
}

export function parseBuffFile(bytes: Uint8Array): ParsedObjectFile {
  return parseObjectFile(bytes, "basic", "buff"); // war3map.w3h
}

export function parseAbilityFile(bytes: Uint8Array): ParsedObjectFile {
  return parseObjectFile(bytes, "extended", "ability"); // war3map.w3a
}

export function parseDoodadFile(bytes: Uint8Array): ParsedObjectFile {
  return parseObjectFile(bytes, "extended", "doodad"); // war3map.w3d
}

export function parseUpgradeFile(bytes: Uint8Array): ParsedObjectFile {
  return parseObjectFile(bytes, "extended", "upgrade"); // war3map.w3q
}

/**
 * ParsedObjectFile → IR `ObjectMod[]`. varType 태그는 버리고(값의 JS 타입으로 충분),
 * level/column은 존재할 때만 옮긴다(원본수정+커스텀 순서로 이어붙임).
 */
export function toObjectMods(parsed: ParsedObjectFile): ObjectMod[] {
  const convert = (entries: ParsedObjectEntry[]): ObjectMod[] =>
    entries.map((entry) => ({
      baseId: entry.oldId,
      newId: entry.newId,
      kind: parsed.kind,
      mods: entry.mods.map((mod) => {
        const out: ObjectMod["mods"][number] = { field: mod.field, value: mod.value };
        if (mod.level !== undefined) out.level = mod.level;
        if (mod.column !== undefined) out.column = mod.column;
        return out;
      }),
    }));
  return [...convert(parsed.original), ...convert(parsed.custom)];
}

/** Resolve existing ObjectMod records against caller-supplied stock data.
 * Same field/level/column merge for all object kinds; no synthetic stock values.
 * ponytail: the file parser and IR already exist; this only adds the missing merge. */
export function resolveObjectFields(
  kind: ObjectMod["kind"], typeId: FourCC,
  baseObjects: ReadonlyArray<ObjectMod>, mapObjects: ReadonlyArray<ObjectMod>,
): ObjectMod["mods"] {
  const bases = new Map(baseObjects.filter(o => o.kind === kind).map(o => [o.newId ?? o.baseId, o]));
  const patches = new Map<string, ObjectMod>();
  for (const o of mapObjects) {
    if (o.kind !== kind) continue;
    const key = o.newId ?? o.baseId, previous = patches.get(key);
    if (previous && previous.baseId !== o.baseId) throw new Error("conflicting object parent " + kind + ":" + key);
    patches.set(key, previous ? {...o, mods: [...previous.mods, ...o.mods]} : o);
  }
  const resolving = new Set<string>();
  function resolve(id: string): ObjectMod["mods"] {
    if (resolving.has(id)) throw new Error("object inheritance cycle " + kind + ":" + id);
    resolving.add(id);
    const patch = patches.get(id), base = bases.get(id);
    let inherited: ObjectMod["mods"];
    if (patch?.newId) inherited = resolve(patch.baseId);
    else {
      if (!base) throw new Error("missing stock object data " + kind + ":" + id);
      inherited = base.mods;
    }
    const merged = new Map<string, ObjectMod["mods"][number]>();
    for (const m of [...inherited, ...(patch?.mods ?? [])])
      merged.set(JSON.stringify([m.field, m.level ?? null, m.column ?? null]), {...m});
    resolving.delete(id);
    return [...merged.values()];
  }
  return resolve(typeId);
}
