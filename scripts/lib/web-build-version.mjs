import {createHash} from 'node:crypto';
const ENTRY='<script type="module" src="./main.js"></script>';
const BLOCK=/<!-- WEB_BUILD_START -->[\s\S]*?<!-- WEB_BUILD_END -->/g;
export function webBuildId(inputs){const hash=createHash('sha256');for(const [name,body] of [...inputs].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)){hash.update(name);hash.update('\0');hash.update(body);hash.update('\0');}return hash.digest('hex').slice(0,16);}
// Conservative replay compatibility: known web styles and approved visual directories only.
// Images elsewhere may encode pathing/game data; unknown paths remain replay-relevant.
const BITMAP_EXTENSION=/\.(?:png|webp|jpe?g|gif|bmp|avif|ico|apng|tiff?)$/i;
function presentationInput(name){
 if(name==='web/assets/ui/materials.json')return true;
 if(!name.startsWith('web/')||name.split('/').some(part=>part==='.'||part==='..'))return false;
 return /\.css$/i.test(name)||(/^web\/assets\/(?:sprites|ui)\//.test(name)&&BITMAP_EXTENSION.test(name));
}
export function replayBuildId(inputs){return webBuildId([...inputs].filter(([name])=>!presentationInput(name)));}
export function versionedImports(paths,id){return Object.fromEntries([...new Set(paths)].sort().map(path=>[path,path+'?build='+encodeURIComponent(id)]));}
export function normaliseBuildHtml(html){return html.replace(BLOCK,ENTRY).replace(/href="\.\/([A-Za-z0-9_-]+\.css)\?build=[^"]*"/g,'href="./$1"');}
/** Hints only: an unrecognized/dynamic edge still loads through the full import map.
 * This never removes a shipped module or rewrites its source/evaluation. */
export function preloadModuleGraph(modules,entry='./main.js'){
 const seen=new Set();function visit(key){if(seen.has(key)||!modules.has(key))return;seen.add(key);const source=modules.get(key);
  for(const match of source.matchAll(/(?:from\s*|import\s*(?:\(\s*)?)(["'])(\.[^"']+?)\1/g)){
   const parts=key.slice(0,key.lastIndexOf('/')+1).concat(match[2]).split('/'),out=[];let outside=false;
   for(const part of parts){if(!part||part==='.')continue;if(part==='..'){if(!out.length){outside=true;break;}out.pop();}else out.push(part);}
   if(!outside)visit('./'+out.join('/'));
  }
 }visit(entry);return [...seen].sort();
}
export function injectWebBuild(html,id,imports,replayBuild=id,{preloadFetch=[],preloadImages=[],preloadModules=null}={}){const normal=normaliseBuildHtml(html);if(!normal.includes(ENTRY))throw Error('web module entry missing');const fetchHints=preloadFetch.map(url=>`<link rel="preload" as="fetch" href="${url}" crossorigin="anonymous">`).join("\n");const imageHints=[...new Set(preloadImages)].map(url=>`<link rel="preload" as="image" href="${url}">`).join("\n");const selected=preloadModules?new Set(preloadModules):null;const urls=[imports["./main.js"],...Object.entries(imports).filter(([key])=>key!=="./main.js"&&(!selected||selected.has(key))).map(([,url])=>url)].filter(Boolean);const hints=urls.map(url=>`<link rel="modulepreload" href="${url}">`).join("\n");const json=JSON.stringify({imports},null,2).replace(/</g,'\\u003c');return normal.replace(ENTRY,`<!-- WEB_BUILD_START -->\n<script>window.UZMAP_REPLAY_BUILD=${JSON.stringify(replayBuild).replace(/</g,'\\u003c')};</script>\n<script type="importmap" id="web-build-map">${json}</script>\n${fetchHints}\n${imageHints}\n${hints}\n<script type="module" src="./main.js?build=${encodeURIComponent(id)}"></script>\n<!-- WEB_BUILD_END -->`).replace(/href="\.\/([A-Za-z0-9_-]+\.css)"/g,(_m,name)=>`href="./${name}?build=${encodeURIComponent(id)}"`);}
