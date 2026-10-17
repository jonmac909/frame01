"""Track source artwork, not the new artwork, at native 30 fps using SIFT/RANSAC."""
from pathlib import Path
import cv2,numpy as np,json,time
root=Path(__file__).resolve().parents[1]
p=root/'data/projects/nano-banana-cartoon-workflow-28043a87'
out=p/'reference/cameras';requests=json.loads((out/'requests.json').read_text())
cv2.setNumThreads(4)
cap=cv2.VideoCapture(str(p/'reference/source.mp4'))
detector=cv2.SIFT_create(nfeatures=2500);matcher=cv2.BFMatcher()
for request in requests:
    dest=out/(request['key']+'.json')
    if dest.exists():continue
    first=round(request['start']*30);last=round(request['end']*30);anchor=round(request['anchor']*30)
    cap.set(cv2.CAP_PROP_POS_FRAMES,anchor);ok,base=cap.read();assert ok
    base=cv2.resize(base,(960,540));mask=np.zeros((540,960),np.uint8);mask[30:510,40:920]=255
    kb,db=detector.detectAndCompute(cv2.cvtColor(base,cv2.COLOR_BGR2GRAY),mask)
    cap.set(cv2.CAP_PROP_POS_FRAMES,first);rows=[]
    for f in range(first,last):
        ok,frame=cap.read();assert ok
        frame=cv2.resize(frame,(960,540));k,d=detector.detectAndCompute(cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY),None)
        pairs=matcher.knnMatch(db,d,k=2)if d is not None and db is not None else[]
        good=[a for pair in pairs if len(pair)==2 for a,b in[pair]if a.distance<.68*b.distance]
        row={'frame':f-first,'sourceFrame':f,'matches':len(good)}
        if len(good)>=10:
            a=np.float32([kb[m.queryIdx].pt for m in good]);b=np.float32([k[m.trainIdx].pt for m in good])
            mat,ins=cv2.estimateAffinePartial2D(a,b,method=cv2.RANSAC,ransacReprojThreshold=1.5,maxIters=2500,confidence=.999)
            if mat is not None and int(ins.sum())>=10:
                scale=float(np.linalg.norm(mat[:,0]));x=float(mat[0,2]/960);y=float(mat[1,2]/540)
                if .8<scale<3.5 and abs(x)<3 and abs(y)<3:row.update(scale=scale,x=x,y=y,inliers=int(ins.sum()))
        rows.append(row)
    valid=[r for r in rows if 'scale'in r]
    # Only interpolate gaps between measured frames. Untracked ends remain explicit.
    poses=[]
    for r in rows:
        if 'scale'in r:poses.append({k:r[k]for k in['frame','scale','x','y']})
        elif valid and valid[0]['frame']<r['frame']<valid[-1]['frame']:
            a=max((v for v in valid if v['frame']<r['frame']),key=lambda v:v['frame']);b=min((v for v in valid if v['frame']>r['frame']),key=lambda v:v['frame'])
            ratio=(r['frame']-a['frame'])/(b['frame']-a['frame']);poses.append({'frame':r['frame'],**{k:a[k]+(b[k]-a[k])*ratio for k in['scale','x','y']}})
    result={**request,'fps':30,'frames':last-first,'trackedFrames':len(valid),'coverage':len(valid)/(last-first),'poses':poses,'untrackedFrames':[r['frame']for r in rows if 'scale'not in r],'raw':rows,'basis':'Source SIFT feature correspondence + affine RANSAC, scale and viewport-normalized translation relative to anchor. Entrance/flash tracking gaps require visual correction.'}
    dest.write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items()if k not in['poses','raw','untrackedFrames','basis']}),flush=True)
cap.release()
