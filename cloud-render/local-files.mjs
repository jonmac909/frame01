import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Readable,Transform} from 'node:stream';
import {safeRelative,invariant} from './protocol.mjs';
export async function fileHash(file){const h=createHash('sha256');for await(const b of createReadStream(file))h.update(b);return h.digest('hex');}
export function inside(root,name){safeRelative(name);const result=path.resolve(root,name);invariant(result.startsWith(path.resolve(root)+path.sep),'Path escapes root');return result;}
export async function atomicJson(file,data){await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.tmp';await fs.writeFile(tmp,JSON.stringify(data,null,2));await fs.rename(tmp,file);}
export async function saveVerified(body,file,expected){
  await fs.mkdir(path.dirname(file),{recursive:true});const tmp=file+'.'+randomUUID()+'.part',h=createHash('sha256');let size=0;
  try{await pipeline(body instanceof Readable?body:Readable.fromWeb(body),new Transform({transform(b,_,cb){size+=b.length;if(size>expected.size)return cb(new Error('Asset exceeds declared size'));h.update(b);cb(null,b);}}),createWriteStream(tmp,{flags:'wx'}));invariant(size===expected.size&&h.digest('hex')===expected.sha256,'Asset checksum mismatch');await fs.rename(tmp,file);}
  catch(e){await fs.unlink(tmp).catch(()=>{});throw e;}
}
export async function verifiedFiles(root,manifest){for(const f of manifest.files){const file=inside(root,f.path),real=await fs.realpath(file),base=await fs.realpath(root);invariant(real.startsWith(base+path.sep),'Symlink escapes package');const s=await fs.stat(file);invariant(s.size===f.size&&await fileHash(file)===f.sha256,'Package file changed: '+f.path);}}
export function serveFile(req,res,file){
  return fs.stat(file).then(s=>{
    const type={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.mp4':'video/mp4','.wav':'audio/wav','.png':'image/png','.jpg':'image/jpeg','.ttf':'font/ttf'}[path.extname(file)]||'application/octet-stream';
    const range=req.headers.range;let start=0,end=s.size-1,status=200;
    if(range){const m=/^bytes=(\d+)-(\d*)$/.exec(range);if(!m){res.writeHead(416);res.end();return;}start=Number(m[1]);end=m[2]?Math.min(Number(m[2]),end):end;if(start>end||start>=s.size){res.writeHead(416,{'Content-Range':`bytes */${s.size}`});res.end();return;}status=206;}
    res.writeHead(status,{'Content-Type':type,'Content-Length':end-start+1,'Accept-Ranges':'bytes','Access-Control-Allow-Origin':'*',...(status===206?{'Content-Range':`bytes ${start}-${end}/${s.size}`}:{})});
    if(req.method==='HEAD')res.end();else createReadStream(file,{start,end}).on('error',()=>res.destroy()).pipe(res);
  }).catch(()=>{res.writeHead(404);res.end();});
}
