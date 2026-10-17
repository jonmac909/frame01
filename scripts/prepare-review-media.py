from pathlib import Path
import json,subprocess,sys,argparse,hashlib
root=Path(__file__).resolve().parents[1];p=root/'data/projects/nano-banana-cartoon-workflow-28043a87'
parser=argparse.ArgumentParser();parser.add_argument('--plan',default='Source-runtime remake plan.json');parser.add_argument('--export',default='source-runtime');parser.add_argument('--name',default='Frame 01 - Nano Banana cartoon workflow - 12m31s.mp4');parser.add_argument('--audio-only',action='store_true');args=parser.parse_args()
assert all(Path(value).name==value for value in [args.plan,args.export,args.name])
site=root.parent/'frame01-review/dist';media=site/'media';media.mkdir(exist_ok=True)
plan=json.loads((p/args.plan).read_text())
master=p/'exports'/args.export/args.name
if args.export=='complete-narration':assert master.exists(),'Verify and assemble the complete narration master before refreshing review media.'
ffmpeg=r'C:\ffmpeg\bin\ffmpeg.exe';ffprobe=r'C:\ffmpeg\bin\ffprobe.exe'
manifest={'fps':30,'frames':plan['frames'],'duration':plan['frames']/30,'sourceDuration':plan['sections'][-1]['sourceTo'],'previewResolution':'1280x720','masterResolution':'1920x1080','plan':args.plan,'masterSha256':hashlib.sha256(master.read_bytes()).hexdigest()if master.exists()else None,'sections':[]}
for i,s in enumerate(plan['sections']):
    row={**s,'index':i,'source':f'media/full-source-{i:02}.mp4','ours':f'media/full-remake-{i:02}.mp4'};manifest['sections'].append(row)
    for kind in ['source','ours']:
        file=p/'reference/source.mp4'if kind=='source'else master if master.exists()else p/f'exports/{args.export}/section-{i:02}.mp4'
        if not file.exists():continue
        dest=site/row[kind];proof=Path(str(dest)+'.proof.json');start=s['sourceFrom']if kind=='source'else s['from']/30 if file==master else 0
        duration=s['sourceTo']-s['sourceFrom']if kind=='source'else(s['to']-s['from'])/30
        signature={'input':str(file),'inputMtime':file.stat().st_mtime_ns,'duration':duration,'start':start}
        if dest.exists()and proof.exists()and json.loads(proof.read_text()).get('input')==signature:continue
        if args.audio_only and kind=='ours'and dest.exists():
            assert args.export=='source-runtime'and(p/'exports/source-runtime/Audio peak correction.json').exists(),'Audio-only refresh is restricted to the original verified peak correction.'
            fixed=Path(str(dest)+'.audio-fixed.mp4')
            subprocess.run([ffmpeg,'-v','error','-y','-i',str(dest),'-ss',str(start),'-i',str(file),'-t',str(duration),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','96k','-movflags','+faststart',str(fixed)],check=True)
            fixed.replace(dest);proof.write_text(json.dumps({'input':signature,'bytes':dest.stat().st_size,'audioOnlyRefresh':True},indent=2));print(json.dumps({'section':i,'audioOnlyRefresh':True}),flush=True);continue
        expected_frames=round(duration*30)
        # A fractional seek may leave the terminal frame at an EOF rounding boundary.
        # Extend only the final pose, then enforce the exact authored frame count.
        cmd=[ffmpeg,'-hide_banner','-loglevel','error','-y','-ss',str(start),'-i',str(file),'-t',str(duration),'-vf','scale=1280:720:flags=lanczos,fps=30,tpad=stop_mode=clone:stop_duration=0.1','-frames:v',str(expected_frames),'-c:v','libx264','-threads','2','-preset','fast','-crf','25','-maxrate','900k','-bufsize','1800k','-c:a','aac','-b:a','96k']
        cmd+=['-movflags','+faststart',str(dest)];subprocess.run(cmd,check=True)
        assert dest.stat().st_size<25*1024*1024,'Review asset exceeds hosting size limit'
        info=json.loads(subprocess.check_output([ffprobe,'-v','error','-show_streams','-of','json',str(dest)]));video=next(s for s in info['streams']if s['codec_type']=='video')
        assert int(video['nb_frames'])==expected_frames and video['width']==1280 and video['height']==720 and video['r_frame_rate']=='30/1'
        assert any(s['codec_type']=='audio'for s in info['streams'])
        proof.write_text(json.dumps({'input':signature,'bytes':dest.stat().st_size,'frames':expected_frames,'video':video,'preview':'720p review copy of verified master','masterSha256':manifest['masterSha256']if kind=='ours'else None},indent=2));print(json.dumps({'section':i,'kind':kind,'bytes':dest.stat().st_size,'frames':expected_frames}),flush=True)
(site/'full-manifest.json').write_text(json.dumps(manifest,indent=2))
