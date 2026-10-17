'use strict';
(async()=>{
const $=selector=>document.querySelector(selector);
const source=$('#source'),ours=$('#ours'),videos=[source,ours],sync=$('#sync'),scrub=$('#scrub');
const time=n=>{n=Math.max(0,Number(n)||0);return `${Math.floor(n/60)}:${(n%60).toFixed(2).padStart(5,'0')}`};
const say=text=>$('#playback-status').textContent=text;
const response=await fetch('full-manifest.json');if(!response.ok)throw new Error('Manifest unavailable');
const manifest=await response.json(),sections=manifest.sections,total=manifest.frames/30,cache=new Map();
let index=0,mode='both',acting=false,loading=false,seeking=false,generation=0,stamp=0,desiredSound='ours';
const section=()=>sections[index],length=()=> (section().to-section().from)/30;
const current=()=>section().from/30+(mode==='source'?source.currentTime/(section().sourceTo-section().sourceFrom)*length():ours.currentTime);
const sourceLocal=local=>Math.max(0,Math.min(section().sourceTo-section().sourceFrom-.01,local/length()*(section().sourceTo-section().sourceFrom)));
$('#sample-title').textContent='Full 12:31 remake';$('#sample-summary').textContent='1.0× Sienna narration · all seven styles';
$('#sample-context').textContent='Complete source-length edit using the replacement Sienna recording at normal speed. These are 720p review copies; the delivered master is 1080p. The approved samples retain their original test audio. The new illustrations and animation are local Qwen/LTX examples. Software steps are real OpenArt recordings. Full-video approval is pending your review.';
$('#full-link').setAttribute('aria-current','page');source.removeAttribute('poster');ours.removeAttribute('poster');
document.querySelector('nav a').href='https://www.youtube.com/watch?v=rOl7ZLG4BRg';
scrub.max=total;scrub.step=1/30;
for(const s of sections){const button=document.createElement('button');button.textContent=s.name;button.dataset.section=s.index;button.onclick=()=>seek(s.from/30);$('.moments').append(button);}
async function blob(file){if(!cache.has(file))cache.set(file,fetch(file,{credentials:'same-origin'}).then(async r=>{if(!r.ok)throw new Error('Review section unavailable');const b=await r.blob();if(!b.size||b.type.includes('text/html'))throw new Error('Expected video');return URL.createObjectURL(new Blob([b],{type:'video/mp4'}));}));return cache.get(file);}
function pause(){acting=true;videos.forEach(v=>v.pause());acting=false;}
function sound(value){desiredSound=value;acting=true;source.muted=value!=='source';ours.muted=value!=='ours';acting=false;$('#source-sound').textContent=source.muted?'muted':'sound on';$('#ours-sound').textContent=ours.muted?'muted':'sound on';$(`input[name=sound][value=${value}]`).checked=true;}
function setLocal(local){seeking=true;ours.currentTime=Math.max(0,Math.min(length()-.005,local));source.currentTime=sourceLocal(local);seeking=false;draw();}
async function loadSection(next,local=0,resume=false){
 const ticket=++generation;pause();loading=true;index=next;say(`Loading ${section().name.toLowerCase()}…`);draw();
 try{const urls=await Promise.all([blob(section().source),blob(section().ours)]);if(ticket!==generation)return;
  await Promise.all(videos.map((v,i)=>new Promise((resolve,reject)=>{v.onloadedmetadata=resolve;v.onerror=reject;v.src=urls[i];v.load();})));
  if(ticket!==generation)return;loading=false;setLocal(local);sound(desiredSound);$('#sample-download').href=section().ours;$('#sample-download').textContent='Download review section';
  say(`Ready · ${section().name} · ${time(section().from/30)}–${time(section().to/30)}`);if(resume)await play(mode);
  const upcoming=sections[index+1];if(upcoming){blob(upcoming.source).catch(()=>{});blob(upcoming.ours).catch(()=>{});}
 }catch(e){loading=false;say(`This review section could not load. Choose it again to retry.`);cache.delete(section().source);cache.delete(section().ours);}
}
async function seek(value){pause();const at=Math.max(0,Math.min(total-1/30,value)),next=sections.findIndex(s=>at>=s.from/30&&at<s.to/30);mode='both';if(next!==index||loading)await loadSection(next,at-sections[next].from/30);else setLocal(at-section().from/30);setStamp();}
async function play(which='both'){
 if(loading)return;mode=which;acting=true;sync.checked=which==='both';
 if(which!=='both'){videos.filter(v=>v!==(which==='source'?source:ours)).forEach(v=>v.pause());sound(which);}
 const chosen=which==='both'?videos:[which==='source'?source:ours];
 try{await Promise.all(chosen.map(v=>v.play()));say(`Playing ${which==='both'?'together':which==='ours'?'Sienna':'source'} · ${section().name}`);}catch{pause();say('Click Play both to start playback.');}finally{acting=false;}
}
function draw(){const t=Math.min(total,current());scrub.value=t;$('#elapsed').textContent=`${time(t)} / ${time(total)}`;$('#ours-clock').textContent=time(section().from/30+ours.currentTime);$('#source-clock').textContent=time(section().sourceFrom+source.currentTime);document.querySelectorAll('[data-section]').forEach(b=>b.setAttribute('aria-current',String(+b.dataset.section===index)));}
function tick(){if(!loading&&sync.checked&&mode==='both'&&!ours.paused){const wanted=sourceLocal(ours.currentTime);if(Math.abs(source.currentTime-wanted)>.2&&!source.seeking){seeking=true;source.currentTime=wanted;seeking=false;}}draw();requestAnimationFrame(tick);}
$('#play-both').onclick=()=>play();$('#pause-both').onclick=()=>{pause();say('Paused.');};$('#restart').onclick=()=>seek(0);
$('#source-only').onclick=()=>play('source');$('#ours-only').onclick=()=>play('ours');scrub.oninput=()=>seek(+scrub.value);
$('#speed').onchange=e=>videos.forEach(v=>v.playbackRate=+e.target.value);
sync.onchange=()=>{pause();mode='both';if(sync.checked)setLocal(ours.currentTime);};
document.querySelectorAll('input[name=sound]').forEach(r=>r.onchange=()=>sound(r.value));
async function step(delta){await seek(current()+delta/30);}
$('#back-frame').onclick=()=>step(-1);$('#next-frame').onclick=()=>step(1);
for(const v of videos){
 v.addEventListener('play',()=>{if(!acting&&!loading&&sync.checked){acting=true;const other=v===ours?source:ours;other.play().catch(()=>pause()).finally(()=>acting=false);}});
 v.addEventListener('pause',()=>{if(!acting&&!loading&&sync.checked&&!v.ended){acting=true;videos.filter(x=>x!==v).forEach(x=>x.pause());acting=false;}});
 v.addEventListener('seeking',()=>{if(!seeking&&!loading&&sync.checked){seeking=true;if(v===ours){const target=sourceLocal(ours.currentTime);if(Math.abs(source.currentTime-target)>.08)source.currentTime=target;}else{const target=source.currentTime/(section().sourceTo-section().sourceFrom)*length();if(Math.abs(ours.currentTime-target)>.08)ours.currentTime=target;}seeking=false;}draw();});
 v.addEventListener('ended',()=>{if(loading)return;if(v===source&&mode==='both')return;if(index<sections.length-1)loadSection(index+1,0,true);else{pause();say('Full video complete.');}});
}
document.addEventListener('keydown',e=>{if(e.target.closest('input,textarea,select,button,a'))return;if(e.code==='Space'){e.preventDefault();videos.some(v=>!v.paused)?pause():play();}if(['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();step(e.code==='ArrowLeft'?-1:1);}});
function setStamp(){stamp=current();$('#stamp').textContent=time(stamp);$('#source-stamp').textContent=`source ${time(section().sourceFrom+sourceLocal(stamp-section().from/30))}`;}
$('#stamp-now').onclick=setStamp;$('#stamp').onclick=()=>seek(stamp);
const storage='frame01-full-source-runtime-v1';let notes=[];try{const stored=JSON.parse(localStorage.getItem(storage)||'[]');if(Array.isArray(stored))notes=stored.filter(n=>typeof n.text==='string'&&Number.isFinite(n.at)&&n.at>=0&&n.at<=total);}catch{}
function showNotes(){const list=$('#notes');list.replaceChildren();for(const n of notes){const li=document.createElement('li'),button=document.createElement('button'),text=document.createElement('p');button.type='button';button.textContent=time(n.at);button.onclick=()=>seek(n.at);text.textContent=n.text;li.append(button,text);list.append(li);}}
$('#note-form').onsubmit=e=>{e.preventDefault();const input=$('#note'),text=input.value.trim();if(!text)return;notes.push({at:stamp,text,createdAt:new Date().toISOString()});try{localStorage.setItem(storage,JSON.stringify(notes));$('#note-status').textContent='Note saved in this browser.';}catch{$('#note-status').textContent='Export notes to keep them.';}input.value='';showNotes();};
$('#export-notes').onclick=()=>{const file=URL.createObjectURL(new Blob([['# Frame 01 full-video review','',...notes.map(n=>`- ${time(n.at)}: ${n.text}`)].join('\n')],{type:'text/markdown'})),a=document.createElement('a');a.href=file;a.download='Frame 01 full-video notes.md';a.click();setTimeout(()=>URL.revokeObjectURL(file),1000);};
showNotes();sound('ours');await loadSection(0);setStamp();requestAnimationFrame(tick);
})().catch(()=>{document.querySelector('#playback-status').textContent='The full review could not load. Reload to try again.';});
