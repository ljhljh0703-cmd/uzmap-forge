#!/usr/bin/env python3
"""Generate/verify approved F image derivatives from preserved H originals.
No new art. Default is read-only verification; use --generate explicitly.
"""
from pathlib import Path
import argparse,json,sys,shutil,copy,io,PIL,subprocess
from PIL import Image
ROOT=Path(__file__).resolve().parent.parent;sys.path.insert(0,str(ROOT/'scripts/lib'))
from f_asset_quality import sha,png_bytes,quantize_rgba,frame_quality,calibrate_metric
ORIGINAL=ROOT/'artifacts/f-load/original';META=ROOT/'docs/assets/gemtower-f/image-variants.json'

def preserve():
 marker=ORIGINAL/'ORIGINALS.json'
 if not marker.exists():
  # A fresh worktree must recover H bytes, never relabel already-derived F data.
  revision='9ff5970bd2bf403917de4c6550063b446f5cee93'
  try:paths=subprocess.check_output(['git','ls-tree','-r','--name-only',revision,'web/assets'],cwd=ROOT).decode().splitlines()
  except subprocess.CalledProcessError as error:raise RuntimeError('H archive and source revision unavailable; restore the recorded originals before generation') from error
  paths=[path for path in paths if path.endswith(('.png','.woff2')) or path in ['web/assets/manifest.json','web/assets/ui/materials.json','web/assets/fonts/OFL.txt']]
  record={}
  for rel in paths:
   data=subprocess.check_output(['git','show',revision+':'+rel],cwd=ROOT);target=ORIGINAL/rel;target.parent.mkdir(parents=True,exist_ok=True)
   if target.exists():assert target.read_bytes()==data,'original archive conflict: '+rel
   else:target.write_bytes(data)
   record[rel]=sha(data)
  marker.write_text(json.dumps({'sourceRevision':revision,'files':record},indent=2)+'\n')
 original=json.loads(marker.read_text());record=original['files']
 for rel,expected in record.items():
  assert sha((ORIGINAL/rel).read_bytes())==expected,'preserved original archive changed: '+rel
  if not rel.startswith('web/assets/ui/approved/') and rel!='web/assets/manifest.json':assert sha((ROOT/rel).read_bytes())==expected,'original public master changed: '+rel
 return record

