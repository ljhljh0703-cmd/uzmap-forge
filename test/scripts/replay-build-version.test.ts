import {it} from 'node:test';
import assert from 'node:assert/strict';
import {copyFileSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as build from '../../scripts/lib/web-build-version.mjs';
type Input=readonly [string,string|Buffer];
function replayId(inputs:Input[]){assert.equal(typeof (build as any).replayBuildId,'function');return (build as any).replayBuildId(inputs);}
const html='<html><head><link rel="stylesheet" href="./play.css"></head><body><script type="module" src="./main.js"></script></body></html>';
const bitmapNames=['png','webp','jpg','jpeg','gif','bmp','avif','ico','apng','tif','tiff'];
it('replay IDs retain deterministic sorting and string/byte inputs',()=>{
 const inputs:Input[]=[['src/runtime/session.ts',Buffer.from('runtime')],['node','22.22.3']];
 assert.match(replayId(inputs),/^[a-f0-9]{16}$/);assert.equal(replayId(inputs),replayId([...inputs].reverse()));
 assert.equal(replayId(inputs),replayId([['node',Buffer.from('22.22.3')],['src/runtime/session.ts','runtime']]));
});
it('web CSS and approved visual-directory bitmap-only changes still invalidate the complete content pin but retain replay compatibility',()=>{
 for(const name of ['web/play.css','web/nested/skin.CSS',...['sprites','ui'].flatMap(dir=>bitmapNames.map(ext=>'web/assets/'+dir+'/picture.'+ext)),'web/assets/ui/approved/UPPER.PNG']){
  const before:Input[]=[['web/main.js','runtime'],[name,'before']],after:Input[]=[['web/main.js','runtime'],[name,'after']];
  assert.notEqual(build.webBuildId(before),build.webBuildId(after),name);assert.equal(replayId(before),replayId(after),name);
 }
});
it('game-data and unknown bitmap paths plus CSS outside web remain replay-relevant',()=>{
 for(const name of ['src/pathing.png','web/assets/game/pathing.png','web/assets/picture.png','web/assets/ui-archive/picture.png','web/assets/sprites/../game/pathing.png','src/style.css','scripts/style.css','web2/play.css','./web/play.css','web/../src/style.css']){
  assert.notEqual(replayId([[name,'before']]),replayId([[name,'after']]),name);
 }
});
it('only the exact approved UI material manifest is excluded while new gameplay or unknown JSON stays included',()=>{
 for(const name of ['web/assets/ui/materials.json','web/assets/game-rules.json','web/assets/manifest.json','web/assets/ui/nested/materials.json','other/materials.json','./web/assets/ui/materials.json']){
  const before:Input[]=[['web/main.js','runtime'],[name,'before']],after:Input[]=[['web/main.js','runtime'],[name,'after']];
  const equal=replayId(before)===replayId(after);assert.equal(equal,name==='web/assets/ui/materials.json',name);
 }
});
it('code, normalized HTML, Node, build scripts, vector images, fonts and unknown inputs change the replay ID',()=>{
 for(const name of ['src/sim/sim.ts','web/main.js','web/index.html','node','scripts/build-web.mjs','scripts/lib/web-build-version.mjs','web/assets/picture.svg','web/assets/font.woff2','unknown-input']){
  assert.notEqual(replayId([[name,'before']]),replayId([[name,'after']]),name);
 }
});
it('a distinct replay global is generated inside the removable build block with backward-compatible three-argument injection',()=>{
 const content='0123456789abcdef',replay='fedcba9876543210',imports=build.versionedImports(['./main.js','./dist/vm.js'],content);
 const built=(build.injectWebBuild as any)(html,content,imports,replay);
 assert.ok(built.includes('window.UZMAP_REPLAY_BUILD='+JSON.stringify(replay)),built);
 assert.ok(build.injectWebBuild(html,content,imports).includes('window.UZMAP_REPLAY_BUILD='+JSON.stringify(content)));
 assert.equal(build.normaliseBuildHtml(built),build.normaliseBuildHtml(html));
 assert.equal((build.injectWebBuild as any)(built,content,imports,replay),built);
 assert.equal((built.match(/window\.UZMAP_REPLAY_BUILD=/g)??[]).length,1);
 assert.ok(built.includes('./main.js?build='+content));assert.ok(built.includes('./dist/vm.js?build='+content));assert.ok(built.includes('./play.css?build='+content));
});
it('normalized repeated builds are stable while actual HTML changes remain replay-relevant',()=>{
 const id=replayId([['web/index.html',build.normaliseBuildHtml(html)],['web/main.js','runtime']]);
 const pinned=(build.injectWebBuild as any)(html,'0123456789abcdef',{},id);
 assert.equal(replayId([['web/index.html',build.normaliseBuildHtml(pinned)],['web/main.js','runtime']]),id);
 assert.notEqual(replayId([['web/index.html',build.normaliseBuildHtml(pinned).replace('<body>','<body data-input="changed">')],['web/main.js','runtime']]),id);
});
it('the real builder publishes both IDs and pins the whole graph in an isolated tiny tree without touching the shared build',t=>{
 const repo=fileURLToPath(new URL('../../',import.meta.url)),artifacts=join(repo,'artifacts/save-safety-compat');mkdirSync(artifacts,{recursive:true});
 const root=mkdtempSync(join(artifacts,'builder-fixture-'));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const put=(path:string,body:string|Buffer)=>{const dest=join(root,path);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,body);};
 for(const path of ['scripts/build-web.mjs','scripts/lib/web-build-version.mjs']){mkdirSync(dirname(join(root,path)),{recursive:true});copyFileSync(join(repo,path),join(root,path));}
 put('src/api.ts','export const value:number=3;\n');put('web/main.js',"import {value} from './dist/api.js';\n");put('web/play.css','body{color:red}\n');put('web/index.html',html);
 put('web/assets/sprites/icon.png',Buffer.from([1,2,3]));put('web/assets/ui/materials.json','{"frame":"icon.png"}');put('web/assets/game-rules.json','{"wave":1}');put('web/assets/game/pathing.png',Buffer.from([7,8,9]));
 const run=()=>{execFileSync(process.execPath,['--no-warnings',join(root,'scripts/build-web.mjs')],{cwd:root,encoding:'utf8'});return {info:JSON.parse(readFileSync(join(root,'web/build-info.json'),'utf8')),html:readFileSync(join(root,'web/index.html'),'utf8')};};
 const first=run();assert.match(first.info.buildId,/^[a-f0-9]{16}$/);assert.match(first.info.replayBuild,/^[a-f0-9]{16}$/);assert.equal(first.info.modules,2);
 assert.ok(first.html.includes('window.UZMAP_REPLAY_BUILD='+JSON.stringify(first.info.replayBuild)));
 const imports=JSON.parse(first.html.match(/<script type="importmap" id="web-build-map">([\s\S]*?)<\/script>/)![1]).imports;
 assert.deepEqual(imports,{'./dist/api.js':'./dist/api.js?build='+first.info.buildId,'./main.js':'./main.js?build='+first.info.buildId});
 assert.deepEqual(run(),first,'generated block and CSS pins must not affect the next input hash');
 put('web/play.css','body{color:blue}\n');put('web/assets/sprites/icon.png',Buffer.from([4,5,6]));put('web/assets/ui/materials.json','{"frame":"new.png"}');
 const cosmetic=run();assert.notEqual(cosmetic.info.buildId,first.info.buildId);assert.equal(cosmetic.info.replayBuild,first.info.replayBuild);
 put('web/assets/game-rules.json','{"wave":2}');const game=run();assert.notEqual(game.info.replayBuild,cosmetic.info.replayBuild);
 put('web/assets/game/pathing.png',Buffer.from([9,8,7]));const pathing=run();assert.notEqual(pathing.info.replayBuild,game.info.replayBuild,'a bitmap outside the approved visual directories may be gameplay data');
 assert.equal(build.normaliseBuildHtml(first.html),html);assert.equal(build.normaliseBuildHtml(game.html),html);
});
