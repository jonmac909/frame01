from pathlib import Path
import json,subprocess,argparse,hashlib,shutil
root=Path(__file__).resolve().parents[1];p=root/'data/projects/nano-banana-cartoon-workflow-28043a87'
parser=argparse.ArgumentParser();parser.add_argument('--only',choices=['reference-upload-v4','reference-entry-v4','video-output-active-v4','audio-control-v4','model-and-output-v4']);args=parser.parse_args()
ffmpeg=r'C:\ffmpeg\bin\ffmpeg.exe';work=root/'work/active-walkthrough';work.mkdir(parents=True,exist_ok=True)
raw='recordings/window-1792254123294-93a62f.mp4';controls='recordings/window-1792255860323-3c8137.mp4'
rows=[
 {'key':'reference-upload-v4','source':raw,'slices':[(89.2,.8),(93,3)],'crop':'696:540:144:280','observed':'Brief real upload progress followed by one visibly selected artwork within the3.8-second shot. No claim that all five were attached.'},
 {'key':'reference-entry-v4','source':raw,'slices':[(78,2),(85,2)],'crop':'696:210:144:385','observed':'Actual reference-entry click and upload counter; other-style artwork and account gallery excluded.'},
 {'key':'video-output-active-v4','source':controls,'slices':[(15,7)],'crop':'810:506:850:568','observed':'Actual selection from 720p to 1080p, with 16:9 and 10s visible.'},
 {'key':'audio-control-v4','source':controls,'slices':[(22,3)],'crop':'696:100:144:750','observed':'Actual Audio On state and selected output, with gallery excluded.'}
]
if args.only:rows=[row for row in rows if row['key']==args.only]
for row in rows:
    row['slices']=[list(pair)for pair in row['slices']]
    row['file']=f"recordings/shots/{row['key']}.mp4";row['duration']=sum(n for _,n in row['slices'])
    dest=p/row['file'];proof=Path(str(dest)+'.proof.json')
    if dest.exists()and proof.exists()and json.loads(proof.read_text()).get('recipe')==row:continue
    if dest.exists():
        history=work/'history';history.mkdir(exist_ok=True);prior=history/(row['key']+'-'+hashlib.sha256(dest.read_bytes()).hexdigest()[:12]+'.mp4')
        if not prior.exists():shutil.copy2(dest,prior)
        if proof.exists()and not Path(str(prior)+'.proof.json').exists():shutil.copy2(proof,Path(str(prior)+'.proof.json'))
    parts=[]
    for i,(start,duration)in enumerate(row['slices']):
        part=work/(row['key']+f'-{i}.mp4');parts.append(part)
        subprocess.run([ffmpeg,'-v','error','-y','-ss',str(start),'-i',str(p/row['source']),'-t',str(duration),'-vf',f"crop={row['crop']},scale=1720:900:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x10141d,setsar=1,fps=30",'-an','-c:v','libx264','-threads','2','-preset','fast','-crf','18',str(part)],check=True)
    concat=work/(row['key']+'.ffconcat');concat.write_text('ffconcat version 1.0\n'+''.join("file '{}'\n".format(x.as_posix())for x in parts))
    subprocess.run([ffmpeg,'-v','error','-y','-safe','0','-f','concat','-i',str(concat),'-c:v','copy','-an','-movflags','+faststart',str(dest)],check=True)
    proof.write_text(json.dumps({'recipe':row,'realBrowserActions':True,'galleryExcluded':True,'providerGenerationSubmissions':0},indent=2));print(row['key'],flush=True)
if not args.only or args.only=='model-and-output-v4':
    combined=p/'recordings/shots/model-and-output-v4.mp4';concat=work/'model-and-output.ffconcat'
    concat.write_text('ffconcat version 1.0\n'+''.join("file '{}'\n".format((p/f'recordings/shots/{name}.mp4').as_posix())for name in ['model-selector-v3','image-output-v3']))
    subprocess.run([ffmpeg,'-v','error','-y','-safe','0','-f','concat','-i',str(concat),'-c:v','copy','-an','-movflags','+faststart',str(combined)],check=True)
    rows.append({'key':'model-and-output-v4','file':'recordings/shots/model-and-output-v4.mp4','duration':13,'observed':'Actual model-menu footage followed by actual aspect-ratio/resolution controls; idle wait removed, with no repeating menu loop.'})
manifest=p/'Active walkthrough repair manifest.json'
if args.only and manifest.exists():
    merged={row['key']:row for row in json.loads(manifest.read_text())};merged.update({row['key']:row for row in rows});rows=list(merged.values())
manifest.write_text(json.dumps(rows,indent=2));print('Active walkthrough clips prepared.',flush=True)
