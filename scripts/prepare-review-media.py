from pathlib import Path
import json,subprocess,sys
root=Path(__file__).resolve().parents[1];p=root/'data/projects/nano-banana-cartoon-workflow-28043a87'
site=root.parent/'frame01-review/dist';media=site/'media';media.mkdir(exist_ok=True)
plan=json.loads((p/'Source-runtime remake plan.json').read_text())
master=p/'exports/source-runtime/Frame 01 - Nano Banana cartoon workflow - 12m31s.mp4'
ffmpeg=r'C:\ffmpeg\bin\ffmpeg.exe'
manifest={'fps':30,'frames':plan['frames'],'duration':plan['frames']/30,'previewResolution':'1280x720','masterResolution':'1920x1080','sections':[]}
for i,s in enumerate(plan['sections']):
    row={**s,'index':i,'source':f'media/full-source-{i:02}.mp4','ours':f'media/full-remake-{i:02}.mp4'};manifest['sections'].append(row)
    for kind in ['source','ours']:
        file=p/'reference/source.mp4'if kind=='source'else master if master.exists()else p/f'exports/source-runtime/section-{i:02}.mp4'
        if not file.exists():continue
        dest=site/row[kind];proof=Path(str(dest)+'.proof.json');start=s['sourceFrom']if kind=='source'else s['from']/30 if file==master else 0
        duration=s['sourceTo']-s['sourceFrom']if kind=='source'else(s['to']-s['from'])/30
        signature={'input':str(file),'inputMtime':file.stat().st_mtime_ns,'duration':duration,'start':start}
        if dest.exists()and proof.exists()and json.loads(proof.read_text()).get('input')==signature:continue
        if '--audio-only'in sys.argv and kind=='ours'and dest.exists():
            assert (p/'exports/source-runtime/Audio peak correction.json').exists()
            fixed=Path(str(dest)+'.audio-fixed.mp4')
            subprocess.run([ffmpeg,'-v','error','-y','-i',str(dest),'-ss',str(start),'-i',str(file),'-t',str(duration),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','96k','-movflags','+faststart',str(fixed)],check=True)
            fixed.replace(dest);proof.write_text(json.dumps({'input':signature,'bytes':dest.stat().st_size,'audioOnlyRefresh':True},indent=2));print(json.dumps({'section':i,'audioOnlyRefresh':True}),flush=True);continue
        cmd=[ffmpeg,'-hide_banner','-loglevel','error','-y','-ss',str(start),'-i',str(file),'-t',str(duration),'-vf','scale=1280:720:flags=lanczos,fps=30','-c:v','libx264','-threads','2','-preset','fast','-crf','25','-maxrate','900k','-bufsize','1800k','-c:a','aac','-b:a','96k']
        cmd+=['-movflags','+faststart',str(dest)];subprocess.run(cmd,check=True)
        assert dest.stat().st_size<25*1024*1024,'Review asset exceeds hosting size limit'
        proof.write_text(json.dumps({'input':signature,'bytes':dest.stat().st_size,'preview':'720p review copy, native speech rate'},indent=2));print(json.dumps({'section':i,'kind':kind,'bytes':dest.stat().st_size}),flush=True)
(site/'full-manifest.json').write_text(json.dumps(manifest,indent=2))
