import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import {Client} from 'eve/client';
import {ROOT,DATA,createProject,listProjects,readProject,mutate,event,projectDir,safePath} from './core.js';
import {action} from './actions.js';
import {browserStatus} from './browser.js';
import {bridgeStatus,installBridge} from './chrome-bridge.js';
import {shutdownWindowRecordings} from './window-recording.js';
import {createJobStore} from './jobs.js';
import {operationSchema} from './director-contract.js';
const app=express(),port=Number(process.env.PORT||4317),host='127.0.0.1';
await fs.mkdir(DATA,{recursive:true});
const lockFile=path.join(DATA,'server.lock');
try{const lock=await fs.open(lockFile,'wx');await lock.writeFile(String(process.pid));await lock.close()}catch{
  const pid=Number(await fs.readFile(lockFile,'utf8'));let alive=true;try{process.kill(pid,0)}catch{alive=false}
  if(alive)throw new Error(`Editor already running (PID ${pid}). Open http://${host}:${port}.`);
  await fs.unlink(lockFile);const lock=await fs.open(lockFile,'wx');await lock.writeFile(String(process.pid));await lock.close();
}
// Keep the approved local connection valid across editor restarts.
const tokenFile=path.join(DATA,'runtime-token');
let token:string;
try{token=(await fs.readFile(tokenFile,'utf8')).trim();if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Invalid local editor token; restore it before starting.')}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;token=crypto.randomBytes(32).toString('hex');await fs.writeFile(tokenFile,token,{flag:'wx'})}
const jobs=createJobStore(DATA),busy=new Set<string>();
await jobs.reconcile();
app.use((req,res,next)=>{
  if(![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host||'')){res.status(403).json({error:'Loopback access only.'});return;}
  const extension=/^chrome-extension:\/\/[a-p]{32}$/.test(req.headers.origin||'');
  if(req.headers.origin&&!extension&&![`http://127.0.0.1:${port}`,`http://localhost:${port}`].includes(req.headers.origin)){res.status(403).json({error:'Cross-origin requests blocked.'});return;}
  if(extension){res.setHeader('Access-Control-Allow-Origin',req.headers.origin!);res.setHeader('Access-Control-Allow-Headers','Content-Type,X-Editor-Token,Idempotency-Key');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');if(req.method==='OPTIONS'){res.sendStatus(204);return;}}
  if(req.method!=='GET'&&req.headers['x-editor-token']!==token){res.status(403).json({error:'Missing local editor token.'});return;}next();
});
app.use(express.json({limit:'3mb'}));
installBridge(app);
app.get('/api/config',(_req,res)=>res.json({token,port,evePort:4318,browserMode:'existing-chrome',bridge:bridgeStatus()}));
app.get('/api/health',async(_req,res)=>{let agent:unknown;try{agent=await new Client({host:'http://127.0.0.1:4318'}).health()}catch{agent={ok:false,error:'Director offline. Start the agent and connect a model with /login.'}}res.json({ok:true,agent,browser:await browserStatus()});});
app.get('/api/projects',async(_req,res)=>res.json(await listProjects()));
app.post('/api/projects',async(req,res)=>res.status(201).json(await createProject(req.body)));
app.get('/api/projects/:id',async(req,res)=>res.json(await readProject(req.params.id)));
app.get('/api/jobs',async(req,res)=>{const offset=Math.max(0,Number(req.query.offset)||0),limit=Math.min(100,Math.max(1,Number(req.query.limit)||50));const rows=(await jobs.list()).sort((a,b)=>b.startedAt.localeCompare(a.startedAt));res.json(rows.slice(offset,offset+limit).map(jobs.publicJob));});
app.post('/api/projects/:id/action',async(req,res)=>{
  const id=req.params.id;await readProject(id);const {name,args}=operationSchema.parse({name:req.body.name,args:req.body.args??{}});
  const readOnly=new Set(['project.read','project.summary','reference.read','reference.frames','script.read','preflight.check','feedback.context','contract.check','contract.events','effects.catalog','jobs.read','plan.read','course.search','library.search','media.inspect','record.windows','record.status']);
  for(const op of ['evidence.list','evidence.search','evidence.frames'])readOnly.add(op);
  if(readOnly.has(name)){res.json(await action(id,name,args));return;}
  const key=req.headers['idempotency-key'];if(key!==undefined&&typeof key!=='string')throw new Error('One idempotency key required.');
  const reserved=await jobs.reserve(id,name,args,key);const {job}=reserved;
  if(!reserved.created){if(job.state==='complete')res.json(job.result);else res.status(job.state==='running'?202:409).json({...jobs.publicJob(job),error:job.error});return;}
  const execute=()=>jobs.execute(job,()=>action(id,name,args));
  if(req.body.background||['render','render.sections','render.assemble','evidence.index'].includes(name)){void execute().catch(async e=>{console.error(`Editor job ${job.id} failed: ${String(e)}`);await mutate(id,p=>event(p,'error',`${name}: ${String(e)}`)).catch(error=>console.error(String(error)))});res.status(202).json(jobs.publicJob(job));return;}
  res.json(await execute());
});
app.post('/api/projects/:id/chat',async(req,res)=>{
  const id=req.params.id,p=await readProject(id),message=String(req.body.message||'').trim();if(!message)throw new Error('Message required.');
  if(busy.has(id)||(await jobs.list()).some(j=>j.projectId===id&&j.state==='running')){res.status(409).json({error:'Wait for the current operation.'});return;}busy.add(id);res.setHeader('Content-Type','application/x-ndjson');res.setHeader('Cache-Control','no-cache');res.flushHeaders();
  try{
    const client=new Client({host:'http://127.0.0.1:4318'}),prompt=`Current project ID: ${id}. ${message}`;let response;
    if(p.sessionId){const session=client.sessions.attach(p.sessionId);response=await session.send(prompt)}else{const created=await client.sessions.create({message:prompt});response=created.response;await mutate(id,p=>{p.sessionId=created.session.state.sessionId})}
    for await(const e of response)if(!res.destroyed)res.write(JSON.stringify(e)+'\n');
  }catch(e){if(!res.destroyed)res.write(JSON.stringify({type:'editor.error',data:{message:String(e)}})+'\n');await mutate(id,p=>event(p,'director-error',String(e)))}finally{busy.delete(id);res.end()}
});
app.get('/media/:id/*file',async(req,res)=>{const rel=Array.isArray(req.params.file)?req.params.file.join('/'):req.params.file;if(!/\.(mp4|webm|mov|mp3|wav|jpg|png|srt|vtt|ttf|otf|woff2?)$/i.test(rel)){res.sendStatus(403);return;}res.sendFile(safePath(projectDir(req.params.id),rel));});
app.use(express.static(path.join(ROOT,'public')));
app.use((err:any,_req:express.Request,res:express.Response,_next:express.NextFunction)=>{if(!res.headersSent)res.status(400).json({error:err?.message||String(err)})});
const server=app.listen(port,host,()=>console.log(`Video Editor Agent: http://${host}:${port}`));
server.on('error',async e=>{await fs.unlink(lockFile).catch(()=>{});console.error(e);process.exit(1)});
async function shutdown(){shutdownWindowRecordings();await fs.unlink(lockFile).catch(()=>{});server.close();process.exit(0)}process.on('SIGINT',shutdown);process.on('SIGTERM',shutdown);
