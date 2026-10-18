"""Join frame-authored sections without AAC padding accumulating at their seams."""
from pathlib import Path
import json,subprocess,wave,hashlib,math,sys,argparse
import numpy as np
root=Path(__file__).resolve().parents[1]
p=root/'data/projects/nano-banana-cartoon-workflow-28043a87'
parser=argparse.ArgumentParser();parser.add_argument('--plan',default='Source-runtime remake plan.json');parser.add_argument('--export',default='source-runtime');parser.add_argument('--name',default='Frame 01 - Nano Banana cartoon workflow - 12m31s.mp4');parser.add_argument('--verify',action='store_true');args=parser.parse_args()
assert Path(args.plan).name==args.plan and Path(args.export).name==args.export and Path(args.name).name==args.name
out=p/'exports'/args.export;work=root/'work'/('final-assembly-'+args.export);work.mkdir(parents=True,exist_ok=True)
plan=json.loads((p/args.plan).read_text());rate=48000;expected_duration=plan['frames']/30
ffmpeg=r'C:\ffmpeg\bin\ffmpeg.exe';ffprobe=r'C:\ffmpeg\bin\ffprobe.exe'
def decode(file):
    return np.frombuffer(subprocess.check_output([ffmpeg,'-v','error','-i',str(file),'-vn','-ar',str(rate),'-ac','2','-f','f32le','-']),dtype=np.float32).reshape(-1,2)
