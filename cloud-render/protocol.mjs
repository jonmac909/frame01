// Shared by the local runner, Cloudflare coordinator and container. No provider calls.
export const POLICY = Object.freeze({images:'local:Qwen Image 2.1',clips:'local:LTX 2.5',aroll:'HeyGen'});
export const SHA = /^[a-f0-9]{64}$/;
export function invariant(ok, message) { if (!ok) throw new Error(message); }
export function canonical(value) {
  if (value === null || typeof value !== 'object') {
    invariant(!['undefined','function','symbol'].includes(typeof value), 'Non-JSON value');
    invariant(typeof value !== 'number' || Number.isFinite(value), 'Non-finite number');
    return JSON.stringify(value);
  }
  return Array.isArray(value) ? '['+value.map(canonical).join(',')+']' : '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
export async function digest(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : canonical(value));
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)), x=>x.toString(16).padStart(2,'0')).join('');
}
export function safeRelative(name) {
  invariant(typeof name==='string' && name.length>0 && name.length<600 && !/[\\:\x00-\x1f?#%]/.test(name), 'Invalid portable path');
  invariant(!name.startsWith('/') && name.split('/').every(p=>p!=='.' && p!=='..' && p!==''), 'Path escapes package');
  return name;
}
export function integer(n, min, max, name) { invariant(Number.isSafeInteger(n)&&n>=min&&n<=max, `Invalid ${name}`); return n; }
export function validatePackage(p) {
  invariant(p?.version===1 && p.renderer==='remotion', 'Unsupported package');
  invariant(['FullRemake','CourseEditor'].includes(p.compositionId), 'Unsupported composition');
  invariant(p.width===1920&&p.height===1080&&p.fps===30, 'Expected 1080p / 30 fps');
  integer(p.frames,1,108000,'frames');
  invariant(Array.isArray(p.ranges)&&p.ranges.length>0&&p.ranges.length<=100,'Missing packaged ranges');
  for(const r of p.ranges){integer(r.from,0,p.frames-1,'range start');integer(r.to,r.from+1,p.frames,'range end');}
  invariant(canonical(p.providers)===canonical(POLICY), 'Provider policy changed');
  invariant(['benchmark','production'].includes(p.purpose), 'Missing purpose');
  invariant(p.identity && typeof p.identity.channelId==='string' && p.identity.channelId.length>0, 'Missing channel identity');
  invariant(['avatar','voice','model'].every(k=>typeof p.identity[k]==='string'&&p.identity[k].length>0), 'Missing presenter identity');
  invariant(typeof p.identity.speed==='number'&&p.identity.speed===1, 'A-roll must be prepared at 1x');
  invariant(SHA.test(p.styleSha256)&&SHA.test(p.planSha256), 'Missing style/plan binding');
  invariant(Array.isArray(p.files)&&p.files.length>0&&p.files.length<=2000, 'Invalid file inventory');
  const paths=new Set(); let size=0;
  for(const f of p.files){safeRelative(f.path);invariant(f.path.startsWith('bundle/')||f.path.startsWith('media/'), 'Unexpected package file');invariant(!paths.has(f.path.toLowerCase()), 'Duplicate package path');paths.add(f.path.toLowerCase());invariant(SHA.test(f.sha256),'Invalid file hash');integer(f.size,0,12*1024**3,'file size');size+=f.size;}
  invariant(size<=12*1024**3,'Package exceeds 12 GiB scratch budget');
  invariant(paths.has('bundle/index.html'),'Missing renderer entry');
  if(p.audioStem){safeRelative(p.audioStem);invariant(paths.has(p.audioStem.toLowerCase()),'Missing audio stem');}
  if(p.purpose==='production'){invariant(SHA.test(p.contractSha256)&&p.audioStem, 'Production requires validated contract and complete audio stem');invariant(p.ranges.length===1&&p.ranges[0].from===0&&p.ranges[0].to===p.frames,'Production package must cover every frame');}
  invariant(p.inputProps&&typeof p.inputProps==='object','Missing renderer props');
  return p;
}
export function validateJob(j) {
  invariant(j?.version===1&&SHA.test(j.packageHash),'Invalid render request');
  invariant(SHA.test(j.runtimeHash),'Missing pinned renderer runtime');
  invariant(['local','cloudflare'].includes(j.execution),'Missing execution destination');
  invariant(Object.keys(j).every(k=>['version','packageHash','runtimeHash','execution','imageHash','from','to','concurrency','encoder','videoBitrate','trial'].includes(k)),'Unknown render option');
  invariant(j.execution==='cloudflare'?SHA.test(j.imageHash):j.imageHash===undefined,'Cloud image must be pinned by digest');
  if(j.trial!==undefined)integer(j.trial,1,10,'benchmark trial');
  integer(j.from,0,107999,'start frame'); integer(j.to,j.from+1,108000,'end frame');
  invariant(j.to-j.from<=1800,'Render units may not exceed 60 seconds');
  integer(j.concurrency,1,8,'concurrency');
  invariant(['software','nvenc'].includes(j.encoder),'Unsupported encoder');
  if(j.encoder==='nvenc')invariant(/^\d{1,2}M$/.test(j.videoBitrate??''),'NVENC needs an explicit bitrate');
  else invariant(j.videoBitrate===undefined,'Software encoder uses fixed CRF 19');
  return j;
}
export function splitFrames(frames, chunk=600) { integer(frames,1,108000,'frames');integer(chunk,1,1800,'chunk');const out=[];for(let from=0;from<frames;from+=chunk)out.push({from,to:Math.min(frames,from+chunk)});return out; }
export function checkCoverage(parts,frames){let next=0;for(const p of [...parts].sort((a,b)=>a.from-b.from)){invariant(p.from===next&&p.to>p.from,'Missing, duplicate or overlapping render unit');next=p.to;}invariant(next===frames,'Incomplete master');}
export function estimateReservation(seconds) { return Math.round(seconds*.40104/3600*1e8)/1e8; }
