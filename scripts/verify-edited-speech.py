"""Compare rendered speech against the original waveform at every retained range."""
from pathlib import Path
import json,subprocess
import numpy as np
from scipy.signal import correlate
root=Path(__file__).resolve().parents[1];p=root/'data/projects/nano-banana-cartoon-workflow-28043a87'
plan=json.loads((p/'Source-runtime remake plan.json').read_text());sr=16000
def decode(file):return np.frombuffer(subprocess.check_output([r'C:\ffmpeg\bin\ffmpeg.exe','-v','error','-i',str(file),'-vn','-ac','1','-ar',str(sr),'-f','f32le','-']),dtype=np.float32)
original=decode(p/plan['aroll']);results=[]
for i,s in enumerate(plan['sections']):
    file=p/f'exports/source-runtime/section-{i:02}.mp4'
    if not file.exists():continue
    audio=decode(file)
    for cut in plan['speech']:
        a=max(cut['from'],s['from']);b=min(cut['to'],s['to'])
        if b-a<12:continue
        for frame in sorted(set([a+6,(a+b)//2,max(a+6,b-18)])):
            length=min(.45,(b-frame)/30);n=int(length*sr)
            source=int((cut['trim']+frame-cut['from'])/30*sr);target=int((frame-s['from'])/30*sr)
            expected=original[source:source+n].astype(np.float64);lo=max(0,target-1600);hi=min(len(audio),target+n+1600)
            actual=audio[lo:hi].astype(np.float64)
            if len(expected)!=n or len(actual)<n or np.mean(expected**2)<1e-5:continue
            x=correlate(actual,expected,mode='valid',method='fft');power=np.convolve(actual**2,np.ones(n),mode='valid')
            match=x/np.sqrt(np.maximum(power*np.sum(expected**2),1e-15));best=int(np.argmax(match));offset=(lo+best-target)/sr
            results.append({'section':i,'frame':frame,'rawSeconds':source/sr,'offsetSeconds':round(offset,5),'correlation':round(float(match[best]),5)})
    print(json.dumps({'section':i,'checked':sum(r['section']==i for r in results)}),flush=True)
suspect=[r for r in results if abs(r['offsetSeconds'])>.04 or r['correlation']<.65]
report={'method':'Independent waveform correlation at start, middle and end of every retained speech range. AAC compression and quiet pauses can lower similarity.','samples':results,'suspect':suspect,'maxOffsetSeconds':max(abs(r['offsetSeconds'])for r in results),'checked':len(results),'limitations':['Content order and native delivery timing only; not speaker identity or exact lip sync.','Quiet fragments below signal threshold excluded.']}
(p/'Rendered speech continuity proof.json').write_text(json.dumps(report,indent=2));print(json.dumps({'checked':len(results),'suspect':len(suspect),'maxOffsetSeconds':report['maxOffsetSeconds']}),flush=True)
