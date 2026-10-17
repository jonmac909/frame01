import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directory=path.join(root,'data/projects/nano-banana-cartoon-workflow-28043a87/approved-method');
const manifest=JSON.parse(await fs.readFile(path.join(directory,'manifest.json'),'utf8'));
for(const entry of manifest.files){
  const actual=crypto.createHash('sha256').update(await fs.readFile(path.join(directory,entry.snapshot))).digest('hex');
  if(actual!==entry.sha256)throw new Error(`Approved snapshot changed: ${entry.snapshot}`);
}
console.log(JSON.stringify({approved:true,filesVerified:manifest.files.length,scope:manifest.scope,fullVideoApproved:false}));
