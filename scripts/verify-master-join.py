from pathlib import Path
import json,subprocess,concurrent.futures,argparse,hashlib
root=Path(__file__).resolve().parents[1];p=root/'data/projects/nano-banana-cartoon-workflow-28043a87'
parser=argparse.ArgumentParser();parser.add_argument('--plan',default='Source-runtime remake plan.json');parser.add_argument('--export',default='source-runtime');parser.add_argument('--name',default='Frame 01 - Nano Banana cartoon workflow - 12m31s.mp4');args=parser.parse_args()
assert all(Path(value).name==value for value in [args.plan,args.export,args.name])
plan=json.loads((p/args.plan).read_text());out=p/'exports'/args.export
master=out/args.name;ffmpeg=r'C:\ffmpeg\bin\ffmpeg.exe';ffprobe=r'C:\ffmpeg\bin\ffprobe.exe'
def hashes(file):
    data=subprocess.check_output([ffmpeg,'-v','error','-threads','2','-i',str(file),'-map','0:v:0','-an','-f','framemd5','-'],text=True)
    return [line.rsplit(',',1)[1].strip()for line in data.splitlines()if line and not line.startswith('#')]
files=[out/f'section-{i:02}.mp4'for i in range(len(plan['sections']))]
with concurrent.futures.ThreadPoolExecutor(max_workers=3)as pool:sections=list(pool.map(hashes,files))
expected=[h for section in sections for h in section];actual=hashes(master);assert len(expected)==len(actual)==plan['frames']
mismatches=[i for i,(a,b)in enumerate(zip(expected,actual))if a!=b];assert not mismatches,mismatches[:20]
frames=json.loads(subprocess.check_output([ffprobe,'-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(master)]))['frames']
error=max(abs(float(f['best_effort_timestamp_time'])-i/30)for i,f in enumerate(frames));assert error<.001
report={'masterSha256':hashlib.sha256(master.read_bytes()).hexdigest(),'plan':args.plan,'framesCompared':len(actual),'decodedFrameHashMismatches':mismatches,'maxPresentationTimestampErrorSeconds':error,'basis':'Every decoded1080p master frame equals the concatenated accepted section frames. All presentation timestamps checked against frameIndex/30.'}
(out/'Master join verification.json').write_text(json.dumps(report,indent=2));print(json.dumps(report),flush=True)
