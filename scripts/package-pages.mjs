/** Publish only the viewer, compiled own runtime and existing replacement art.
 * Default packaging excludes originals. Explicit hosted mode includes only the two pinned test inputs; census and saves remain excluded.
 */
import {existsSync,lstatSync,readdirSync,readFileSync,mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve,join,relative,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {MAP_SHA256,PROFILE_SHA256} from '../web/source-input.js';
const TOP_FILES=new Set(['ui-art.js','share-card.js','dom-state.js','result-records.js','result-view.js','audio-catalog.js','audio-settings.js','audio-recording.js','sound-events.js','first-run-guide.js','wave-notices.js','combination-hints.js','source-help.js','first-run-ui.js','button-reasons.js','battlefield-readability.js','game-menu.js','precision-camera.js','field-effects.js','field-ground.js','field-units.js','first-minute.js','index.html','main.js','play.css','build-info.json','gem-actions.js','gem-targeting.js','local-stock.js','play-ui.js','run-storage.js','run-checkpoint.js','ui-skin.js','visual-assets.js','source-input.js','browser-runtime.js','field-art.js','casino-feedback.js','recipe-book.js','recipe-view.js','overlap-picker.js','action-feedback.js']);
const AUDIO_NAMES=new Set(['place','combine','upgrade','waveStart','lifeLoss','kill','boss','air','keep','rare','research','waveGold','tap','defeat','clear','bgm-prepare','bgm-combat']);
function assetAllowed(p){const audio=p.match(/^audio\/cc0\/([A-Za-z-]+)\.(ogg|m4a)$/);return Boolean(audio&&AUDIO_NAMES.has(audio[1]))||p==='audio/LICENSES.md'||p==='audio/cc0/manifest.json'||p==='manifest.json'||p==='ui/materials.json'||p==='fonts/OFL.txt'||/^fonts\/[A-Za-z0-9_-]+\.woff2$/.test(p)||/^(?:sprites|ui\/approved)\/[A-Za-z0-9_-]+\.png$/.test(p);}
export function packagePages(root,output=join(root,'.site'),{withSourceInputs=false}={}){
 root=resolve(root);output=resolve(output);
 if(output!==join(root,'.site'))throw Error('invalid Pages output: use the dedicated .site directory');
 if(existsSync(output))throw Error('Pages output already exists; preserve or remove it explicitly before rebuilding');
 const web=join(root,'web'),files=[];
 function add(abs,rel){if(lstatSync(abs).isSymbolicLink())throw Error('symbolic links are not publishable: '+rel);files.push([abs,'web/'+rel]);}
 function tree(abs,prefix,allow){for(const name of readdirSync(abs)){const p=join(abs,name),rel=prefix?prefix+'/'+name:name,stat=lstatSync(p);if(stat.isSymbolicLink())throw Error('symbolic links are not publishable: '+rel);if(stat.isDirectory())tree(p,rel,allow);else{if(/^assets\/audio\/(?:place|combine|upgrade)\.wav$/.test(rel))continue;if(!allow(rel))throw Error('not publishable: '+rel);add(p,rel);}}}
 for(const name of readdirSync(web)){if(TOP_FILES.has(name))add(join(web,name),name);}
 for(const required of ['index.html','main.js','play.css','build-info.json'])if(!existsSync(join(web,required)))throw Error('missing runtime file: '+required);
 tree(join(web,'dist'),'dist',p=>/^dist\/[A-Za-z0-9_./-]+\.js$/.test(p));
 tree(join(web,'assets'),'assets',p=>assetAllowed(p.slice('assets/'.length)));
 const audioBytes=files.filter(([,target])=>target.startsWith('web/assets/audio/')).reduce((sum,[file])=>sum+lstatSync(file).size,0);
 if(audioBytes>1500000)throw Error('audio budget exceeds 1500000 bytes: '+audioBytes);
 if(withSourceInputs){
  for(const [rel,target,hash] of [['fixtures/maps/GemTower_Max_7C.w3x','web/source-inputs/map.w3x',MAP_SHA256],['fixtures/stock/unit-abilities.json','web/source-inputs/unit-abilities.json',PROFILE_SHA256]]){
   const p=join(root,rel);if(!existsSync(p)||lstatSync(p).isSymbolicLink())throw Error('source input missing or symbolic: '+rel);
   if(createHash('sha256').update(readFileSync(p)).digest('hex')!==hash)throw Error('source hash differs: '+rel);
   files.push([p,target]);
  }
 }
 mkdirSync(output);
 for(const [from,to] of files){const dest=join(output,to);mkdirSync(dirname(dest),{recursive:true});copyFileSync(from,dest);}
 writeFileSync(join(output,'.nojekyll'),'');
 writeFileSync(join(output,'index.html'),'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="0;url=./web/?seed=6"><title>보석타워 테스트</title><a href="./web/?seed=6">테스트 화면 열기</a></html>\n');
 if(withSourceInputs){
  const original=readFileSync(join(root,'fixtures/stock/unit-abilities.json')),packed=deflateSync(original,{level:9});
  const profileTransport={file:'unit-abilities.json.zlib',encoding:'zlib',decodedBytes:original.length,bytes:packed.length,sha256:createHash('sha256').update(packed).digest('hex')};
  // Only explicit hosted packages preload their exact pinned inputs. The same
  // fetch destination/anonymous credentials let the browser reuse the preload.
  const page=join(output,'web/index.html'),hints=['./source-inputs/manifest.json',`./source-inputs/map.w3x?sha=${MAP_SHA256}`,`./source-inputs/${profileTransport.file}?sha=${profileTransport.sha256}`].map(url=>`<link rel="preload" as="fetch" href="${url}" crossorigin="anonymous">`).join('\n');
  writeFileSync(page,readFileSync(page,'utf8').replace('</head>',hints+'\n</head>'));
  writeFileSync(join(output,'web/source-inputs',profileTransport.file),packed);
  writeFileSync(join(output,'web/source-inputs/manifest.json'),JSON.stringify({format:'uzmap-hosted-inputs-v1',map:'map.w3x',profile:'unit-abilities.json',profileTransport})+'\n');
 }
 const result={files:files.length,build:JSON.parse(readFileSync(join(web,'build-info.json'),'utf8')).buildId,inputs:withSourceInputs?'hosted original input files':'device-local; not bundled'};
 writeFileSync(join(output,'deployment.json'),JSON.stringify(result,null,2)+'\n');
 return result;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
 console.log(JSON.stringify(packagePages(root,undefined,{withSourceInputs:process.argv.includes('--with-source-inputs')}),null,2));
}
