from pathlib import Path
import cv2,json,sys,math,subprocess
from PIL import Image,ImageDraw,ImageOps
root=Path(__file__).resolve().parents[1];p=root/'data/projects/nano-banana-cartoon-workflow-28043a87'
mode=sys.argv[1]if len(sys.argv)>1 else'assets'
if mode=='assets':
    requests=json.loads((p/'Additional demo requests.json').read_text())
    files=[p/f"assets/local-{r['assetKey']}.mp4"for r in requests if r['kind']=='video']
elif mode=='walkthrough':files=[p/r['file']for r in json.loads((p/'Walkthrough insert manifest.json').read_text())]
elif mode=='active-walkthrough':files=[p/r['file']for r in json.loads((p/'Active walkthrough repair manifest.json').read_text())]
elif mode=='complete-narration':files=sorted((p/'exports/complete-narration').glob('section-??.mp4'))
else:files=sorted((p/'exports/source-runtime').glob('section-??.mp4'))
export='complete-narration'if mode=='complete-narration'else'source-runtime'
out=p/f'exports/{export}/qa-{mode}';out.mkdir(parents=True,exist_ok=True)
cv2.setNumThreads(2)
for file in files:
    if not file.exists():continue
    dest=out/file.stem;dest.mkdir(exist_ok=True)
    if (dest/'scan.json').exists() and file.stat().st_mtime <= (dest/'scan.json').stat().st_mtime:continue
    cap=cv2.VideoCapture(str(file));fps=cap.get(cv2.CAP_PROP_FPS);total=int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    samples=[];flags=[];frame=0;next_sample=0
    while True:
        ok,im=cap.read()
        if not ok:break
        gray=cv2.cvtColor(cv2.resize(im,(160,90)),cv2.COLOR_BGR2GRAY)
        mean=float(gray.mean());std=float(gray.std())
        if std<1.8 or mean<2:flags.append({'frame':frame,'seconds':frame/fps,'mean':round(mean,3),'std':round(std,3)})
        if frame>=round(next_sample*fps/4):
            thumb=Image.fromarray(cv2.cvtColor(cv2.resize(im,(384,216)),cv2.COLOR_BGR2RGB));samples.append((frame/fps,thumb));next_sample+=1
        frame+=1
    cap.release()
    sheets=[]
    per_page=64 if mode not in ['assets','walkthrough','active-walkthrough'] else 40
    for offset in range(0,len(samples),per_page):
        columns=8 if per_page==64 else 5;cell_width=240 if per_page==64 else 384;cell_height=160 if per_page==64 else 240
        sheet=Image.new('RGB',(1920,8*cell_height),'#202830');d=ImageDraw.Draw(sheet)
        for j,(t,thumb)in enumerate(samples[offset:offset+per_page]):
            x=(j%columns)*cell_width;y=(j//columns)*cell_height;sheet.paste(thumb.resize((cell_width,int(cell_width*9/16))),(x,y+22));d.text((x+8,y+4),f'{t:.3f}s',fill='white')
        target=dest/f'sheet-{offset//per_page:03}.jpg';sheet.save(target,quality=88);sheets.append(str(target.relative_to(p)))
    metadata=json.loads(subprocess.run([r'C:\ffmpeg\bin\ffprobe.exe','-v','error','-show_streams','-show_format','-of','json',str(file)],capture_output=True,text=True,check=True).stdout)
    report={'file':str(file.relative_to(p)),'fps':fps,'reportedFrames':total,'decodedFrames':frame,'duration':frame/fps,'sampleFps':4,'samples':len(samples),'sheets':sheets,'uniformFlags':flags,'streams':metadata['streams'],'visualReview':'Pending actual inspection'}
    (dest/'scan.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps({'file':file.name,'frames':frame,'samples':len(samples),'flags':len(flags),'sheets':len(sheets)}),flush=True)
