/** Device-local intake for the tested GemTower release. No files are sent to a server. */
export const MAP_SHA256='0c76d191d2ecbbffe0774b300c121d23945abac4169071e9af73ce5eff374339';
export const PROFILE_SHA256='bf51d723c9dd5ed4970026ff9e342ba9dcbdfd657ce610838df469f3da1ceeaf';
export function isLocalGameHost(hostname){return ['localhost','127.0.0.1','::1','[::1]'].includes(hostname);}
async function digest(bytes){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function readPlayFiles(mapFile,profileFile,parseProfile){
 if(!mapFile||!profileFile)throw Error('맵과 능력 자료 두 파일을 선택하세요.');
 if(!Number.isSafeInteger(mapFile.size)||mapFile.size<1||mapFile.size>64*1024*1024||!Number.isSafeInteger(profileFile.size)||profileFile.size<1||profileFile.size>16*1024*1024)throw Error('파일 크기를 확인하세요. 맵 64MB, 능력 자료 16MB까지 열 수 있습니다.');
 const [mapBytes,profileBytes]=await Promise.all([mapFile.arrayBuffer(),profileFile.arrayBuffer()]);
 const [mapHash,profileHash]=await Promise.all([digest(mapBytes),digest(profileBytes)]);
 if(mapHash!==MAP_SHA256)throw Error('테스트한 맵과 다릅니다. GemTower_Max_7C.w3x 원본을 선택하세요.');
 if(profileHash!==PROFILE_SHA256)throw Error('테스트한 능력 자료와 다릅니다. 기존 1.28.5.7680 unit-abilities.json을 선택하세요.');
 const stockProfile=parseProfile(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(profileBytes)));
 return {mapBytes,stockProfile};
}
/** Reuse source-resolved unit identities; do not ship the private name census. */
export function sourceGemPresentation(presentation,mods,getDef){
 const names={...presentation.names},gemIds=new Set(presentation.gemIds);
 for(const mod of mods??[]){if(mod.kind!=='unit')continue;const id=mod.newId??mod.baseId;let d;try{d=getDef(id);}catch{continue;}
  if(mod.baseId==='hgtw'||d?.meta?.role?.kind==='tower'||d?.meta?.role?.archetype==='specialGem'){gemIds.add(id);if(d.name&&!names[id])names[id]=d.name;}
 }
 return {names,gemIds};
}
