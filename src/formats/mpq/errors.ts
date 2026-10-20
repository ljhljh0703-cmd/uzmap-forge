/**
 * MPQ 리더 전용 타입드 에러. src/formats/는 부수효과 0 계약이므로
 * 실패는 항상 예외로 표면화하고, 호출자가 종류별로 구분해 처리할 수 있게 한다.
 */

/** 아카이브 구조 자체를 신뢰할 수 없을 때(헤더 미발견, 테이블 범위 초과 등). */
export class MpqFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MpqFormatError";
  }
}

/** 해시테이블 조회 실패 — 이름 오탈자거나, 파일이 아카이브에 없음. */
export class MpqFileNotFoundError extends Error {
  constructor(name: string) {
    super(`file not found in archive: ${name}`);
    this.name = "MpqFileNotFoundError";
  }
}

/**
 * 인식은 했지만 구현하지 않은 압축(주로 PKWARE DCL implode) — 스코프 밖(deny-first #5).
 * 크래킹이 아니라 "지원 불가" 신호이며, 상위 레이어가 이 파일만 건너뛸 수 있게 한다.
 */
export class UnsupportedCompressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedCompressionError";
  }
}
