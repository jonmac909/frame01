import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),runtime=path.join(root,'.runtime/obs');
const url='https://github.com/obsproject/obs-studio/releases/download/32.2.2/OBS-Studio-32.2.2-Windows-x64.zip';
const sha256='4d6e40e3ab155f56b30de517380566a206d74b63cdf5ad49aa596924768f97e1';
if(process.platform!=='win32')throw new Error('This recorder uses Windows Graphics Capture.');
await fs.mkdir(runtime,{recursive:true});
const archive=process.argv[2]?path.resolve(process.argv[2]):path.join(root,'.runtime/obs-32.2.2.zip');
let bytes=await fs.readFile(archive).catch(()=>undefined);
if(!bytes){const response=await fetch(url);if(!response.ok)throw new Error('OBS download failed: '+response.status);bytes=Buffer.from(await response.arrayBuffer());await fs.writeFile(archive,bytes);}
if(crypto.createHash('sha256').update(bytes).digest('hex')!==sha256)throw new Error('OBS archive checksum mismatch; nothing will be executed.');
await new Promise((resolve,reject)=>{const child=spawn('tar.exe',['-xf',archive,'-C',runtime],{windowsHide:true,stdio:'inherit'});child.on('error',reject);child.on('close',code=>code===0?resolve():reject(new Error('OBS extraction failed: '+code)))});
await fs.writeFile(path.join(runtime,'portable_mode.txt'),'');
await fs.writeFile(path.join(runtime,'install-receipt.json'),JSON.stringify({version:'32.2.2',url,sha256,bytes:bytes.length,at:new Date().toISOString()},null,2));
console.log('Verified portable OBS 32.2.2 installed for Frame 01.');
