"""Build-only F quality helpers. Uses existing local numpy/scipy, no runtime dependency."""
import io,json,hashlib,subprocess
import numpy as np
from scipy.ndimage import gaussian_filter
from PIL import Image

def sha(data):return hashlib.sha256(data).hexdigest()
def png_bytes(image):
 b=io.BytesIO();image.save(b,format='PNG',optimize=True,compress_level=9);return b.getvalue()
def quantize_rgba(image,step):
 a=np.array(image.convert('RGBA'));q=a.copy();rgb=q[:,:,:3].astype(np.uint16)
 if step>1:rgb=np.minimum(255,((rgb+step//2)//step)*step)
 q[:,:,:3]=rgb.astype(np.uint8);q[:,:,:3][q[:,:,3]==0]=0
 return Image.fromarray(q,'RGBA')
def ssim(a,b):
 a=a.astype(np.float64);b=b.astype(np.float64);g=lambda x:gaussian_filter(x,sigma=(1.5,1.5,0),truncate=3.5)
 u=g(a);v=g(b);xx=g(a*a)-u*u;yy=g(b*b)-v*v;xy=g(a*b)-u*v
 score=((2*u*v+6.5025)*(2*xy+58.5225))/((u*u+v*v+6.5025)*(xx+yy+58.5225))
 return float(score[5:-5,5:-5].mean())
def frame_quality(a,b):
 a=np.array(a.convert('RGBA'));b=np.array(b.convert('RGBA'));assert np.array_equal(a[:,:,3],b[:,:,3]),'alpha changed';values=[]
 for bg in [0,255]:
  x=a[:,:,:3]*(a[:,:,3:4]/255)+bg*(1-a[:,:,3:4]/255);y=b[:,:,:3]*(b[:,:,3:4]/255)+bg*(1-b[:,:,3:4]/255);values.append(ssim(x,y))
 return min(values)
def calibrate_metric():
 a=np.arange(32*32*3,dtype=np.float64).reshape(32,32,3)%256
 identity=ssim(a,a);constant=ssim(np.full((32,32,3),100),np.full((32,32,3),101));expected=(20200+6.5025)/(20201+6.5025)
 assert abs(identity-1)<1e-12 and abs(constant-expected)<1e-10
 return {'identity':identity,'constantOffset':constant,'constantOffsetExpected':expected,'algorithm':'Gaussian SSIM window11 sigma1.5; population covariance; min RGB mean on black/white composites'}
class NodeBrotli:
 MODE_FONT=2;MODE_TEXT=1
 @staticmethod
 def decompress(data):return subprocess.check_output(['node','-e','process.stdout.write(require("node:zlib").brotliDecompressSync(require("node:fs").readFileSync(0)))'],input=data)
 @staticmethod
 def compress(data,mode=0,quality=11):
  code='const z=require("node:zlib"),b=require("node:fs").readFileSync(0);process.stdout.write(z.brotliCompressSync(b,{params:{[z.constants.BROTLI_PARAM_MODE]:'+str(mode)+',[z.constants.BROTLI_PARAM_QUALITY]:'+str(quality)+'}}))'
  return subprocess.check_output(['node','-e',code],input=data)
def enable_woff2():
 from fontTools.ttLib import woff2
 woff2.brotli=NodeBrotli;woff2.haveBrotli=True
