import {createHash} from 'node:crypto';
const ENTRY='<script type="module" src="./main.js"></script>';
const BLOCK=/<!-- WEB_BUILD_START -->[\s\S]*?<!-- WEB_BUILD_END -->/g;
export function webBuildId(inputs){const hash=createHash('sha256');for(const [name,body] of [...inputs].sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0)){hash.update(name);hash.update('\0');hash.update(body);hash.update('\0');}return hash.digest('hex').slice(0,16);}
export function versionedImports(paths,id){return Object.fromEntries([...new Set(paths)].sort().map(path=>[path,path+'?build='+encodeURIComponent(id)]));}
export function normaliseBuildHtml(html){return html.replace(BLOCK,ENTRY).replace(/href="\.\/play\.css\?build=[^"]*"/g,'href="./play.css"');}
export function injectWebBuild(html,id,imports){const normal=normaliseBuildHtml(html);if(!normal.includes(ENTRY))throw Error('web module entry missing');const json=JSON.stringify({imports},null,2).replace(/</g,'\\u003c');return normal.replace(ENTRY,`<!-- WEB_BUILD_START -->\n<script type="importmap" id="web-build-map">${json}</script>\n<script type="module" src="./main.js?build=${encodeURIComponent(id)}"></script>\n<!-- WEB_BUILD_END -->`).replace('href="./play.css"',`href="./play.css?build=${encodeURIComponent(id)}"`);}
