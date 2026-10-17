'use strict';
const source=document.querySelector('#source'),ours=document.querySelector('#ours'),sync=document.querySelector('#sync');
const scrub=document.querySelector('#scrub'),status=document.querySelector('#playback-status');
const isMotion=new URLSearchParams(location.search).get('clip')==='motion';
const config=isMotion?{
 title:'Character-sheet motion',version:'Motion 02',offset:85,limit:577/30,storage:'frame01-source-review-motion02',
 source:'media/source-01m25s.mp4',ours:'media/sienna-motion-v2.mp4',sourcePoster:'media/source-poster.jpg',oursPoster:'media/sienna-motion-v2.jpg',
 markers:[[0,'Card reveal'],[3,'Face zoom'],[6.75,'Pan left'],[10,'Pan down'],[13.25,'Pan right'],[14.25,'Pan up'],[15.8,'Presenter']],
 context:'Updated camera path: the body pans down at 10–13 seconds and the face pans up at 14–15.5 seconds. Both exports were inspected at 4 fps. Camera travel is measured from the source; the artwork, framing within the artwork, and motion blur still differ. Existing Sienna narration reused.'
}:{
 title:'First minute',version:'Opening 01',offset:0,limit:60,storage:'frame01-source-review-opening01',
 source:'media/source-first-minute.mp4',ours:'media/sienna-first-minute-v1.mp4',sourcePoster:'media/source-opening.jpg',oursPoster:'media/sienna-opening.jpg',
 markers:[[0,'Model logos'],[5.25,'Cartoon'],[11.17,'Reaction cut'],[24.5,'Sienna'],[29.87,'Framed demo'],[33.57,'Software'],[37,'Sliding montage'],[44.13,'OpenArt'],[53.33,'Workspace'],[58.8,'3D example']],
 context:'First 60 seconds, with new local cartoon examples and the existing Sienna recording. The accepted 1.5× HeyGen narration remains; complete spoken cues were reordered to fit the edit. The OpenArt home view is a browser still; the prompt insert is recorded footage. The source’s promotional link badge is omitted. This is a review cut, not the completed video.'
};
const videos=[source,ours],SOURCE_OFFSET=config.offset,LIMIT=config.limit,STORAGE=config.storage;
source.dataset.src=config.source;ours.dataset.src=config.ours;source.poster=config.sourcePoster;ours.poster=config.oursPoster;
document.querySelector('#sample-title').textContent=config.title;
document.querySelector('#sample-summary').textContent=`${config.version} · ${LIMIT<20?'source 1:25–1:44.23':'source 0:00–1:00'}`;
document.querySelector('#sample-context').textContent=config.context;
document.querySelector('#sample-download').href=config.ours;
document.querySelector('nav a').href=`https://www.youtube.com/watch?v=rOl7ZLG4BRg&t=${SOURCE_OFFSET}s`;
document.querySelector(isMotion?'#motion-link':'#opening-link').setAttribute('aria-current','page');
document.querySelector(isMotion?'#motion-link':'#opening-link').classList.add('version');
document.querySelector('#full-link').classList.remove('version');
document.querySelector(isMotion?'#opening-link':'#motion-link').classList.remove('version');
for(const [at,label] of config.markers){const b=document.createElement('button');b.dataset.time=at;b.textContent=label;document.querySelector('.moments').append(b);}
let acting=false,mode='both',stamp=0,seeking=false;
const time=n=>{n=Math.max(0,Number(n)||0);return `${Math.floor(n/60)}:${(n%60).toFixed(2).padStart(5,'0')}`};
const current=()=>mode==='source'?source.currentTime:ours.currentTime;
const duration=()=>Math.min(LIMIT,...videos.map(v=>Number.isFinite(v.duration)?v.duration:LIMIT));
const say=text=>status.textContent=text;
function pause(){acting=true;videos.forEach(v=>v.pause());acting=false;say('Paused · choose a moment or step through one frame at a time.');}
function seek(value){const next=Math.max(0,Math.min(duration(),value));seeking=true;videos.forEach(v=>{if(v.readyState)v.currentTime=next});seeking=false;draw();}
function sound(value){source.muted=value!=='source';ours.muted=value!=='ours';document.querySelector('#source-sound').textContent=source.muted?'muted':'sound on';document.querySelector('#ours-sound').textContent=ours.muted?'muted':'sound on';document.querySelector(`input[name=sound][value=${value}]`).checked=true;}
async function play(which='both'){
  if(videos.some(v=>v.readyState<1)){say('Both clips are still loading. Playback will be ready in a moment.');return;}
  mode=which;acting=true;
  if(which==='both'){sync.checked=true;const target=current()>=duration()-.05?0:current();seek(target);}
  else{sync.checked=false;const v=which==='source'?source:ours;videos.filter(x=>x!==v).forEach(x=>x.pause());if(v.currentTime>=duration()-.05)v.currentTime=0;sound(which);}
  const selected=which==='both'?videos:[which==='source'?source:ours];
  const results=await Promise.allSettled(selected.map(v=>v.play()));acting=false;
  if(results.some(r=>r.status==='rejected')){pause();say('Playback could not start. Click Play both again or use either video’s play button.');}
  else say(which==='both'?`Playing together · source starts at ${time(SOURCE_OFFSET)}.`:`Playing ${which==='source'?'source':'Sienna'} only · click Play both to compare again.`);
}
function draw(){const t=current();scrub.max=duration();scrub.value=t;document.querySelector('#elapsed').textContent=`${time(t)} / ${time(duration())}`;document.querySelector('#source-clock').textContent=time(source.currentTime+SOURCE_OFFSET);document.querySelector('#ours-clock').textContent=time(ours.currentTime);const markers=[...document.querySelectorAll('[data-time]')];markers.forEach((b,i)=>b.setAttribute('aria-current',String(t>=+b.dataset.time&&t<(+(markers[i+1]?.dataset.time??Infinity)))));}
function tick(){if(sync.checked&&mode==='both'&&!seeking&&!ours.paused&&!source.paused&&Math.abs(source.currentTime-ours.currentTime)>.12)source.currentTime=ours.currentTime;if(mode==='both'&&sync.checked&&current()>=duration()-.018&&!ours.paused){pause();seek(duration());say('Sample complete. Restart to compare again.');}draw();requestAnimationFrame(tick);}
for(const v of videos){
  v.addEventListener('loadedmetadata',()=>{draw();setStamp();if(videos.every(x=>x.readyState>=1))say(`Ready · Play both to compare the same ${Math.round(LIMIT)}-second section.`);});
  v.addEventListener('error',()=>say(`The ${v===source?'source':'Sienna'} video could not load. Reload this page to try again.`));
  v.addEventListener('play',()=>{if(!acting&&sync.checked){mode='both';const other=v===source?ours:source;acting=true;other.currentTime=v.currentTime;other.play().catch(()=>{pause();say('Click Play both to start both videos.');}).finally(()=>{acting=false;});}});
  v.addEventListener('pause',()=>{if(!acting&&sync.checked){const other=v===source?ours:source;acting=true;other.pause();acting=false;}});
  v.addEventListener('seeking',()=>{if(!seeking&&sync.checked){const other=v===source?ours:source;if(Math.abs(other.currentTime-v.currentTime)>.06)other.currentTime=v.currentTime;}draw();});
  v.addEventListener('volumechange',()=>{if(!v.muted){const other=v===source?ours:source;other.muted=true;}document.querySelector('#source-sound').textContent=source.muted?'muted':'sound on';document.querySelector('#ours-sound').textContent=ours.muted?'muted':'sound on';document.querySelector(`input[name=sound][value=${!source.muted?'source':!ours.muted?'ours':'off'}]`).checked=true;});
  v.addEventListener('ended',()=>{if(sync.checked)pause();});
}
document.querySelector('#play-both').onclick=()=>play();
document.querySelector('#pause-both').onclick=pause;
document.querySelector('#restart').onclick=()=>{pause();mode='both';sync.checked=true;seek(0);};
document.querySelector('#source-only').onclick=()=>play('source');
document.querySelector('#ours-only').onclick=()=>play('ours');
sync.onchange=()=>{if(sync.checked){pause();mode='both';seek(ours.currentTime);}};
scrub.oninput=()=>{pause();seek(+scrub.value);};
document.querySelector('#speed').onchange=e=>videos.forEach(v=>v.playbackRate=+e.target.value);
document.querySelectorAll('input[name=sound]').forEach(r=>r.onchange=()=>sound(r.value));
function step(delta){pause();seek(current()+delta/30);}
document.querySelector('#back-frame').onclick=()=>step(-1);
document.querySelector('#next-frame').onclick=()=>step(1);
document.querySelectorAll('[data-time]').forEach(b=>b.onclick=()=>{pause();seek(+b.dataset.time);setStamp();});
document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,button,a'))return;if(e.code==='Space'){e.preventDefault();videos.some(v=>!v.paused)?pause():play();}if(e.code==='ArrowLeft'||e.code==='ArrowRight'){e.preventDefault();step(e.code==='ArrowLeft'?-1:1);}});
function setStamp(){stamp=current();document.querySelector('#stamp').textContent=time(stamp);document.querySelector('#source-stamp').textContent=`source ${time(SOURCE_OFFSET+stamp)}`;}
document.querySelector('#stamp-now').onclick=setStamp;document.querySelector('#stamp').onclick=()=>{pause();seek(stamp);};
let notes=[];try{const stored=JSON.parse(localStorage.getItem(STORAGE)||'[]');if(Array.isArray(stored))notes=stored.filter(n=>typeof n.text==='string'&&Number.isFinite(n.at)&&n.at>=0&&n.at<=LIMIT);}catch{}
function showNotes(){const list=document.querySelector('#notes');list.replaceChildren();for(const n of notes){const li=document.createElement('li'),b=document.createElement('button'),p=document.createElement('p');b.textContent=time(n.at);b.type='button';b.title=`Source ${time(n.at+SOURCE_OFFSET)}`;b.onclick=()=>{pause();seek(n.at);setStamp();};p.textContent=n.text;li.append(b,p);list.append(li);}}
document.querySelector('#note-form').onsubmit=e=>{e.preventDefault();const input=document.querySelector('#note'),text=input.value.trim();if(!text)return;notes.push({at:stamp,text,createdAt:new Date().toISOString()});let saved=true;try{localStorage.setItem(STORAGE,JSON.stringify(notes));}catch{saved=false;}input.value='';showNotes();document.querySelector('#note-status').textContent=saved?'Note saved in this browser.':'Browser storage is unavailable. Export notes to keep them.';};
document.querySelector('#export-notes').onclick=()=>{const lines=[`# Frame 01 — ${config.title} / ${config.version}`,'',`Source: https://www.youtube.com/watch?v=rOl7ZLG4BRg`,`Source window: ${time(SOURCE_OFFSET)}–${time(SOURCE_OFFSET+LIMIT)}`,'',...notes.map(n=>`- Sample ${time(n.at)} / source ${time(n.at+SOURCE_OFFSET)}: ${n.text}`)];const url=URL.createObjectURL(new Blob([lines.join('\n')],{type:'text/markdown;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=`Frame 01 ${config.version} notes.md`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
showNotes();draw();requestAnimationFrame(tick);
// These short review clips are loaded once as local media blobs. This makes
// frame seeking reliable even when the private host does not serve byte ranges.
Promise.all(videos.map(async v=>{
  const response=await fetch(v.dataset.src,{credentials:'same-origin'});
  if(!response.ok)throw new Error(`Video download returned ${response.status}`);
  const blob=await response.blob();
  if(!blob.size||blob.type.includes('text/html'))throw new Error('Expected a video file');
  v.src=URL.createObjectURL(new Blob([blob],{type:'video/mp4'}));v.load();
})).catch(()=>say('A video could not load. Reload this page to try again.'));
