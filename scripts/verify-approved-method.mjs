import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {createReadStream} from 'node:fs';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'data/projects/nano-banana-cartoon-workflow-28043a87/approved-method');
const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
for(const entry of manifest.files){
  const actual=crypto.createHash('sha256').update(await fs.readFile(path.join(directory,entry.snapshot))).digest('hex');
  if(actual!==entry.sha256)throw new Error(`Approved snapshot changed: ${entry.snapshot}`);
}
const project=path.dirname(directory);
let approval;
try{approval=JSON.parse(await fs.readFile(path.join(project,'Owner approval.json'),'utf8'))}catch(e){if(e.code!=='ENOENT')throw e}
if(approval){
  if(approval.ownerApproved!==true||!approval.ownerStatement||!Array.isArray(approval.files)||!approval.files.length)throw new Error('Invalid owner approval record');
  for(const entry of approval.files){
    const target=path.resolve(project,entry.path),relative=path.relative(project,target);
    if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Approval path must stay inside the project');
    const hash=crypto.createHash('sha256');for await(const chunk of createReadStream(target))hash.update(chunk);
    if(hash.digest('hex')!==entry.sha256)throw new Error(`Approved final artifact changed: ${entry.path}`);
  }
}
console.log(JSON.stringify({approved:true,filesVerified:manifest.files.length,scope:manifest.scope,fullVideoApproved:approval?.ownerApproved===true,finalFilesVerified:approval?.files.length??0,masterSha256:approval?.masterSha256}));
