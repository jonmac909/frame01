from pathlib import Path
import cv2,json,numpy as np
from PIL import Image,ImageDraw
root=Path(__file__).resolve().parents[1];p=root/'data/projects/nano-banana-cartoon-workflow-28043a87';out=p/'exports/source-runtime/camera-comparison';out.mkdir(exist_ok=True)
plan=json.loads((p/'Source-runtime remake plan.json').read_text());source=cv2.VideoCapture(str(p/'reference/source.mp4'));cv2.setNumThreads(2)
shots=[s for s in plan['shots']if s.get('camera')];rows=[];detector=cv2.SIFT_create(nfeatures=1800);matcher=cv2.BFMatcher()
def frame(cap,n):
    cap.set(cv2.CAP_PROP_POS_FRAMES,n);ok,im=cap.read();assert ok;return cv2.resize(im,(960,540))
for shot in shots:
    section=next((i,s)for i,s in enumerate(plan['sections'])if s['from']<=shot['from']<s['to']);file=p/f'exports/source-runtime/section-{section[0]:02}.mp4'
    if not file.exists():continue
    cap=cv2.VideoCapture(str(file));poses=shot['camera'];anchor=len(poses)//2;base=frame(cap,shot['from']-section[1]['from']+anchor)
    kb,db=detector.detectAndCompute(cv2.cvtColor(base,cv2.COLOR_BGR2GRAY),None);measured=[]
    for local in range(0,len(poses),8):
        im=frame(cap,shot['from']-section[1]['from']+local);k,d=detector.detectAndCompute(cv2.cvtColor(im,cv2.COLOR_BGR2GRAY),None)
        if db is None or d is None:continue
        good=[a for pair in matcher.knnMatch(db,d,k=2)if len(pair)==2 for a,b in[pair]if a.distance<.7*b.distance]
        if len(good)<12:continue
        a=np.float32([kb[m.queryIdx].pt for m in good]);b=np.float32([k[m.trainIdx].pt for m in good]);mat,ins=cv2.estimateAffinePartial2D(a,b,method=cv2.RANSAC,ransacReprojThreshold=1.5)
        if mat is None or int(ins.sum())<12:continue
        ratio=poses[local]['scale']/poses[anchor]['scale'];x=(poses[local]['x']-ratio*poses[anchor]['x'])*960;y=(poses[local]['y']-ratio*poses[anchor]['y'])*540
        measured.append({'frame':local,'scaleError':float(abs(np.linalg.norm(mat[:,0])-ratio)),'translationErrorPixels1080':float(np.hypot(mat[0,2]-x,mat[1,2]-y)*2),'inliers':int(ins.sum())})
    panels=[]
    for fraction in [.15,.5,.85]:
        sourceFrame=round(shot['sourceStart']+(shot['sourceEnd']-shot['sourceStart']-1)*fraction);local=round((len(poses)-1)*fraction)
        panels.append((frame(source,sourceFrame),frame(cap,shot['from']-section[1]['from']+local),sourceFrame,shot['from']+local))
    rows.append({'id':shot['id'],'samples':measured,'panels':panels});cap.release();print(json.dumps({'shot':shot['id'],'trackedSamples':len(measured)}),flush=True)
sheets=[]
for offset in range(0,len(rows),3):
    sheet=Image.new('RGB',(1920,1260),'#202830');draw=ImageDraw.Draw(sheet)
    for r,row in enumerate(rows[offset:offset+3]):
        for c,(a,b,sa,sb)in enumerate(row['panels']):
            x=c*640;y=r*420;draw.text((x+8,y+3),f"{row['id']} source {sa}/30; remake {sb}/30",fill='white')
            for image,n in[(a,0),(b,1)]:sheet.paste(Image.fromarray(cv2.cvtColor(image,cv2.COLOR_BGR2RGB)).resize((640,180)),(x,y+25+n*195))
    file=out/f'comparison-{offset//3:02}.jpg';sheet.save(file,quality=90);sheets.append(str(file.relative_to(p)))
for row in rows:del row['panels']
report={'shots':rows,'sheets':sheets,'basis':'Measured source camera paths, with native rendered artwork feature tracking against the compositor path. Comparison panels show equal editorial fractions; extra holds can shift the phase.','limitations':['Original artwork and reference artwork differ. This measures relative movement, not pixel-identical scene content.','Entrance/flash frames without sufficient features remain visually reviewed rather than counted as tracked.']}
(out/'proof.json').write_text(json.dumps(report,indent=2));source.release()
