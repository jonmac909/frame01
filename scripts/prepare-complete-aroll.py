"""Prepare a locally paced copy of the one completed paid recording.

All original speech is retained. Tempo changes occur at verified long quiet
gaps and use pitch/formant preservation; audio and video share the time map.
"""
from pathlib import Path
import json,subprocess,hashlib,wave,sys,shutil
import numpy as np
root=Path(__file__).resolve().parents[1];p=root/'data/projects/nano-banana-cartoon-workflow-28043a87'
cadence=json.loads((root.parent.parent/'work/source-remake-audit/speaking-cadence.json').read_text())
anchors=json.loads((p/'Acoustic section anchors.json').read_text());assert anchors['resolved']==8
demo=json.loads((p/'Acoustic demo anchors.json').read_text());assert demo['resolved']==10
first=demo['jobs'][0]['chosen'];assert abs(first['seconds']-125/30)<.02,'Preserve the previously verified full-word opening boundary.'
for j in anchors['jobs']+demo['jobs']:
    assert j['chosen']['quietInterval']['end']-j['chosen']['quietInterval']['start']>=.199
source=p/'assets/sienna-shop-drop-1x-2388109a9b1f485794191d8042820f0d.mp4'
source_hash=hashlib.sha256(source.read_bytes()).hexdigest();assert source_hash=='018433cb1257b4ca7736d2bec62dccdf768c822d2410635f59e85ddb0060da6e'
boundaries=[0]+[j['chosen']['seconds']for j in anchors['jobs']]+[801.367]
pieces=[];cursor=0
for i,section in enumerate(cadence['sections']):
    length=round(section['nellyWordsApprox']/section['sourceWpmApprox']*60*30)
    a,b=boundaries[i:i+2];rate=(b-a)/(length/30)
    pieces.append({'index':i,'name':section['name'],'sourceFrom':a,'sourceTo':b,'from':cursor,'to':cursor+length,'frames':length,'rate':rate,'sourceWpmApprox':section['sourceWpmApprox'],'nellyWordsApprox':section['nellyWordsApprox']});cursor+=length
assert all(.9<q['rate']<1.5 for q in pieces)
mapping={'source':str(source.relative_to(p)),'sourceSha256':source_hash,'sourceDuration':801.367,'file':'assets/sienna-complete-source-paced.mp4','frames':cursor,'duration':cursor/30,'fps':30,'sampleRate':48000,'pieces':pieces,'allOriginalNarrationRetained':True,'pitch':1,'formants':'preserved','cadenceMethod':cadence['method'],'openingAcousticBoundaries':{j['side']:j['chosen']['seconds']for j in demo['jobs'][:3]},'demoAcousticBoundaries':[j['chosen']['seconds']for j in demo['jobs'][3:]]}
(p/'Complete narration pace map.json').write_text(json.dumps(mapping,indent=2))
print(json.dumps({'pieces':[(q['name'],round(q['rate'],4))for q in pieces],'pacedSeconds':cursor/30,'allWordsRetained':True}),flush=True)
if '--plan-only'in sys.argv:raise SystemExit(0)
work=root/'work/complete-aroll';work.mkdir(parents=True,exist_ok=True)
ffmpeg=r'C:\ffmpeg\bin\ffmpeg.exe';ffprobe=r'C:\ffmpeg\bin\ffprobe.exe'
for q in pieces:
    video=work/f"piece-{q['index']:02}.mp4";audio=work/f"piece-{q['index']:02}.wav";proof=work/f"piece-{q['index']:02}.json"
    if video.exists()and audio.exists()and proof.exists()and json.loads(proof.read_text())==q:continue
    rate=q['rate'];n=q['frames'];duration=q['sourceTo']-q['sourceFrom']
    filters=f'[0:v]setpts=(PTS-STARTPTS)/{rate:.12f},fps=30,tpad=stop_mode=clone:stop_duration=0.2,trim=end_frame={n},setpts=N/(30*TB)[v];[0:a]aresample=48000,rubberband=tempo={rate:.12f}:pitch=1:formant=preserved:channels=together,apad,atrim=end_sample={n*1600},asetpts=PTS-STARTPTS[a]'
    subprocess.run([ffmpeg,'-v','error','-y','-ss',str(q['sourceFrom']),'-t',str(duration),'-i',str(source),'-filter_complex',filters,'-map','[v]','-an','-c:v','libx264','-threads','6','-preset','fast','-crf','18','-pix_fmt','yuv420p','-r','30','-fps_mode','cfr','-frames:v',str(n),'-video_track_timescale','90000',str(video),'-map','[a]','-c:a','pcm_s16le','-ar','48000','-ac','2',str(audio)],check=True)
    info=json.loads(subprocess.check_output([ffprobe,'-v','error','-show_entries','stream=nb_frames,r_frame_rate','-of','json',str(video)]))['streams'][0];assert int(info['nb_frames'])==n and info['r_frame_rate']=='30/1'
    with wave.open(str(audio),'rb')as w:assert w.getnframes()==n*1600 and w.getframerate()==48000
    proof.write_text(json.dumps(q,indent=2));print(json.dumps({'pacedPieceComplete':q['index'],'frames':n,'rate':round(rate,5)}),flush=True)
joined=work/'paced.wav'
with wave.open(str(joined),'wb')as dest:
    dest.setnchannels(2);dest.setsampwidth(2);dest.setframerate(48000)
    for q in pieces:
        with wave.open(str(work/f"piece-{q['index']:02}.wav"),'rb')as w:dest.writeframes(w.readframes(w.getnframes()))
concat=work/'video.ffconcat'
video_paths=[work/('piece-{:02}.mp4'.format(q['index']))for q in pieces]
concat.write_text('ffconcat version 1.0\n'+''.join("file '{}'\nduration {:.9f}\n".format(file.as_posix(),q['frames']/30)for file,q in zip(video_paths,pieces)))
target=p/mapping['file']
subprocess.run([ffmpeg,'-v','error','-y','-safe','0','-f','concat','-i',str(concat),'-i',str(joined),'-map','0:v:0','-map','1:a:0','-c:v','copy','-video_track_timescale','90000','-c:a','aac','-b:a','192k','-t',str(cursor/30),'-movflags','+faststart',str(target)],check=True)
info=json.loads(subprocess.check_output([ffprobe,'-v','error','-show_streams','-show_format','-of','json',str(target)]));v=next(s for s in info['streams']if s['codec_type']=='video');assert int(v['nb_frames'])==cursor
mapping['sha256']=hashlib.sha256(target.read_bytes()).hexdigest();mapping['probe']=info
Path(str(target)+'.proof.json').write_text(json.dumps(mapping,indent=2));print(json.dumps({'pacedAroll':str(target),'frames':cursor,'seconds':cursor/30,'sha256':mapping['sha256']}),flush=True)
