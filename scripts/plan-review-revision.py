"""Retain every native narration frame and implement the 13 review comments.

The accepted baseline and its assets are read-only inputs. This plan has a new
name/export and never inherits the abandoned cue-removal/runtime cap choices.
"""
from pathlib import Path
import json,copy,math,hashlib,shutil,subprocess

app=Path(__file__).resolve().parents[1];p=app/'data/projects/nano-banana-cartoon-workflow-28043a87';task=app.parents[2]/'frame01-sol-video-editor';evidence=task/'work/revision-01'
read=lambda path:json.loads(path.read_text(encoding='utf-8'))
write=lambda path,obj:path.write_text(json.dumps(obj,indent=2),encoding='utf-8')
base=read(evidence/'baseline-plan.json');pace=read(evidence/'baseline-pace.json');oldProof=read(p/'Complete narration timing proof.json');f=lambda s:round(s*30)
assert base['frames']==23257 and pace['frames']==18045
nativeFrames=24041;first=f(pace['openingAcousticBoundaries']['anchor-first-sentence']);beforeStart=f(pace['openingAcousticBoundaries']['anchor-before-start']);beforeEnd=f(pace['openingAcousticBoundaries']['anchor-before-end'])
introEnd=138;prepEnd=introEnd+beforeEnd-beforeStart;teaserEnd=prepEnd+594
speech=[{'from':0,'to':first,'trim':0},{'from':introEnd,'to':prepEnd,'trim':beforeStart},{'from':teaserEnd,'to':teaserEnd+beforeStart-first,'trim':first}]
cursor=speech[-1]['to'];raw=beforeEnd;gaps=[]
for i,gap in enumerate(oldProof['gaps']):
 end=f(pace['demoAcousticBoundaries'][i]);speech.append({'from':cursor,'to':cursor+end-raw,'trim':raw});cursor=speech[-1]['to'];length=f(gap['end']-gap['start']);gaps.append({**gap,'from':cursor,'to':cursor+length});cursor+=length;raw=end
speech.append({'from':cursor,'to':cursor+nativeFrames-raw,'trim':raw});frames=speech[-1]['to']
covered=sorted((s['trim'],s['trim']+s['to']-s['from'])for s in speech);end=0
for a,b in covered:assert a==end,(a,end);end=b
assert end==nativeFrames and len(speech)==len(base['speech'])==11

def native(paced):
 piece=next((q for q in pace['pieces']if paced<q['to']),pace['pieces'][-1]);return piece['sourceFrom']*30+(paced-piece['from'])*piece['rate']

def warp(n):
 if n<=138:return n
 if n<=732:return n+prepEnd-138
 for i,old in enumerate(base['speech'][2:],2):
  new=speech[i]
  if old['from']<=n<=old['to']:
   return max(new['from'],min(new['to'],new['from']+round(native(old['trim']+n-old['from']))-new['trim']))
  if i+1<len(speech)and old['to']<n<base['speech'][i+1]['from']:
   a,b=old['to'],base['speech'][i+1]['from'];return round(new['to']+(n-a)/(b-a)*(speech[i+1]['from']-new['to']))
 return frames

def at(sourceSeconds):
 knots=oldProof['knots']
 for a,b in zip(knots,knots[1:]):
  if a[0]<=sourceSeconds<=b[0]:return warp(round(a[1]+(sourceSeconds-a[0])/(b[0]-a[0])*(b[1]-a[1])))
 return frames

def rawAt(seconds):
 n=f(seconds);cut=next(s for s in speech if s['trim']<=n<=s['trim']+s['to']-s['from']);return cut['from']+n-cut['trim']

def extendCamera(camera,length):
 if len(camera)<4:return [{**q,'frame':min(length-1,q['frame'])}for q in camera]
 if length<len(camera):return[{**camera[round(i*(len(camera)-1)/max(1,length-1))],'frame':i}for i in range(length)]
 return [{**q,'frame':i}for i,q in enumerate(camera)]+[{**camera[-1],'frame':i}for i in range(len(camera),length)]