def run(generate=False):
 if generate:originals=preserve()
 else:originals=json.loads((ORIGINAL/'ORIGINALS.json').read_text())['files']
 baseline=json.loads((ORIGINAL/'web/assets/manifest.json').read_text());entries=copy.deepcopy(baseline['entries']);source_cache={};records=[];outputs=[]
 ground=['ground:grass:'+str(i) for i in range(4)]+['ground:path:horizontal','field:checkpoint','field:entrance','field:exit']
 groups=[('ground',ground,1024,2),('ground-extra',[k for k,s in entries.items() if s['src']=='sprites/gemtower-b1.png' and k not in ground],1024,2),('bases',[k for k,s in entries.items() if s['src']=='sprites/gemtower-b2.png'],2048,2),('creeps-ground',['creep:mine:'+n for n in ['goblin','beetle','rat']],1024,4),('creeps-late',['creep:mine:'+n for n in ['bat','wisp']],1024,4),('creeps-boss',['creep:mine:ogre'],1024,4),('effects',[k for k,s in entries.items() if s['src']=='sprites/gemtower-b4.png'],1024,2)]
 for name,keys,width,step in groups:
  x=y=2;rowh=0;parts=[]
  for key in keys:
   spec=baseline['entries'][key];f=spec['frame'];src='web/assets/'+spec['src'];image=source_cache.setdefault(src,Image.open(ORIGINAL/src).convert('RGBA'));count=spec.get('frames',1);box=[f['x'],f['y'],f['x']+f['w']*count,f['y']+f['h']];crop=image.crop(box)
   if x+crop.width+2>width:x=2;y+=rowh+4;rowh=0
   parts.append((key,spec,src,crop,x,y));x+=crop.width+4;rowh=max(rowh,crop.height)
  atlas=Image.new('RGBA',(width,y+rowh+2));
  for key,spec,src,crop,x,y in parts:atlas.paste(crop,(x,y))
  final=quantize_rgba(atlas,step);data=png_bytes(final);path=ROOT/f'web/assets/sprites/gemtower-f-{name}.png'
  if generate:path.write_bytes(data)
  else:assert path.read_bytes()==data,'F derivative differs: '+str(path)
  scores=[]
  for key,spec,src,crop,x,y in parts:
   f=spec['frame'];new=copy.deepcopy(spec);new['src']=f'sprites/gemtower-f-{name}.png';new['frame']={**f,'x':x,'y':y};entries[key]=new
   for index in range(spec.get('frames',1)):
    source_box={'x':f['x']+index*f['w'],'y':f['y'],'w':f['w'],'h':f['h']};target_box={'x':x+index*f['w'],'y':y,'w':f['w'],'h':f['h']};a=crop.crop((index*f['w'],0,(index+1)*f['w'],f['h']));b=final.crop((target_box['x'],target_box['y'],target_box['x']+f['w'],target_box['y']+f['h']));physical=frame_quality(a,b);bbox=a.getchannel('A').getbbox();visible=frame_quality(a.crop(bbox),b.crop(bbox)) if bbox and min(bbox[2]-bbox[0],bbox[3]-bbox[1])>10 else physical;score=min(physical,visible);assert score>=.99,(key,score);scores.append(score)
    records.append({'key':key,'index':index,'source':src,'sourceSha256':originals[src],'sourceFrame':source_box,'target':str(path.relative_to(ROOT)),'targetFrame':target_box,'channelStep':step,'alphaExact':True,'ssim':score,'physicalFrameSsim':physical,'visibleBboxSsim':visible,'sourceRgbaSha256':sha(a.tobytes()),'targetRgbaSha256':sha(b.tobytes())})
  outputs.append({'path':str(path.relative_to(ROOT)),'sha256':sha(data),'bytes':len(data),'dimensions':list(final.size),'keys':keys,'minFrameSsim':min(scores),'operation':{'cropRepack':True,'channelStep':step,'transparentRgbZeroed':True,'alphaChanged':False}});print(name,len(data),min(scores),flush=True)
 ui=[]
 for source in sorted((ORIGINAL/'web/assets/ui/approved').glob('*.png')):
  before=source.read_bytes();im=Image.open(source).convert('RGBA');data=png_bytes(im);target=ROOT/'web/assets/ui/approved'/source.name
  if generate:target.write_bytes(data)
  else:assert target.read_bytes()==data,'UI encode differs: '+source.name
  after=Image.open(io.BytesIO(data)).convert('RGBA');assert im.tobytes()==after.tobytes();ui.append({'path':str(target.relative_to(ROOT)),'sourceSha256':sha(before),'sha256':sha(data),'bytes':len(data),'dimensions':list(im.size),'originalRgbaSha256':sha(im.tobytes()),'rgbaSha256':sha(after.tobytes()),'pixelIdentical':True})
 preload=ground+[k for k in entries if k.startswith('pedestal:') or k in ['field:stone','field:slate','field:placement']]+['gem:*','special:*','terrain:stone']
 result=copy.deepcopy(baseline);result['entries']=entries;result['preload']=preload;result['optimization']={'contract':'F2 author-approved derivatives; UI lossless decoded-pixel equality','sourceRevision':'9ff5970bd2bf403917de4c6550063b446f5cee93','proof':'docs/assets/gemtower-f/image-variants.json'}
 for output in outputs:result['credits'].append({'file':output['path'].removeprefix('web/assets/'),'sha256':output['sha256'],'source':'F2 derivative of recorded B source atlas; see image-variants ledger','license':'existing supplied generated art; source provenance retained'})
 proof={'state':'provisional','gate':'gate_pending','sourceRevision':'9ff5970bd2bf403917de4c6550063b446f5cee93','metricCalibration':calibrate_metric(),'generatorSha256':{name:sha((ROOT/name).read_bytes()) for name in ['scripts/optimize-f-assets.py','scripts/lib/f_asset_quality.py']},'toolVersions':{'python':sys.version.split()[0],'pillow':PIL.__version__},'outputs':outputs,'frames':records,'approvedUI':ui,'manifestSha256':sha((json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode()),'preload':preload,'originalArchive':'artifacts/f-load/original/','originals':originals,'beforeEntries':baseline['entries'],'beforeAliases':baseline.get('aliases',{}),'newArtGenerated':0}
 manifest_bytes=(json.dumps(result,ensure_ascii=False,indent=2)+'\n').encode()
 if generate:META.parent.mkdir(parents=True,exist_ok=True);META.write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');(ROOT/'web/assets/manifest.json').write_bytes(manifest_bytes)
 else:assert json.loads(META.read_text())==proof,'image proof stale';assert (ROOT/'web/assets/manifest.json').read_bytes()==manifest_bytes,'manifest differs'
 print('F image verification PASS',len(records),'frames',len(ui),'UI PNGs',flush=True)
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--generate',action='store_true');args=p.parse_args();run(args.generate)
