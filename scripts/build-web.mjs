// 무의존 웹 빌드 — 순수 src/를 브라우저 ES 모듈(web/dist)로 변환한다.
// Node 내장 module.stripTypeScriptTypes로 TS 타입만 공백 치환(위치 보존 → 소스맵 불요) +
// 상대 import의 .ts→.js 재작성. 번들러 0(npm 403 제약) — src/가 순수(node API 0)라 가능.
import { stripTypeScriptTypes } from "node:module";
import { readdirSync, statSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";
import {webBuildId,replayBuildId,versionedImports,injectWebBuild,normaliseBuildHtml,preloadModuleGraph} from "./lib/web-build-version.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src");
const OUT = join(ROOT, "web", "dist");

function walk(dir, accept=(path)=>path.endsWith(".ts")) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p,accept));
    else if (accept(p)) out.push(p);
  }
  return out;
}

// 상대 import/export의 '....ts' → '....js' (정적·동적·re-export 모두). 절대/URL은 무시.
function rewriteExtensions(code) {
  return code.replace(/(from\s*|import\s*\(\s*)(["'])(\.[^"']+?)\.ts\2/g, (_m, kw, q, spec) => `${kw}${q}${spec}.js${q}`);
}

const files = walk(SRC);

// 재발방지 게이트(2026-07-14): src는 브라우저에서 돌아야 하므로 node: 내장 import가 하나라도 있으면 빌드 실패.
// (과거 node:zlib가 "순수" 부분 grep을 빠져나가 브라우저에서 CORS로 엔진이 안 붙은 사고 — 이제 원천 차단.)
const impure = [];
for (const abs of files) {
  const code = readFileSync(abs, "utf8");
  for (const m of code.matchAll(/(?:from|import\s*\()\s*["'](node:[a-z_/]+)["']/g)) {
    impure.push(`${relative(SRC, abs)}: ${m[1]}`);
  }
}
if (impure.length) {
  console.error("[build-web] ❌ 브라우저 비호환 node: import 발견 — 순수 대체 필요:\n  " + impure.join("\n  "));
  process.exit(1);
}

rmSync(OUT, { recursive: true, force: true });
let count = 0;
for (const abs of files) {
  const rel = relative(SRC, abs).replace(/\.ts$/, ".js");
  const dest = join(OUT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  const ts = readFileSync(abs, "utf8");
  const js = rewriteExtensions(stripTypeScriptTypes(ts, { mode: "strip" }));
  writeFileSync(dest, js);
  count++;
}
console.log(`[build-web] ${count} 모듈 → web/dist (타입 스트립 + .ts→.js 재작성 + node: 순수성 게이트 통과). 번들러 0.`);

// Pin the whole module graph, not just main.js: a warm client must never mix VM API versions.
const WEB=join(ROOT,"web"),htmlPath=join(WEB,"index.html");
const html=readFileSync(htmlPath,"utf8");
const viewFiles=readdirSync(WEB).filter(name=>/\.(js|css)$/.test(name)).map(name=>join(WEB,name));
const artFiles=walk(join(WEB,"assets"),()=>true);
const inputs=[...files,...viewFiles,...artFiles].map(path=>[relative(ROOT,path).replace(/\\/g,"/"),readFileSync(path)]);
inputs.push(["web/index.html",normaliseBuildHtml(html)],["node",process.versions.node],
  ["scripts/build-web.mjs",readFileSync(fileURLToPath(import.meta.url))],
  ["scripts/lib/web-build-version.mjs",readFileSync(join(ROOT,"scripts/lib/web-build-version.mjs"))]);
const buildId=webBuildId(inputs),replayBuild=replayBuildId(inputs);
const modules=[...files.map(path=>"./dist/"+relative(SRC,path).replace(/\\/g,"/").replace(/\.ts$/,".js")),...viewFiles.filter(path=>path.endsWith(".js")).map(path=>"./"+relative(WEB,path))];
const imports=versionedImports(modules,buildId);
const preloadModules=preloadModuleGraph(new Map(modules.map(key=>[key,readFileSync(join(WEB,key),"utf8")])));
// Reuse exactly the manifest's required images and the always-visible HUD/tray.
// Matching URLs let Image() consume these requests instead of waiting for boot.
const spriteManifest=artFiles.includes(join(WEB,"assets/manifest.json"))?JSON.parse(readFileSync(join(WEB,"assets/manifest.json"),"utf8")):{entries:{}};
const preloadImages=[...new Set((spriteManifest.preload??[]).map(key=>spriteManifest.entries[spriteManifest.aliases?.[key]??key]?.src).filter(Boolean))].map(src=>"./assets/"+src+"?build="+buildId);
for(const name of ['slot-grey','frame-topbar','frame-tray','btn-green-disabled','icon-gold-coin','icon-life-heart','icon-wave-flag'])if(artFiles.includes(join(WEB,"assets/ui/approved/"+name+".png")))preloadImages.push("./assets/ui/approved/"+name+".png");
writeFileSync(htmlPath,injectWebBuild(html,buildId,imports,replayBuild,{preloadFetch:["./assets/manifest.json?build="+buildId,"./assets/ui/materials.json"],preloadImages,preloadModules}));
writeFileSync(join(WEB,"build-info.json"),JSON.stringify({buildId,replayBuild,modules:modules.length},null,2)+"\n");
console.log(`[build-web] content build ${buildId}, replay build ${replayBuild}, ${modules.length} versioned modules`);

console.log(`[build-web] ${preloadModules.length} reachable module preloads; ${modules.length} import-map modules retained`);
