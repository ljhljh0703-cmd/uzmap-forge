#!/usr/bin/env python3
"""Preserve H fonts, subset actual source glyph superset, verify outlines/metrics.
Uses existing fontTools + Node Brotli; no install or browser runtime dependency.
"""
from pathlib import Path
import io,json,sys,subprocess,argparse,hashlib
ROOT=Path(__file__).resolve().parent.parent;sys.path.insert(0,str(ROOT/'scripts/lib'))
from f_asset_quality import sha,enable_woff2
import fontTools
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.pens.recordingPen import DecomposingRecordingPen
ORIGINAL=ROOT/'artifacts/f-load/original';META=ROOT/'docs/assets/gemtower-f/font-coverage.json'

def sorted_hash(values):return sha(json.dumps(sorted(values),separators=(',',':')).encode())
def source_characters():
 node=r'''import fs from 'node:fs';import {readScriptMap} from './src/runtime/session.ts';import {tokenize} from './src/jass/lexer.ts';const bytes=fs.readFileSync('fixtures/maps/GemTower_Max_7C.w3x'),{ir,strings}=readScriptMap(new Uint8Array(bytes),'F-font-glyphs');let text=[...strings.values()].join('');for(const o of ir.objectMods??[])for(const m of o.mods??[])if(typeof m.value==='string')text+=m.value;for(const token of tokenize(ir.script.source))if(token.kind==='STRING')text+=String(token.value??token.text);process.stdout.write(JSON.stringify([...new Set([...text].map(c=>c.codePointAt(0)))].sort((a,b)=>a-b)));'''
 map_path=ROOT/'fixtures/maps/GemTower_Max_7C.w3x';mapcps=set(json.loads(subprocess.check_output(['node','--experimental-strip-types','--no-warnings','--input-type=module','-e',node],cwd=ROOT)))
 ui_paths=[ROOT/'web/index.html',ROOT/'web/play.css',*sorted((ROOT/'web').glob('*.js'))]
 uicps={ord(c) for p in ui_paths for c in p.read_text()};ks={ord(bytes([lead,trail]).decode('euc_kr')) for lead in range(0xb0,0xc9) for trail in range(0xa1,0xff)};assert len(ks)==2350
 required={cp for cp in ks|mapcps|uicps|set(range(0x20,0x7f)) if cp>=0x20 and not 0x7f<=cp<0xa0}
 return required,{'mapSha256':sha(map_path.read_bytes()),'mapCodepoints':sorted(mapcps),'mapGlyphHash':sorted_hash(mapcps),'uiCodepoints':sorted(uicps),'uiGlyphHash':sorted_hash(uicps),'uiFiles':[str(p.relative_to(ROOT)) for p in ui_paths],'ksHangulCount':2350,'requiredCodepoints':sorted(required),'requiredGlyphHash':sorted_hash(required),'uiScan':'all public top-level JS plus index.html/play.css, including comments as a conservative superset'}

def outlined(font,cp):
 cmap=font.getBestCmap();name=cmap[cp];glyphs=font.getGlyphSet();pen=DecomposingRecordingPen(glyphs);glyphs[name].draw(pen)
 return {'commands':pen.value,'hmtx':font['hmtx'][name]}

def run(generate=False):
 enable_woff2();required,inputs=source_characters();records=[];regular=None
 for filename in ['Galmuri11.woff2','Galmuri11-Bold.woff2']:
  public=ROOT/'web/assets/fonts'/filename;source=ORIGINAL/'web/assets/fonts'/filename
  if generate and not source.exists():source.parent.mkdir(parents=True,exist_ok=True);source.write_bytes(public.read_bytes())
  raw=source.read_bytes();assert public.read_bytes()==raw,'original font changed';before=TTFont(io.BytesIO(raw));cmap=set(before.getBestCmap());supported=required&cmap;missing=required-cmap
  if filename=='Galmuri11.woff2':regular=cmap;assert not missing,('missing regular glyph',missing)
  else:assert missing<=regular,'no existing regular fallback for bold gaps'
  options=subset.Options();options.recalc_timestamp=False;sub=subset.Subsetter(options=options);sub.populate(unicodes=required);after=TTFont(io.BytesIO(raw));after.recalcTimestamp=False;sub.subset(after);after.flavor='woff2';buf=io.BytesIO();after.save(buf);data=buf.getvalue();decoded=TTFont(io.BytesIO(data));target=ROOT/'web/assets/fonts'/filename.replace('.woff2','-f.woff2');aggregate_before=hashlib.sha256();aggregate_after=hashlib.sha256()
  assert supported<=set(decoded.getBestCmap()),'subset cmap lost required glyph'
  for cp in sorted(supported):
   a=outlined(before,cp);b=outlined(decoded,cp);assert a==b,('outline/metrics differ',filename,cp);aggregate_before.update(json.dumps([cp,a],separators=(',',':')).encode());aggregate_after.update(json.dumps([cp,b],separators=(',',':')).encode())
  for table,fields in [('head',['unitsPerEm','macStyle']),('hhea',['ascent','descent','lineGap']),('OS/2',['sTypoAscender','sTypoDescender','sTypoLineGap','usWinAscent','usWinDescent'])]:
   for field in fields:assert getattr(before[table],field)==getattr(decoded[table],field),('font metrics differ',filename,table,field)
  if generate:target.write_bytes(data)
  else:assert target.read_bytes()==data,'font binary differs from reproducible subset'
  records.append({'source':str(public.relative_to(ROOT)),'sourceSha256':sha(raw),'path':str(target.relative_to(ROOT)),'sha256':sha(data),'bytes':len(data),'originalCmapCount':len(cmap),'subsetCmapCount':len(decoded.getBestCmap()),'supportedRequiredCount':len(supported),'missingFromOriginal':sorted(missing),'outlineMetricsOriginalSha256':aggregate_before.hexdigest(),'outlineMetricsSubsetSha256':aggregate_after.hexdigest(),'outlineMetricsEqual':True});print(filename,len(data),'glyphs',len(supported),'fallback',len(missing),flush=True)
 inputs['profileSha256']=sha((ROOT/'fixtures/stock/unit-abilities.json').read_bytes())
 result={'state':'provisional','gate':'gate_pending','inputs':inputs,'generatorSha256':{name:sha((ROOT/name).read_bytes()) for name in ['scripts/subset-f-fonts.py','scripts/lib/f_asset_quality.py']},'toolVersions':{'python':sys.version.split()[0],'fontTools':fontTools.__version__,'node':subprocess.check_output(['node','--version']).decode().strip()},'fonts':records,'boldRegularFallback':records[1]['missingFromOriginal'],'license':'web/assets/fonts/OFL.txt unchanged','newGlyphsGenerated':0,'tool':'existing Python fontTools + existing Node zlib Brotli adapter'}
 if generate:META.parent.mkdir(parents=True,exist_ok=True);META.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
 else:assert json.loads(META.read_text())==result,'font proof/source character set stale'
 print('F font verification PASS',len(required),'required printable codepoints',flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--generate',action='store_true');args=p.parse_args();run(args.generate)
