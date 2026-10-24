/** Read-only prose derived from the tested map's w3q/w3u descriptions.
 * No command, affordability, research level, RNG, clock, DOM or save access.
 * Full original values and input hashes: artifacts/g-first-run/g3-source.json.
 * Tooltip percentages are not an executable probability table. */
const entries=[
 ['R000','보석 질 향상','다음 보석이 더 좋은 등급으로 나올 확률을 높여요.',
  ['war3map.w3q:R000.gnam','war3map.w3q:R000.gub1'],'long-tooltip',''],
 ['R001','찬스 확률 향상','최상급 보석 찬스와 슬레이트 찬스의 성공 확률을 높여요.',
  ['war3map.w3q:R001.gnam','war3map.w3q:R001.gub1'],'long-tooltip',''],
 ['R002','천국의 보석 어빌리티','추가 킬수를 얻을 확률을 높여요.',
  ['war3map.w3q:R002.gnam','war3map.w3q:R002.gub1'],'long-tooltip',''],
 ['h042','슬레이트 찬스','다음 라운드의 다섯 보석에서 슬레이트가 나올 기회를 사요.',
  ['war3map.w3u:h042.unam','war3map.w3u:h042.utub'],'long-tooltip',''],
 ['h03Q','최상급 보석 찬스','다음 라운드의 다섯 보석에서 최상급 보석이 나올 기회를 사요.',
  ['war3map.w3u:h03Q.unam','war3map.w3u:h03Q.utub'],'long-tooltip',''],
 ['h01W','광산 수명 구입','광산의 남은 생명을 늘려요. 최대 100까지 살 수 있어요.',
  ['war3map.w3u:h01W.unam','war3map.w3u:h01W.utub'],'long-tooltip',''],
 ['h044','코인 투입','코인을 넣어 빠칭코를 한 번 돌려요.',
  ['war3map.w3u:h044.unam','war3map.w3u:h044.utub'],'long-tooltip',''],
 // The long description is empty. The original short tooltip says “나간다”.
 ['h046','나가기','이용 중인 기계에서 나와요.',
  ['war3map.w3u:h046.unam','war3map.w3u:h046.utip'],'short-tooltip-only',''],
 // A greeting gives no effect or rule to explain; do not invent one.
 ['h049','시작','',
  ['war3map.w3u:h049.unam','war3map.w3u:h049.utub','war3map.w3u:h049.utip'],
  'meaning-unresolved','원작 설명이 “행운을 빕니다!”뿐이라 효과를 확인할 수 없어요.'],
];

export const SOURCE_BUTTON_HELP_METADATA=Object.freeze(Object.fromEntries(entries.map(
 ([id,originalName,help,sourceFields,sourceStatus,emptyReason])=>[id,Object.freeze({
  originalName,help,sourceFields:Object.freeze([...sourceFields]),sourceStatus,emptyReason,
 })],
)));

/** Unknown IDs and an unexplained original description deliberately stay blank. */
export function sourceButtonHelp(id){
 return typeof id==='string'&&Object.hasOwn(SOURCE_BUTTON_HELP_METADATA,id)
  ?SOURCE_BUTTON_HELP_METADATA[id].help:'';
}
