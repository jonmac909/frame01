// Local final assembly. Never concatenate per-unit AAC: use the one validated complete stem.
import fs from 'node:fs/promises';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {digest,canonical,validateJob,validatePackage,checkCoverage,invariant} from './protocol.mjs';
import {fileHash,inside,verifiedFiles,atomicJson} from './local-files.mjs';
const exec=promisify(execFile),[root,units,out]=process.argv.slice(2),p=validatePackage(JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')));
invariant(p.purpose==='production','Benchmark packages cannot be published as production masters');await verifiedFiles(root,p);const packageHash=await digest(p),proofs=[];
for(const name of await fs.readdir(units)){if(!name.endsWith('.mp4.proof.json'))continue;const proof=JSON.parse(await fs.readFile(path.join(units,name),'utf8'));if(proof.packageHash!==packageHash)continue;const file=path.join(units,name.replace(/\.proof\.json$/,''));invariant(await fileHash(file)===proof.sha256,'Changed render unit');invariant(await digest(proof.job)===proof.jobHash,'Changed job receipt');proofs.push({...proof,file});}
for(const proof of proofs){validateJob(proof.job);invariant(proof.from===proof.job.from&&proof.to===proof.job.to&&proof.frames===proof.to-proof.from,'Inconsistent unit receipt');invariant(proof.job.trial===undefined,'Benchmark trial cannot be assembled as production');}
proofs.sort((a,b)=>a.from-b.from);checkCoverage(proofs,p.frames);
invariant(new Set(proofs.map(x=>canonical({runtimeHash:x.job.runtimeHash,execution:x.job.execution,encoder:x.job.encoder,videoBitrate:x.job.videoBitrate??null}))).size===1,'Mixed renderer or encoder settings');
const dir=path.dirname(path.resolve(out));await fs.mkdir(dir,{recursive:true});invariant(!await fs.stat(out).then(()=>true,()=>false),'Refusing to overwrite an existing master');
const list=out+'.concat.txt';await fs.writeFile(list,proofs.map(x=>"file '"+path.resolve(x.file).replaceAll('\\','/').replaceAll("'","'\\''")+"'").join('\n'));
const ffmpeg=process.env.FFMPEG_PATH||(process.platform==='win32'?'C:\\ffmpeg\\bin\\ffmpeg.exe':'ffmpeg'),probe=process.env.FFPROBE_PATH||(process.platform==='win32'?'C:\\ffmpeg\\bin\\ffprobe.exe':'ffprobe');
await exec(ffmpeg,['-v','error','-n','-f','concat','-safe','0','-i',list,'-i',inside(root,p.audioStem),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',out+'.partial.mp4'],{windowsHide:true,timeout:1800000});
const info=JSON.parse((await exec(probe,['-v','error','-show_format','-show_streams','-of','json',out+'.partial.mp4'],{windowsHide:true})).stdout);
invariant(Number(info.streams.find(s=>s.codec_type==='video')?.nb_frames)===p.frames,'Master frame count mismatch');invariant(info.streams.some(s=>s.codec_type==='audio'),'Master missing audio');invariant(Math.abs(Number(info.format.duration)-p.frames/30)<.06,'Master duration mismatch');
await fs.rename(out+'.partial.mp4',out);await atomicJson(out+'.proof.json',{packageHash,sha256:await fileHash(out),frames:p.frames,contractSha256:p.contractSha256,unitHashes:proofs.map(x=>x.sha256),audioStem:p.audioStem,qa:'Technical assembly passed. Listening and 4 FPS visual comparison still required.'});console.log(JSON.stringify({file:out,frames:p.frames}));
