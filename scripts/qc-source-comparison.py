"""Pair every quarter-second remake sample with its source shot window."""
from pathlib import Path
import json,hashlib,cv2
from PIL import Image,ImageDraw

root=Path(__file__).resolve().parents[1];p=root/'data/projects/nano-banana-cartoon-workflow-28043a87'
plan=json.loads((p/'Complete narration repair plan.json').read_text())
source=p/'reference/analysis-1792192732714';out=p/'exports/complete-narration/qa-source-comparison';out.mkdir(parents=True,exist_ok=True)
cv2.setNumThreads(2)
for index,section in enumerate(plan['sections']):
    file=p/f'exports/complete-narration/section-{index:02}.mp4'
    if not file.exists():continue
    digest=hashlib.sha256(file.read_bytes()).hexdigest();dest=out/f'section-{index:02}';dest.mkdir(exist_ok=True);proof=dest/'comparison.json'
    if proof.exists()and json.loads(proof.read_text()).get('sectionSha256')==digest:continue
    cap=cv2.VideoCapture(str(file));assert cap.get(cv2.CAP_PROP_FPS)==30
    samples=[];frame=0;next_sample=0
    while True:
        ok,pixels=cap.read()
        if not ok:break
        if frame>=round(next_sample*30/4):
            absolute=section['from']+frame;shot=next(s for s in plan['shots']if s['from']<=absolute<s['to'])
            native_length=shot['sourceEnd']-shot['sourceStart'];length=shot['to']-shot['from'];local=absolute-shot['from']
            # Measured camera motion runs at native speed then holds. Other
            # shots use their explicit source-window proportional position.
            source_frame=shot['sourceStart']+min(local,native_length-1)if shot.get('camera')and shot['kind']=='image'and length>=native_length else shot['sourceStart']+local/max(1,length)*native_length
            source_index=max(1,min(3004,round(source_frame/30*4)+1));source_time=(source_index-1)/4
            with Image.open(source/f'frame-{source_index:06}.jpg')as original:original=original.convert('RGB').resize((240,135))
            remake=Image.fromarray(cv2.cvtColor(cv2.resize(pixels,(240,135)),cv2.COLOR_BGR2RGB))
            panel=Image.new('RGB',(240,314),'#17212a');draw=ImageDraw.Draw(panel)
            draw.text((5,3),f'Source {source_time:.2f}s',fill='white');panel.paste(original,(0,22))
            draw.text((5,160),f'Remake {absolute/30:.2f}s',fill='white');panel.paste(remake,(0,179))
            samples.append((panel,{'outputFrame':absolute,'sourceSampleSeconds':source_time,'shot':shot['id']}));next_sample+=1
        frame+=1
    cap.release();assert frame==section['to']-section['from']
    sheets=[]
    for offset in range(0,len(samples),64):
        sheet=Image.new('RGB',(1920,2512),'#17212a')
        for j,(panel,_)in enumerate(samples[offset:offset+64]):sheet.paste(panel,((j%8)*240,(j//8)*314))
        target=dest/f'sheet-{offset//64:03}.jpg';sheet.save(target,quality=90);sheets.append(str(target.relative_to(p)))
    report={'section':index,'sectionSha256':digest,'decodedFrames':frame,'sampleFps':4,'samples':len(samples),'mapping':'Explicit source shot window; measured image camera motion at native speed then final pose. Other positions are proportional within each source shot, rounded to nearest existing quarter-second sample. Generated acting and source speech are different.','sheets':sheets,'sampleMap':[row for _,row in samples],'visualReview':'Pending actual inspection'}
    proof.write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps({'section':index,'samples':len(samples),'pairedSheets':len(sheets)}),flush=True)