demos={190.2333:['3d-badger-scene-motion','badger-pie-reaction'],304.5:['watercolor-village-motion','watercolor-journey','watercolor-reunion'],377.5:['rubber-hose-magic-motion','rubber-magic-surprise','rubber-magic-payoff'],437.5:['paper-underwater-motion','paper-underwater-reveal','paper-underwater-reaction'],556.25:['opening-dialogue-first-timed','opening-dialogue-second-clean','nineties-hatch-action','nineties-exit-action'],623.5:['anime-bridge-motion','anime-bridge-leap','anime-bridge-landing'],689.5:['clay-kite-motion','clay-kite-mishap','clay-kite-rescue','clay-kite-payoff']}
asset=lambda key:'assets/'+(''if key.startswith('opening-')else'local-')+key+'.mp4'
audioCache={}
def hasAudio(file):
 if file not in audioCache:
  info=json.loads(subprocess.check_output([r'C:\ffmpeg\bin\ffprobe.exe','-v','error','-show_streams','-of','json',str(p/file)]));audioCache[file]=any(s['codec_type']=='audio'for s in info['streams'])
 return audioCache[file]

shots=[];sound=[];demoProof=[]
for old in base['shots']:
 shot=copy.deepcopy(old);shot['from']=warp(old['from']);shot['to']=warp(old['to'])
 if old['kind']=='intro':shot.update(from_=0);shot.pop('from_',None);shot['from']=0;shot['to']=138;shots.append(shot);shots.append({'id':'review-opening-direction','from':138,'to':prepEnd,'sourceStart':138,'sourceEnd':138,'kind':'presenter','note':'Native prompt-direction sentence ends before example dialogue.'});continue
 if old['kind']=='teaser':shot['from']=prepEnd;shot['to']=teaserEnd;shots.append(shot);sound.extend([{'from':prepEnd+18,'to':prepEnd+317,'asset':'assets/opening-dialogue-first-timed.mp4','trim':0,'gain':.7},{'from':prepEnd+317,'to':teaserEnd,'asset':'assets/opening-dialogue-second-clean.mp4','trim':0,'gain':.7}]);continue
 if shot['to']<=shot['from']:continue
 if old['kind']=='text':shot['kind']='presenter';shot.pop('asset',None)
 if old.get('camera'):shot['camera']=extendCamera(old['camera'],shot['to']-shot['from'])
 if old['kind']=='screen':
  # Real recordings retain their exact speed/duration; continued explanation
  # returns to the avatar instead of stretching or replaying a menu.
  end=shot['to'];length=min(old['to']-old['from'],end-shot['from']);shot['to']=shot['from']+length
  shot['parts']=[{**old['parts'][0],'from':0,'to':length}]
  if shot.get('camera'):shot['camera']=extendCamera(old['camera'],length)
  shots.append(shot)
  if shot['to']<end:shots.append({'id':shot['id']+'-native-explanation','from':shot['to'],'to':end,'sourceStart':shot['sourceStart'],'sourceEnd':shot['sourceEnd'],'kind':'presenter'})
  continue
 if old['kind']=='example':
  demoKey=next((k for k in demos if abs(k-old['sourceStart']/30)<.05),None)
  end=shot['to'];length=end-shot['from']
  if demoKey is not None:
   gap=next(g for g in gaps if abs(g['start']-demoKey)<.05);assert abs(gap['from']-shot['from'])<=1;shot['from']=gap['from'];shot['to']=gap['to'];length=gap['to']-gap['from'];keys=demos[demoKey]
   if demoKey==556.25:
    lengths=[215,254,(length-469)//2,length-469-(length-469)//2];trims=[84,19,75,120]
   else:
    lengths=[length//len(keys)]*len(keys);lengths[-1]+=length-sum(lengths);trims=[min(15,298-n)for n in lengths]
   parts=[];pos=0
   for key,n,trim in zip(keys,lengths,trims):
    file=asset(key);assert n>0 and trim>=0 and trim+n<=(300 if key=='opening-dialogue-first-timed'else 298),(file,n,trim)
    parts.append({'from':pos,'to':pos+n,'asset':file,'trim':trim})
    if hasAudio(file):sound.append({'from':shot['from']+pos,'to':shot['from']+pos+n,'asset':file,'trim':trim,'gain':.7})
    pos+=n
   shot['parts']=parts;shot['note']='Unique native clips once each; audio uses the same file, trim and frame interval. Silent action originals remain silent.'
   demoProof.append({'sourceStart':demoKey,'from':shot['from'],'to':shot['to'],'parts':[{**q,'hasNativeAudio':hasAudio(q['asset'])}for q in parts]})
  else:
   # Short previews are one pass. Speech remains foreground; dialogue previews
   # under narration are muted to avoid repeated competing words.
   part=old['parts'][0];length=min(length,298-part['trim']);shot['to']=shot['from']+length;shot['parts']=[{**part,'from':0,'to':length,'scale':1}]
  shots.append(shot)
  if shot['to']<end:shots.append({'id':shot['id']+'-native-explanation','from':shot['to'],'to':end,'sourceStart':shot['sourceEnd'],'sourceEnd':shot['sourceEnd'],'kind':'presenter'})
  continue
 shots.append(shot)

def replace(a,b,newShot):
 global shots
 result=[]
 for shot in shots:
  if shot['to']<=a or shot['from']>=b:result.append(shot);continue
  if shot['from']<a:result.append({**shot,'id':shot['id']+'-before-text','to':a})
  if shot['to']>b:
   delta=b-shot['from'];tail={**shot,'id':shot['id']+'-after-text','from':b}
   if tail.get('parts'):tail['parts']=[{**q,'from':max(0,q['from']-delta),'to':q['to']-delta,'trim':q['trim']+max(0,delta-q['from'])}for q in tail['parts']if q['to']>delta]
   if tail.get('camera'):tail['camera']=extendCamera(tail['camera'][min(delta,len(tail['camera'])-1):],tail['to']-b)
   result.append(tail)
 result.append(newShot);shots=result

timing=read(p/'Review revision word timing.json');wordProof=[];title=None
for phrase in timing['phrases']:
 assert not phrase['unresolved'],phrase['key'];allWords=phrase['words']
 if phrase['key']=='expression':
  index=next(i for i,w in enumerate(allWords)if w['text']=='A');title={'from':rawAt(phrase['start']+allWords[0]['from']/30),'to':rawAt(phrase['start']+allWords[index]['from']/30),'text':'Identity is only half of the problem.'}
 else:index=next(i for i,w in enumerate(allWords)if w['text']=='prompt')-1
 selected=allWords[index:];startFrame=selected[0]['from'];a=rawAt(phrase['start']+startFrame/30);b=rawAt(min(phrase['end'],phrase['start']+selected[-1]['from']/30+.6));words=[];previous=0
 for word in selected:
  n=max(previous,min(b-a-1,word['from']-startFrame));text=word['text'].capitalize()if not words else word['text'];words.append({'text':text,'from':n,'highlight':bool(__import__('re').search('character|recognizable|lifeless|expression|speaks|say|reacts',word['text'],__import__('re').I))});previous=n
 shot={'id':'review-word-'+phrase['key'],'from':a,'to':b,'sourceStart':f(110.5 if phrase['key']=='expression'else 469.7333),'sourceEnd':f(115.6 if phrase['key']=='expression'else 471.9),'kind':'text','words':words,'note':'Actual spoken wording. Reveal times measured from native speech ASR prefixes; requires playback QA.'};replace(a,b,shot);wordProof.append({'key':phrase['key'],'from':a,'to':b,'words':words})

brand='assets/review-google-banana-card.png';shutil.copyfile(evidence/'source-google-banana-card.png',p/brand)
shots.sort(key=lambda s:s['from']);assert shots[0]['from']==0 and shots[-1]['to']==frames
for a,b in zip(shots,shots[1:]):assert a['to']==b['from'],(a['id'],a['to'],b['id'],b['from'])
# All24 source returns were inspected at native cut,+4,+12,+30 frames. Only
# these returns show a flash. Others use a cut, slide, circular wipe or swirl;
# the old blanket rule incorrectly flashed clean logo/image returns.
flashSources=[24.4,115.6,258.7333,342.7333,417.5,471.9,501.3333,667.8,740.5]
flashes=[]
for previous,current in zip(shots,shots[1:]):
 if current['kind']!='presenter'or previous['kind']not in['image','example','teaser','text','montage']:continue
 if previous['id'].startswith('review-word-')or(previous['kind']=='teaser')or any(abs(previous['sourceEnd']/30-s)<.05 for s in flashSources):flashes.append(current['from'])
flashes=sorted(set(flashes))
assert title and title['to']>title['from']
openingCtaEnd=at(53.3333);openingPresenter=next(s for s in shots if s['sourceStart']==1372 and s['kind']=='presenter')
effects={'bananaCard':brand,'font':'assets/pack-c7c1be029d996982-Evolventa-Bold.ttf','flashes':flashes,'ctas':[{'from':max(openingPresenter['from']+6,openingCtaEnd-f(4.2533)),'to':openingCtaEnd},{'from':at(742.2),'to':at(744.5)}],'titles':[title]}
sections=[{**s,'from':warp(s['from']),'to':warp(s['to'])}for s in base['sections']]
for a,b in zip(sections,sections[1:]):assert a['to']==b['from']
assert sections[0]['from']==0 and sections[-1]['to']==frames
for audio in sound:
 matches=[(s,q)for s in shots for q in s.get('parts',[])if s['from']+q['from']==audio['from']and s['from']+q['to']==audio['to']and q['asset']==audio['asset']and q['trim']==audio['trim']]
 assert matches or prepEnd<=audio['from']<teaserEnd,audio
 assert not any(audio['from']<s['to']and audio['to']>s['from']for s in speech),'Demo dialogue overlaps narration'
plan={**base,'frames':frames,'aroll':'assets/sienna-review-native-1x.mp4','shots':shots,'speech':speech,'sound':sound,'sfx':sorted(set(warp(n)for n in base['sfx'])),'sections':sections,'reviewEffects':effects,'limitations':['Every original narration frame retained at native1x; longer runtime explicitly accepted by the human.','Existing opening originals are1024x576; excessive2.7x crops removed. No hidden high-resolution detail claimed.','Fourteen derived motion originals have no audio stream; unique silent action footage is used without fabricated loop beds.','Word onset measurements use120ms ASR prefixes and require actual playback inspection.','Original provider lip sync is preserved; no trained lip-sync claim.']}
write(p/'Review revision plan.json',plan)
proof={'frames':frames,'duration':frames/30,'nativeNarrationFrames':nativeFrames,'all177CuesRetained':True,'originalFramePartition':covered,'removedCues':0,'rate':1,'userDecision':'Keep every word at natural pace; accept the longer runtime','opening':{'introEnd':introEnd,'directionFrom':introEnd,'directionTo':prepEnd,'teaserFrom':prepEnd,'teaserTo':teaserEnd},'demos':demoProof,'wordCards':wordProof,'effects':effects,'sections':sections,'baselinePlanSha256':hashlib.sha256((evidence/'baseline-plan.json').read_bytes()).hexdigest(),'renderQa':'Pending; this is plan validation only.'}
write(p/'Review revision timing proof.json',proof);write(task/'outputs/Review revision timing proof.json',proof)
print(json.dumps({'frames':frames,'duration':frames/30,'shots':len(shots),'nativeAudioInserts':len(sound),'demoWindows':len(demoProof),'allOriginalNarrationFrames':nativeFrames,'status':'Plan prepared; render/playback QA pending'}))
