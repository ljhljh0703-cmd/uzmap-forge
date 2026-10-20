/**
 * R-202b B1 — CurveSpec 곡선 라이브러리(재사용 코어).
 * 계약: docs/BALANCE_ENGINE_DESIGN.md §3.2.
 * 핵심 규율: "곡선은 점화식이 정의다"(§3.1-3) — expRec는 closed-form(Math.pow)이 아니라
 * 정수 점화식 t[x]=floor(t[x-1]×growthPm/1000) 그 자체. 같은 spec = 어느 플랫폼에서든 비트 동일 테이블.
 * 구현 노트(설계 대비 정밀화): expRec는 다구간(segments) 일반형 — 1구간이 설계 문서의 기본형이고,
 * 실맵 리핏(B0)에서 지상 크립이 로그-오목(3구간)으로 실측되어 구간 리스트로 일반화했다.
 */
import { PM, MAX_STAT, clampInt, isSafeInt } from "./fixed.ts";

export interface ClampSpec {
  min?: number;
  max?: number;
}

/** 수치 곡선 — 평가 결과는 전부 정수. x는 도메인 좌표(웨이브·티어 등, 0..maxX). */
export type NumCurveSpec =
  | { kind: "const"; v: number; clamp?: ClampSpec }
  | { kind: "linear"; basePm: number; slopePm: number; clamp?: ClampSpec }
  | { kind: "expRec"; segments: ReadonlyArray<{ fromX: number; base: number; growthPm: number }>; clamp?: ClampSpec }
  | { kind: "steps"; edges: ReadonlyArray<number>; values: ReadonlyArray<number>; clamp?: ClampSpec };

/** 열거형 곡선(방어타입 로테이션 등). values[(x−fromX) mod len], x<fromX는 첫 값. */
export interface EnumCurveSpec {
  kind: "cycle";
  values: ReadonlyArray<string>;
  fromX?: number;
}

/** spec → 정수 테이블(index 0..maxX). 순수 — 같은 입력 = 같은 배열. */
export function buildNumTable(spec: NumCurveSpec, maxX: number): number[] {
  const out = new Array<number>(maxX + 1);
  switch (spec.kind) {
    case "const": {
      out.fill(spec.v);
      break;
    }
    case "linear": {
      for (let x = 0; x <= maxX; x++) out[x] = Math.floor((spec.basePm + spec.slopePm * x) / PM);
      break;
    }
    case "expRec": {
      const segs = spec.segments;
      const first = segs[0];
      if (!first) {
        out.fill(0);
        break;
      }
      let segIdx = 0;
      let cur = first.base;
      for (let x = 0; x <= maxX; x++) {
        const next = segs[segIdx + 1];
        if (next && x >= next.fromX) {
          segIdx++;
          cur = next.base;
        } else {
          const seg = segs[segIdx]!;
          if (x < seg.fromX) {
            cur = seg.base; // fromX 미만 = base 평탄
          } else if (x > seg.fromX) {
            cur = Math.floor((cur * seg.growthPm) / PM); // 점화식(스펙)
          } else {
            cur = seg.base; // x === fromX 재앵커
          }
        }
        out[x] = cur;
      }
      break;
    }
    case "steps": {
      for (let x = 0; x <= maxX; x++) {
        let i = 0;
        while (i < spec.edges.length && x >= (spec.edges[i] ?? Infinity)) i++;
        out[x] = spec.values[i] ?? 0;
      }
      break;
    }
  }
  if (spec.clamp) {
    for (let x = 0; x <= maxX; x++) out[x] = clampInt(out[x]!, spec.clamp.min, spec.clamp.max);
  }
  return out;
}

/** 열거형 곡선 평가(테이블 불필요 — mod 연산 순수). */
export function evalEnum(spec: EnumCurveSpec, x: number): string {
  const fromX = spec.fromX ?? 1;
  const len = spec.values.length;
  if (len === 0) return "";
  if (x < fromX) return spec.values[0]!;
  return spec.values[(x - fromX) % len]!;
}

/** 수치 곡선 로드 검증 — 위반 = 로드 거부(런타임 NaN/오버플로 원천 차단, §3.2). */
export function validateNumCurve(spec: NumCurveSpec, maxX: number, label: string): string[] {
  const errs: string[] = [];
  const intCheck = (v: unknown, name: string): void => {
    if (!isSafeInt(v)) errs.push(`${label}: ${name}이 안전 정수가 아님(${String(v)})`);
  };
  switch (spec.kind) {
    case "const":
      intCheck(spec.v, "v");
      break;
    case "linear":
      intCheck(spec.basePm, "basePm");
      intCheck(spec.slopePm, "slopePm");
      break;
    case "expRec": {
      if (spec.segments.length === 0) errs.push(`${label}: expRec segments 비어있음`);
      let prevFrom = -Infinity;
      for (const seg of spec.segments) {
        intCheck(seg.fromX, "fromX");
        intCheck(seg.base, "base");
        intCheck(seg.growthPm, "growthPm");
        if (isSafeInt(seg.growthPm) && (seg.growthPm < 1 || seg.growthPm > 4000)) errs.push(`${label}: growthPm ${seg.growthPm} ∉ [1,4000]`);
        if (isSafeInt(seg.base) && seg.base < 0) errs.push(`${label}: base ${seg.base} < 0`);
        if (isSafeInt(seg.fromX) && seg.fromX <= prevFrom) errs.push(`${label}: segments fromX 비오름차순`);
        prevFrom = isSafeInt(seg.fromX) ? seg.fromX : prevFrom;
      }
      break;
    }
    case "steps": {
      if (spec.values.length !== spec.edges.length + 1) errs.push(`${label}: steps values 길이 ≠ edges+1`);
      for (let i = 1; i < spec.edges.length; i++) {
        if ((spec.edges[i - 1] ?? 0) >= (spec.edges[i] ?? 0)) errs.push(`${label}: steps edges 비오름차순`);
      }
      for (const v of [...spec.edges, ...spec.values]) intCheck(v, "steps 항목");
      break;
    }
  }
  if (spec.clamp && spec.clamp.min !== undefined && spec.clamp.max !== undefined && spec.clamp.min > spec.clamp.max) {
    errs.push(`${label}: clamp min > max`);
  }
  if (errs.length === 0) {
    // 실제 테이블을 생성해 상한 검사(과대값은 spec 단계에서 거부 — 조용한 오버플로 금지)
    const table = buildNumTable(spec, maxX);
    for (let x = 0; x <= maxX; x++) {
      const v = table[x]!;
      if (!Number.isSafeInteger(v) || Math.abs(v) > MAX_STAT) {
        errs.push(`${label}: x=${x} 값 ${v}가 상한(2^40) 초과`);
        break;
      }
    }
  }
  return errs;
}

/** 열거형 곡선 검증. */
export function validateEnumCurve(spec: EnumCurveSpec, label: string): string[] {
  const errs: string[] = [];
  if (spec.values.length === 0) errs.push(`${label}: cycle values 비어있음`);
  for (const v of spec.values) {
    if (typeof v !== "string" || v.length === 0) errs.push(`${label}: cycle 값이 빈 문자열/비문자열`);
  }
  if (spec.fromX !== undefined && !isSafeInt(spec.fromX)) errs.push(`${label}: fromX 비정수`);
  return errs;
}
