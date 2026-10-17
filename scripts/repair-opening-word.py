"""File-only fallback when Chrome's loopback renderer is unavailable.

Reuse a quiet rendered presenter frame, reproduce the authored flash, rebuild
only section 0 audio from the existing sources, and preserve previous media.
"""
from pathlib import Path
import json,subprocess,wave,shutil,cv2
import numpy as np
from scipy.signal import correlate
from PIL import Image
root=Path(__file__).resolve().parents[1];p=root/'data/projects/nano-banana-cartoon-workflow-28043a87'
out=p/'exports/source-runtime';history=out/'history/opening-word-boundary-before'
work=root/'work/opening-word-repair';work.mkdir(parents=True,exist_ok=True)
plan=json.loads((p/'Source-runtime remake plan.json').read_text());oldplan=json.loads((history/'Source-runtime remake plan.json').read_text())
ffmpeg=r'C:\ffmpeg\bin\ffmpeg.exe';ffprobe=r'C:\ffmpeg\bin\ffprobe.exe';rate=48000;count=1670*1600
assert plan['speech'][:3]==[{'from':0,'to':125,'trim':0},{'from':125,'to':290,'trim':364},{'from':884,'to':1123,'trim':125}]
file=out/'section-00.mp4';proof=json.loads(Path(str(file)+'.proof.json').read_text())
if proof.get('openingAcousticBoundaryRepair'):raise SystemExit('Opening already repaired.')
cache={}
def decode(file):
    key=str(file)
    if key not in cache:cache[key]=np.frombuffer(subprocess.check_output([ffmpeg,'-v','error','-i',key,'-vn','-ar',str(rate),'-ac','2','-f','f32le','-']),dtype=np.float32).reshape(-1,2)
    return cache[key]
def mix(q):
    audio=np.zeros((count,2),dtype=np.float32)
    def paste(asset,a,b,trim,gain):
        start=a*1600;end=min(count,b*1600)
        if start>=count or end<=0:return
        source=decode(p/asset);lo=trim*1600+max(0,-start);hi=lo+end-max(0,start)
        piece=source[lo:hi].copy();n=min(len(piece),end-max(0,start));audio[max(0,start):max(0,start)+n]+=piece[:n]*gain
    for s in q['speech']:paste(q['aroll'],s['from'],s['to'],s['trim'],1)
    for frame in q['sfx']:paste(q['whoosh'],frame,frame+24,0,.045)
    paste('assets/opening-dialogue-first-timed.mp4',284,371,0,.08)
    paste('assets/opening-dialogue-first-timed.mp4',371,583,87,.7)
    paste('assets/local-opening-dialogue-second.mp4',583,860,0,.7)
    return audio
baseline=mix(oldplan);oldaudio=decode(history/'section-00.mp4')[:count]
checks=[]
for a in [0,1,4,7,12,18,24,30,40,50]:
    i=int(a*rate);n=rate//2
    x=baseline[i:i+n].mean(axis=1).astype(float);lo=max(0,i-2400);y=oldaudio[lo:i+n+2400].mean(axis=1).astype(float)
    if np.mean(x*x)<1e-7:continue
    values=correlate(y,x,mode='valid',method='fft')/np.sqrt(np.maximum(np.convolve(y*y,np.ones(n),mode='valid')*np.dot(x,x),1e-15));best=int(np.argmax(values));score=float(values[best])
    checks.append({'seconds':a,'correlation':score,'nativeDecoderOffsetSeconds':(lo+best-i)/rate})
assert min(c['correlation']for c in checks)>.97,checks
audio=mix(plan);assert float(np.abs(audio).max())<1
wav=work/'section.wav'
with wave.open(str(wav),'wb')as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate);w.writeframes((audio*32767).astype('<i2').tobytes())
# Frame 884 already has the source time 125/30s, correct authored crop/scale,
# and no entrance flash. Hold that quiet pose only for frames 860..883.
cap=cv2.VideoCapture(str(history/'section-00.mp4'));cap.set(cv2.CAP_PROP_POS_FRAMES,884);ok,image=cap.read();cap.release();assert ok
base=cv2.cvtColor(image,cv2.COLOR_BGR2RGB).astype(np.float32)/255
yy,xx=np.mgrid[0:1080,0:1920].astype(np.float32);dx=np.sin(np.deg2rad(100));dy=-np.cos(np.deg2rad(100));span=1920*dx+1080*dy
for frame in range(24):
    result=base
    if 0<frame<12:
        shift=-1000+2000*frame/12;localx=xx-shift
        t=((localx-960)*dx+(yy-540)*dy+span/2)/span
        opacity=.7*frame/4 if frame<=4 else .7*(12-frame)/8
        stops=[0,.35,.46,.65,1];alpha=np.interp(t,stops,[0,1,1,4/15,0])*opacity*((localx>=0)&(localx<1920))
        rgb=np.stack([np.interp(t,stops,[84/255,84/255,1,1,1]),np.interp(t,stops,[207/255,207/255,1,1,1]),np.ones_like(t)],axis=-1)
        result=1-(1-base)*(1-rgb*alpha[:,:,None])
    Image.fromarray(np.clip(result*255+.5,0,255).astype(np.uint8)).save(work/f'hold-{frame:02}.png')
hold=work/'hold.mp4'
subprocess.run([ffmpeg,'-v','error','-y','-framerate','30','-i',str(work/'hold-%02d.png'),'-frames:v','24','-c:v','libx264','-threads','4','-crf','19','-pix_fmt','yuv420p',str(hold)],check=True)
result=work/'repaired.mp4'
subprocess.run([ffmpeg,'-v','error','-y','-i',str(history/'section-00.mp4'),'-i',str(hold),'-i',str(wav),'-filter_complex','[0:v]trim=start_frame=0:end_frame=860,settb=expr=1/30,setpts=N[a];[1:v]settb=expr=1/30,setpts=N[b];[0:v]trim=start_frame=884:end_frame=1670,settb=expr=1/30,setpts=N[c];[a][b][c]concat=n=3:v=1:a=0,fps=30[v]','-map','[v]','-map','2:a:0','-c:v','libx264','-threads','4','-preset','veryfast','-crf','19','-r','30','-fps_mode','cfr','-frames:v','1670','-c:a','aac','-b:a','192k','-t',str(1670/30),'-movflags','+faststart',str(result)],check=True)
info=json.loads(subprocess.check_output([ffprobe,'-v','error','-show_streams','-show_format','-of','json',str(result)]));video=next(s for s in info['streams']if s['codec_type']=='video');assert video['nb_frames']=='1670'and video['r_frame_rate']=='30/1'
shutil.copy2(result,file)
proof.update(info=info,openingAcousticBoundaryRepair={'sourceBoundary':125/30,'priorCaptionBoundary':101/30,'holdFrames':[860,884],'reason':'Move the complete word workflow before the teaser, with a quiet provider pose held after it.','method':'File-only PCM mix and existing rendered frame; authored screen-blend flash reproduced numerically because Chrome loopback access was denied.','baselineAudioReconstructionChecks':checks,'qa':'Pending final assembled master speech and hold inspection.'})
Path(str(file)+'.proof.json').write_text(json.dumps(proof,indent=2))
print(json.dumps({'frames':1670,'minimumBaselineAudioCorrelation':min(c['correlation']for c in checks),'maxMixedSample':float(np.abs(audio).max())}),flush=True)
