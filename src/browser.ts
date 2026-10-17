import fs from 'node:fs/promises';
import path from 'node:path';
import {chromium,type BrowserContext,type Page} from 'playwright';
import {DATA,projectDir,readProject,mutate,event,reserveHeyGen,hash,addAsset,serial,run,FFMPEG} from './core.js';

type Surface={context:BrowserContext;page:Page;revision:number;refs:Map<string,{text:string;tag:string;href:string}>};
const surfaces=new Map<string,Surface>();
const recordings=new Map<string,{context:BrowserContext;page:Page;startedAt:number;file:string}>();
const chrome=process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
function key(id:string,kind:string){return id+':'+kind}
function heygenUrl(url:string){try{return new URL(url).hostname==='app.heygen.com'}catch{return false}}
function checkUrl(url:string){const u=new URL(url);if(!['https:','http:'].includes(u.protocol))throw new Error('Only web URLs are supported.');return u.toString()}
function draftUrl(url:string){const u=new URL(url);if(!heygenUrl(url)||!/(video|editor|studio|draft|create-v4)/i.test(u.pathname)||!/[a-z0-9_-]{12,}/i.test(u.pathname+u.search))throw new Error('Provide the existing HeyGen editor/draft URL containing its ID.');return u.toString()}
function videoUrl(url:string){const u=new URL(url);if(!heygenUrl(url)||!/(video|share)/i.test(u.pathname)||!/[a-z0-9_-]{12,}/i.test(u.pathname+u.search))throw new Error('Provide the existing generated video URL containing its ID.');return u.toString()}

