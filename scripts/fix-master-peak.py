from pathlib import Path
import json,subprocess,hashlib,time
root=Path(__file__).resolve().parents[1];out=root/'data/projects/nano-banana-cartoon-workflow-28043a87/exports/source-runtime';file=out/'Frame 01 - Nano Banana cartoon workflow - 12m31s.mp4';ffmpeg=r'C:\ffmpeg\bin\ffmpeg.exe'
def video_hash(target):return subprocess.check_output([ffmpeg,'-v','error','-i',str(target),'-map','0:v:0','-c:v','copy','-f','hash','-hash','sha256','-'],text=True).strip()
before=video_hash(file);fixed=file.with_suffix('.peak-fixed.mp4')
subprocess.run([ffmpeg,'-v','error','-y','-i',str(file),'-map','0:v:0','-map','0:a:0','-map_metadata','0','-map_chapters','0','-c:v','copy','-af','loudnorm=I=-16:TP=-3:LRA=11','-ar','48000','-c:a','aac','-b:a','192k','-t','751','-video_track_timescale','90000','-movflags','+faststart',str(fixed)],check=True)
assert before==video_hash(fixed),'Audio repair changed encoded video'
r=subprocess.run([ffmpeg,'-hide_banner','-i',str(fixed),'-vn','-af','loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json','-f','null','-'],capture_output=True,text=True,check=True)
level=json.JSONDecoder().raw_decode(r.stderr[r.stderr.rfind('{'):])[0];assert float(level['input_tp'])<=-1.0
archive=out/'history'/f'audio-peak-{int(time.time())}';archive.mkdir();file.rename(archive/file.name);fixed.rename(file)
(out/'Audio peak correction.json').write_text(json.dumps({'beforeTruePeak':-.75,'after':level,'encodedVideoHashBeforeAndAfter':before,'audioOnly':True},indent=2));print(json.dumps({'truePeak':level['input_tp'],'loudness':level['input_i'],'encodedVideoUnchanged':True}),flush=True)
