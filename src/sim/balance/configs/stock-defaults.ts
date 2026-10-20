// L-3a(DISPATCH_SONNET_L3_STOCK_DEFAULTS §1·§2) — WC3 스톡 유닛(hgtw/hctw) range·attackType 기본값.
/**
 * A-G12 — 원장(docs/dissection/*.json)이 필드 부재(=이 맵이 override하지 않음, AGENTS.md 원장 규율
 * "필드 부재=스톡 상속")로 관측한 유닛에서만 발동한다. **원장이 아니다** — 맵 사실이 아니라 WC3 자체의
 * 스톡 값이므로 원장(docs/dissection/*.json)과 분리된 이 파일 1곳에만 둔다(단일 격리 지점 — 정정은
 * 여기만 고치면 됨, 절대 다른 파일에 값을 복제하지 말 것).
 *
 * Blizzard 데이터 정책(AGENTS.md §Hard Contract, 2026-07-20 개정): 스톡 수치 참조·구현은 허용, 원본
 * 데이터 파일(slk/txt/mpq) 재배포만 금지 — 아래는 선언된 상수이지 원본 파일이 아니다.
 *
 * 출처(2건 교차 일치, 2026-07-20 조회):
 *  - Battle.net Classic 공식 아카이브 building stats 표:
 *    http://classic.battle.net/war3/human/buildingstats.shtml
 *    ("Guard Tower" Range=70·Attack Type=Pierce / "Cannon Tower" Range=80·Attack Type=Siege)
 *  - Warcraft Wiki(warcraft.wiki.gg) 유닛 인포박스:
 *    https://warcraft.wiki.gg/wiki/Guard_Tower_(Warcraft_III) (Range=70, Attack type=Piercing)
 *    https://warcraft.wiki.gg/wiki/Cannon_Tower_(Warcraft_III) (Range=25-80, Attack type=Siege)
 *
 * 확신도(값별 — RETURN_L3.md §③에도 동일 표기):
 *  - attackType(hgtw="pierce", hctw="siege"): **높음** — 두 출처 모두 텍스트로 직접 명시(스케일 추론
 *    불요), 완전 일치. engine attackTypes enum(pierce/siege)에 그대로 매핑되고 추가 가정 없음.
 *  - range(hgtw=700, hctw=800): **중간** — 두 출처 모두 원문 표시값은 "70"/"80"(또는 "25-80")이다.
 *    이 맵의 다른 hgtw/hctw 파생 유닛들이 실측한 range 자릿수(600~1500대, towerLines rangeBaseU
 *    320~820대)와 스케일을 맞추려면 ×10 해석(700/800)이 필요하다 — 같은 표의 Sight 열도 "160/80"으로
 *    표시되는데 WC3 타워 실측 시야값 관행(1600/800대)과 ×10 관계로 정합적이라 동일 스케일 규칙을
 *    적용했다. 이 맵 바이트로 직접 교차검증은 불가하다(맵에 hgtw/hctw를 override 없이 그대로 쓰는
 *    유닛이 없음 — 그래서 A-G12). 다른 근거(SLK 원본 등)로 반증되면 아래 두 값만 고치면 된다.
 *
 * ③Gate 보강 2026-07-20(오케스트레이터) — **1차 출처 추가 + cooldownSec 확장**:
 *  L-3은 `h005`(최하급 루비, base hctw)를 "원장에 cd 없음 + 스톡 테이블에 cooldown 없음"으로 미등재
 *  처리해 done-gate 1건이 실패했다(정직 보고). 추측으로 메우지 않고 1차 출처를 확보했다 —
 *  Blizzard 공식 아카이브의 **건물별 상세 페이지**(위 요약표보다 상세):
 *   - http://classic.battle.net/war3/human/buildings/guardtower.shtml
 *     → Damage 23-27 · Type **Piercing** · **Range 70** · **Cooldown 0.9**
 *   - http://classic.battle.net/war3/human/buildings/cannontower.shtml
 *     → Damage 90-111 · Type **Siege** · **Range 80** · **Cooldown 2.5**
 *       (Full/½/1/10 Damage Area 5/10/12.5 — 스플래시 계수 관례 100/50/25‰[A-G11]와 정합)
 *  ⇒ attackType·range는 기존 값과 **독립 출처로 재확인**됐고, cooldownSec 2종이 새로 확보됐다.
 *  range 확신도는 여전히 ×10 스케일 해석에 의존하므로 "중간" 유지(이 맵으로 교차검증 불가 = A-G12).
 *  cooldownSec은 초 단위가 표기 그대로라 스케일 추론이 없다 — 확신도 **높음**(틱 환산은 DT=1/20 기준
 *  소비자 책임: 0.9s=18틱, 2.5s=50틱).
 *
 * 정정 방법: 아래 STOCK_DEFAULTS 리터럴만 수정 — 소비자(configs/gemtower.ts)는 stockDefault() 조회
 * API 경유라 재계산 불필요(호출부 변경 0).
 */

export type StockUnitField = "range" | "attackType" | "cooldownSec";

interface StockUnitDefaults {
  range: number;
  attackType: string;
  cooldownSec: number;
}

const STOCK_DEFAULTS: Readonly<Record<string, StockUnitDefaults>> = {
  hgtw: { range: 700, attackType: "pierce", cooldownSec: 0.9 },
  hctw: { range: 800, attackType: "siege", cooldownSec: 2.5 },
};

export function stockDefault(baseId: string, field: "range" | "cooldownSec"): number | undefined;
export function stockDefault(baseId: string, field: "attackType"): string | undefined;
export function stockDefault(baseId: string, field: StockUnitField): number | string | undefined {
  const rec = STOCK_DEFAULTS[baseId];
  if (!rec) return undefined;
  return rec[field];
}