export async function openBrowser(id:string,kind:'heygen'|'walkthrough',url?:string){
  return serial('browser-open:'+id+kind,async()=>{
    let s=surfaces.get(key(id,kind));
    if(s&&!s.page.isClosed()){if(url)await navigate(id,kind,url);return snapshot(id,kind)}
    await fs.mkdir(path.join(DATA,'profiles'),{recursive:true});
    // Dedicated profiles preserve interactive sign-in without reading another browser's credentials.
    const context=await chromium.launchPersistentContext(path.join(DATA,'profiles',kind),{executablePath:chrome,headless:false,viewport:{width:1920,height:1080},args:['--window-size=1440,900']});
    const page=context.pages()[0]||await context.newPage();s={context,page,revision:0,refs:new Map()};surfaces.set(key(id,kind),s);
    context.on('close',()=>surfaces.delete(key(id,kind)));
    await page.goto(checkUrl(url||(kind==='heygen'?'https://app.heygen.com/':'https://openart.ai/')),{waitUntil:'domcontentloaded'});
    return snapshot(id,kind);
  });
}
function surface(id:string,kind:string){const s=surfaces.get(key(id,kind));if(!s||s.page.isClosed())throw new Error(`Open the ${kind} browser first.`);return s}
export async function navigate(id:string,kind:'heygen'|'walkthrough',url:string){
  const s=surface(id,kind);checkUrl(url);
  if(kind==='walkthrough'&&heygenUrl(url))throw new Error('HeyGen is only available through the guarded HeyGen browser.');
  if(kind==='heygen'){
    if(!heygenUrl(url))throw new Error('HeyGen navigation must stay on app.heygen.com. Complete login manually.');
    const p=await readProject(id);
    if(/(create|new|generate)/i.test(new URL(url).pathname)&&url!==p.heygen.draft?.url)throw new Error('Use the one-draft action to create the draft.');
  }
  await s.page.goto(url,{waitUntil:'domcontentloaded'});s.revision++;return snapshot(id,kind);
}
export async function snapshot(id:string,kind:'heygen'|'walkthrough'){
  const s=surface(id,kind);const revision=++s.revision;
  const elements=await s.page.evaluate((rev)=>{
    const els=Array.from(document.querySelectorAll('button,a,input,textarea,select,[role="button"],[role="combobox"],[contenteditable="true"],[role="option"],[role="menuitem"]'));
    return els.filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0}).slice(0,350).map((e,i)=>{
      const ref=`e${rev}-${i}`;e.setAttribute('data-editor-ref',ref);const sensitive=e instanceof HTMLInputElement&&(e.type==='password'||/one-time-code|cc-/.test(e.autocomplete));return {ref,tag:e.tagName.toLowerCase(),role:e.getAttribute('role'),text:(e.getAttribute('aria-label')||e.textContent||e.getAttribute('placeholder')||'').trim().slice(0,180),value:sensitive?'[redacted]':e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement?e.value:undefined,href:e instanceof HTMLAnchorElement?e.href:''};
    });
  },revision);
  s.refs=new Map(elements.map(e=>[e.ref,e]));
  const text=(await s.page.locator('body').innerText()).slice(0,22000);
  const file=`browser/${kind}.jpg`;await fs.mkdir(path.join(projectDir(id),'browser'),{recursive:true});await s.page.screenshot({path:path.join(projectDir(id),file),type:'jpeg',quality:75});
  return {url:s.page.url(),revision,elements,text,screenshot:file,recording:recordings.has(id)};
}
const dangerous=/\b(create|generate|submit|duplicate|copy video|new video|new draft|start from|use template|use avatar|use this|make video|publish|render|delete|remove|buy|purchase|upgrade)\b/i;
export async function act(id:string,kind:'heygen'|'walkthrough',action:'click'|'fill'|'press'|'scroll',ref?:string,value?:string){
  const s=surface(id,kind);
  if(action==='scroll'){await s.page.mouse.wheel(0,Math.max(-2000,Math.min(2000,Number(value)||700)));return snapshot(id,kind)}
  const found=s.refs.get(ref||'');if(!found)throw new Error('Element reference is stale or absent. Take a fresh snapshot.');
  if(kind==='heygen'){
    if(dangerous.test(found.text+' '+found.href))throw new Error('Creation/submission/navigation is guarded. Use the dedicated one-draft or one-video action.');
    if(action==='press'&&['Enter','NumpadEnter'].includes(value||''))throw new Error('Enter can submit a HeyGen form. Use the explicit submission action.');
    if(found.href&&new URL(found.href).origin!=='https://app.heygen.com')throw new Error('Open external pages in the walkthrough browser.');
  }else if(heygenUrl(s.page.url())||heygenUrl(found.href))throw new Error('Use the guarded HeyGen browser.');
  const el=s.page.locator(`[data-editor-ref="${ref}"]`);
  if(action==='click')await el.click({timeout:15000});
  else if(action==='fill')await el.fill(value||'',{timeout:15000});
  else await el.press(value||'Tab',{timeout:15000});
  await mutate(id,p=>event(p,'browser',`${kind}: ${action} ${found.text.slice(0,70)}`));
  return snapshot(id,kind);
}
export async function oneHeyGenClick(id:string,kind:'draft'|'video',ref:string){
  return serial('heygen-action:'+id,async()=>{
    const s=surface(id,'heygen');if(!heygenUrl(s.page.url()))throw new Error('Sign in to HeyGen first.');
    const found=s.refs.get(ref);if(!found)throw new Error('Take a fresh snapshot and select the actual create/submit control.');
    if(kind==='video'&&!/generate|submit|create video|render/i.test(found.text))throw new Error('Select the observed final generation button.');
    if(kind==='draft'&&!/create|new video|use avatar|use this|start from|studio/i.test(found.text))throw new Error('Select the observed control that opens the single draft.');
    if(kind==='video')await verifyHeyGen(id);
    // Persist BEFORE any browser side effect. Never clear this record automatically.
    await reserveHeyGen(id,kind);
    try{
      await s.page.locator(`[data-editor-ref="${ref}"]`).click({timeout:20000});
      await mutate(id,p=>{p.heygen[kind]!.state='uncertain';event(p,'heygen',`${kind} click sent. Inspect and reconcile the same item before continuing.`)});
    }catch(e){await mutate(id,p=>{p.heygen[kind]!.state='uncertain';p.heygen[kind]!.error=String(e);event(p,'heygen-uncertain',`Do not repeat ${kind}: ${String(e)}`)});throw e}
    return snapshot(id,'heygen');
  });
}
export async function reconcileHeyGen(id:string,kind:'draft'|'video',url:string){
  const checked=kind==='draft'?draftUrl(url):videoUrl(url);
  return mutate(id,p=>{
    const old=p.heygen[kind];if(old?.url&&old.url!==checked)throw new Error(`This project is already bound to another ${kind}. It cannot be replaced.`);
    p.heygen[kind]={attemptedAt:old?.attemptedAt||new Date().toISOString(),state:'confirmed',url:checked};
    event(p,'heygen-linked',`Linked the sole ${kind}: ${checked}`);
  });
}
export async function verifyHeyGen(id:string){
  const p=await readProject(id);const s=surface(id,'heygen');
  if(!p.heygen.draft?.url||s.page.url()!==p.heygen.draft.url)throw new Error('Open the linked draft before verification.');
  const values=await s.page.locator('input,textarea,[contenteditable="true"]').evaluateAll(els=>els.map(e=>e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement?e.value:e.textContent).join(' '));
  const haystack=((await s.page.locator('body').innerText())+' '+values).toLowerCase();
  for(const required of [p.avatar,p.voice,p.model,p.tone].filter((v):v is string=>!!v))if(!haystack.includes(required.toLowerCase()))throw new Error(`The draft does not visibly confirm ${required}. Select it and inspect again.`);
  if(!p.script.trim())throw new Error('Save the final script first.');
  const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
  if(!normalize(haystack).includes(normalize(p.script)))throw new Error('The complete saved script is not visible in this draft. Confirm every scene before submitting. V1 verifies a single continuous A-roll script.');
  const speeds=await s.page.locator('input[type=range],[role=slider]').evaluateAll(els=>els.filter(e=>{const r=e.getBoundingClientRect();const label=e.getAttribute('aria-label')||e.parentElement?.parentElement?.textContent||'';return r.width>0&&r.height>0&&/^Speed\b/i.test(label.trim())}).map(e=>Number(e.getAttribute('aria-valuenow')??(e as HTMLInputElement).value)));
  if(speeds.length!==1||speeds[0]!==(p.voiceSpeed??1))throw new Error('Visibly verify the required voice speed (default 1.0x). Never accelerate narration to fit runtime.');
  const observedHash=hash(p.script);
  return mutate(id,p=>{if(hash(p.script)!==observedHash)throw new Error('Script changed during verification.');p.heygen.verified={avatar:p.avatar,voice:p.voice,model:p.model,tone:p.tone,voiceSpeed:speeds[0],at:new Date().toISOString(),scriptHash:observedHash};event(p,'heygen-verified','Verified avatar, voice, motion model, tone, voice speed and the complete script in the linked draft.');});
}
export async function downloadHeyGen(id:string,ref:string){
  const p=await readProject(id);if(!p.heygen.video?.url)throw new Error('Link the existing generated video first.');
  const s=surface(id,'heygen');const found=s.refs.get(ref);if(!found||!/download/i.test(found.text))throw new Error('Select the observed Download button.');
  const downloadPromise=s.page.waitForEvent('download',{timeout:60000});
  await s.page.locator(`[data-editor-ref="${ref}"]`).click();const download=await downloadPromise;
  const file='assets/heygen-aroll.mp4';await fs.mkdir(path.join(projectDir(id),'assets'),{recursive:true});await download.saveAs(path.join(projectDir(id),file));
  await addAsset(id,file,'aroll');return mutate(id,p=>{p.heygen.asset=file});
}
export async function startRecording(id:string){
  return serial('record:'+id,async()=>{
    if(recordings.has(id))throw new Error('A recording is already running.');
    const current=surface(id,'walkthrough');if(heygenUrl(current.page.url()))throw new Error('Record walkthrough apps, not the HeyGen account.');
    const browser=current.context.browser();if(!browser)throw new Error('Browser unavailable.');
    const context=await browser.newContext({viewport:{width:1920,height:1080},deviceScaleFactor:1,storageState:await current.context.storageState(),recordVideo:{dir:path.join(projectDir(id),'recordings','raw'),size:{width:1920,height:1080}}});
    const page=await context.newPage();const file=`recordings/walkthrough-${Date.now()}.mp4`;
    await page.goto(current.page.url(),{waitUntil:'domcontentloaded'});
    recordings.set(id,{context,page,startedAt:Date.now(),file});
    surfaces.set(key(id,'walkthrough'),{context,page,revision:0,refs:new Map()});
    // Keep the authenticated base context alive for the shared browser process.
    context.on('close',()=>{surfaces.set(key(id,'walkthrough'),current)});
    await mutate(id,p=>event(p,'recording-started','Recording the real browser viewport at 1920 × 1080.'));
    return snapshot(id,'walkthrough');
  });
}
export async function stopRecording(id:string){
  return serial('record:'+id,async()=>{
    const r=recordings.get(id);if(!r)throw new Error('No recording is running.');
    const video=r.page.video();await r.context.close();recordings.delete(id);if(!video)throw new Error('The browser produced no recording.');
    const source=await video.path();await run(FFMPEG,['-y','-i',source,'-c:v','libx264','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',path.join(projectDir(id),r.file)],{timeout:300000});
    await addAsset(id,r.file,'screen');await mutate(id,p=>event(p,'recording-stopped',`Saved ${r.file}; no microphone audio was recorded.`));return {file:r.file};
  });
}
export async function browserStatus(){return {open:[...surfaces.keys()],recordings:[...recordings.keys()]}}