audio=np.zeros((plan['frames']*1600,2),dtype=np.float32);seams=[];inputs=[]
for i,s in enumerate(plan['sections']):
    file=out/f'section-{i:02}.mp4';proof=json.loads(Path(str(file)+'.proof.json').read_text())
    count=s['to']-s['from'];assert proof['frames']==count
    info=json.loads(subprocess.check_output([ffprobe,'-v','error','-select_streams','v:0','-show_entries','stream=nb_frames,width,height,r_frame_rate','-of','json',str(file)]))['streams'][0]
    assert int(info['nb_frames'])==count and info['width']==1920 and info['height']==1080 and info['r_frame_rate']=='30/1'
    pcm=decode(file);needed=count*1600;assert len(pcm)>=needed-1600
    a=s['from']*1600;n=min(needed,len(pcm));audio[a:a+n]=pcm[:n]
    seams.append({'section':i,'sample':a,'decodedSamples':len(pcm),'usedSamples':needed,'paddingSamples':max(0,needed-len(pcm))})
    inputs.append({'file':str(file),'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'frames':count})
# Quiet pack accents at visually reviewed actions. The peak is aligned, rather
# than the file start: Impact1 peak .7738s, Whoosh1 peak .5678s at48kHz.
impact='assets/pack-b0ad7b4651ba12f9-Impact_-_1.mp3'
whoosh=plan['whoosh'];accents=[]
for source,seconds,key,gain,peak,reason in ([] if plan.get('reviewEffects') else [
    (190.2333,6.5,impact,.035,.7738,'badger reaction insert'),
    (304.5,14.0,whoosh,.035,.5678,'watercolor journey to reunion cut'),
    (377.5,4.0,impact,.04,.7738,'magic surprise insert'),
    (437.5,4.0,whoosh,.035,.5678,'paper underwater reveal insert'),
    (623.5,4.0,whoosh,.04,.5678,'anime leap insert'),
    (689.5,4.0,impact,.035,.7738,'clay mishap insert'),
    (689.5,14.0,whoosh,.035,.5678,'clay rescue insert'),
    (689.5,22.0,impact,.03,.7738,'clay payoff insert')]):
    shot=next(s for s in plan['shots']if abs(s['sourceStart']/30-source)<.05)
    target=shot['from']/30+seconds;start=round((target-peak)*rate);pcm=decode(p/key)*gain
    end=min(len(audio),start+len(pcm));audio[start:end]+=pcm[:end-start]
    accents.append({'peakSeconds':round(target,4),'file':key,'gain':gain,'filePeakSeconds':peak,'reason':reason})
for seam in seams[1:]:
    a=seam['sample'];seam['sampleJump']=float(np.max(np.abs(audio[a]-audio[a-1])))
wav=work/'master-mix.wav'
with wave.open(str(wav),'wb')as w:
    w.setnchannels(2);w.setsampwidth(2);w.setframerate(rate);w.writeframes((np.clip(audio,-1,1)*32767).astype('<i2').tobytes())
normalized=[]
for i,r in enumerate(inputs):
    file=work/f'normalized-video-{i:02}.mp4'
    subprocess.run([ffmpeg,'-v','error','-y','-i',r['file'],'-map','0:v:0','-c:v','copy','-an','-video_track_timescale','90000',str(file)],check=True)
    normalized.append({**r,'file':str(file)})
concat=work/'video.ffconcat'
concat.write_text('ffconcat version 1.0\n'+''.join(f"file '{r['file'].replace(chr(92),'/')}'\nduration {r['frames']/30:.9f}\n"for r in normalized))
chapters=work/'chapters.ffmetadata';chapters.write_text(';FFMETADATA1\n'+''.join(f"[CHAPTER]\nTIMEBASE=1/30\nSTART={s['from']}\nEND={s['to']}\ntitle={s['name']}\n"for s in plan['sections']))
target=out/args.name
if not args.verify:
    joined=subprocess.run([ffmpeg,'-v','warning','-y','-safe','0','-f','concat','-i',str(concat),'-i',str(wav),'-i',str(chapters),'-map','0:v:0','-map','1:a:0','-map_metadata','2','-map_chapters','2','-c:v','copy','-video_track_timescale','90000','-af',f'loudnorm=I=-16:TP=-3:LRA=11,aresample={rate},asetpts=N/SR/TB','-ar',str(rate),'-c:a','aac','-b:a','192k','-t',str(plan['frames']/30),'-movflags','+faststart',str(target)],capture_output=True,text=True,check=True)
    assert 'Non-monotonic'not in joined.stderr,joined.stderr[-2000:]
info=json.loads(subprocess.check_output([ffprobe,'-v','error','-show_streams','-show_format','-show_chapters','-of','json',str(target)]))
if float(info['format']['duration'])>expected_duration+.03:
    trimmed=work/'trimmed-audio-tail.mp4'
    subprocess.run([ffmpeg,'-v','error','-y','-i',str(target),'-map','0:v:0','-map','0:a:0','-map_metadata','0','-map_chapters','0','-c','copy','-t',str(expected_duration),'-video_track_timescale','90000','-movflags','+faststart',str(trimmed)],check=True)
    archive=out/'history'/'audio-tail';archive.mkdir(parents=True,exist_ok=True);target.rename(archive/'master-before-tail.mp4');trimmed.rename(target)
    info=json.loads(subprocess.check_output([ffprobe,'-v','error','-show_streams','-show_format','-show_chapters','-of','json',str(target)]))
video=next(s for s in info['streams']if s['codec_type']=='video');assert int(video['nb_frames'])==plan['frames'];assert abs(float(info['format']['duration'])-expected_duration)<.03
audio_frames=json.loads(subprocess.check_output([ffprobe,'-v','error','-select_streams','a:0','-show_frames','-show_entries','frame=pts,nb_samples','-of','json',str(target)]))['frames']
assert audio_frames[0]['pts']==0 and all(b['pts']==a['pts']+a['nb_samples']for a,b in zip(audio_frames,audio_frames[1:])),'Decoded audio timestamps are not sample-contiguous'
decoded_samples=sum(f['nb_samples']for f in audio_frames);assert plan['frames']*1600<=decoded_samples<plan['frames']*1600+1024,'Decoded audio tail does not cover the authored film'
audio_timeline={'decodedSamples':decoded_samples,'requiredSamples':plan['frames']*1600,'sampleRate':rate,'timestampGaps':0,'aacTailPaddingSamples':decoded_samples-plan['frames']*1600}
levels=subprocess.run([ffmpeg,'-hide_banner','-i',str(target),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True).stderr
level=json.JSONDecoder().raw_decode(levels[levels.rfind('{'):])[0];assert float(level['input_tp'])<=-1.0
report={'master':str(target),'frames':plan['frames'],'duration':float(info['format']['duration']),'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'sectionInputs':inputs,'audioSeams':seams,'audioTimeline':audio_timeline,'accents':accents,'loudness':level,'chapterCount':len(info['chapters']),'speechRate':1,'removedCues':40,'humanApproval':False,'limitations':['Source scenes are recreated with original characters and local Qwen/LTX outputs.','Motion-only examples have no generated ambience; pack accents and existing dialogue are used.','Technical signal and speech-content checks do not establish human listening or exact lip synchronization.']}
if args.plan=='Complete narration repair plan.json':report.update(removedCues=0,speechRate='See Complete narration pace map.json; pitch and formants preserved.',allOriginalNarrationRetained=True,paceMap='Complete narration pace map.json',preparedAroll=plan['aroll'],limitations=['Source scenes are recreated with original characters and local Qwen/LTX outputs.','Six nonverbal demonstration beds derive from existing generated audio; dialogue and pack accents are preserved.','Technical signal and speech-content checks do not establish human listening or exact lip synchronization.'])
if plan.get('reviewEffects'):report.update(removedCues=0,speechRate=1,allOriginalNarrationRetained=True,paceMap='Review revision pace map.json',preparedAroll=plan['aroll'],limitations=plan['limitations'],exampleAudio='Native matching file, trim and duration; no loop beds or added example accents.')
Path(str(target)+'.proof.json').write_text(json.dumps(report,indent=2));print(json.dumps({'master':str(target),'frames':plan['frames'],'duration':report['duration'],'truePeak':level['input_tp'],'sha256':report['sha256']}),flush=True)
