import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {saveVerified,fileHash,verifiedFiles} from '../local-files.mjs';
test('download verifies bytes before commit and retains no corrupt target',async()=>{const base=path.resolve('work/test-files');await fs.mkdir(base,{recursive:true});const dir=await fs.mkdtemp(path.join(base,'case-'));try{const b=Buffer.from('exact original media'),sha256=createHash('sha256').update(b).digest('hex'),f=path.join(dir,'media/a.mp4');await saveVerified(Readable.from([b]),f,{sha256,size:b.length});assert.equal(await fileHash(f),sha256);await assert.rejects(saveVerified(Readable.from([Buffer.from('wrong')]),path.join(dir,'bad'),{sha256,size:b.length}));await assert.rejects(fs.stat(path.join(dir,'bad')));await verifiedFiles(dir,{files:[{path:'media/a.mp4',sha256,size:b.length}]});await fs.appendFile(f,'changed');await assert.rejects(verifiedFiles(dir,{files:[{path:'media/a.mp4',sha256,size:b.length}]}));}finally{assert.ok(path.resolve(dir).startsWith(base+path.sep));await fs.rm(dir,{recursive:true,force:true});}});
