"""Restore existing nonverbal generated sound, with no borrowed narration."""
from pathlib import Path
import json,subprocess,wave,hashlib
import numpy as np
root=Path(__file__).resolve().parents[1];p=root/'data/projects/nano-banana-cartoon-workflow-28043a87'
plan=json.loads((p/'Complete narration repair plan.json').read_text());qa=json.loads((p/'Existing demo audio QA.json').read_text())
clean={Path(c['asset']).name for c in qa['clips']if not c['transcription']};rows=[];sr=48000
for sound in plan['sound']:
    if not sound['asset'].startswith('assets/complete-bed-'):continue
    key=Path(sound['asset']).stem.removeprefix('complete-bed-')
    source_key='anime-bridge-motion'if key=='clay-kite-motion'else key
    file=p/f'assets/local-{source_key}.mp4';assert file.name in clean,'Never loop a clip containing recognized speech.'
    source=np.frombuffer(subprocess.check_output([r'C:\ffmpeg\bin\ffmpeg.exe','-v','error','-i',str(file),'-vn','-ar',str(sr),'-ac','2','-f','f32le','-']),dtype=np.float32).reshape(-1,2)
    n=(sound['to']-sound['from'])*1600;cross=int(.35*sr);audio=np.zeros((n,2),dtype=np.float32);position=0
    while position<n:
        part=source[:min(len(source),n-position)].copy();length=len(part)
        if position:
            k=min(cross,length);ramp=np.linspace(0,1,k,dtype=np.float32)[:,None];audio[position:position+k]*=1-ramp;part[:k]*=ramp
        audio[position:position+length]+=part
        if position+length>=n:break
        position+=length-cross
    rms=float(np.sqrt(np.mean(audio**2)));peak=float(np.abs(audio).max());gain=min(10**(-31/20)/max(rms,1e-8),10**(-9/20)/max(peak,1e-8))
    audio*=gain;fade=min(int(.25*sr),n//2);audio[:fade]*=np.linspace(0,1,fade)[:,None];audio[-fade:]*=np.linspace(1,0,fade)[:,None]
    target=p/sound['asset']
    with wave.open(str(target),'wb')as w:w.setnchannels(2);w.setsampwidth(2);w.setframerate(sr);w.writeframes((np.clip(audio,-1,1)*32767).astype('<i2').tobytes())
    rows.append({'file':sound['asset'],'frames':sound['to']-sound['from'],'source':str(file.relative_to(p)),'sourceHasAsrSpeech':False,'crossfadeSeconds':.35,'gain':gain,'rmsDbfs':20*np.log10(max(float(np.sqrt(np.mean(audio**2))),1e-9)),'peakDbfs':20*np.log10(max(float(np.abs(audio).max()),1e-9)),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'note':'Clay uses the existing nonverbal outdoor wind; its original track contained recognized words and was excluded.'if key=='clay-kite-motion'else'Existing generated sound for this scene; no source video audio used.'})
(p/'Complete demo soundbed receipts.json').write_text(json.dumps(rows,indent=2));print(json.dumps({'beds':len(rows),'originalDialogueTracksRetained':2}),flush=True)
