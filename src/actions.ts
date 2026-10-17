import fs from 'node:fs/promises';
import path from 'node:path';
import {z} from 'zod';
import {readProject,mutate,event,projectDir,safePath,addAsset,validateTimeline} from './core.js';
import {indexCourse,searchCourse} from './knowledge.js';
import {ingestReference,analyzeReference,parseVtt,readReferenceFrames} from './reference.js';
import * as browser from './browser.js';
import {renderProject} from './render.js';
import {bridgeAction} from './chrome-bridge.js';
import {indexLibrary,searchLibrary,importLibrary,gradeAsset} from './library.js';
import {operationSchema,compactProject} from './director-contract.js';
import {preflight,readReference,readScript,saveScriptPlan} from './production.js';
import {alignAroll} from './alignment.js';
import {generateLocal,collectLocal} from './local-generation.js';
import {checkReferenceStyle} from './preflight.js';
import {recordingWindows,prepareRecordingWindow,startWindowRecording,stopWindowRecording,windowRecordingStatus} from './window-recording.js';
export async function action(id:string,name:string,args:any={}){
  args=operationSchema.parse({name,args}).args;
  await readProject(id);
  if(name==='record.windows')return recordingWindows();
  if(name==='record.prepare')return prepareRecordingWindow(args.url);
  if(name==='record.status')return windowRecordingStatus(id);
  if(process.env.EDITOR_TEST_BROWSER!=='1'&&name==='record.start')return startWindowRecording(id,args);
  if(process.env.EDITOR_TEST_BROWSER!=='1'&&name==='record.stop')return stopWindowRecording(id);
  if(process.env.EDITOR_TEST_BROWSER!=='1'&&(name.startsWith('browser.')||['heygen.create_draft','heygen.submit_video','heygen.verify','heygen.download','record.start','record.stop'].includes(name)))return bridgeAction(id,name,args);
  switch(name){
    case 'project.read':return readProject(id);
    case 'project.summary':return compactProject(await readProject(id));
    case 'preflight.check':return preflight(id);
    case 'reference.read':return readReference(id,args.offset,args.limit);
    case 'reference.frames':return readReferenceFrames(id,args.offset,args.limit);
    case 'script.read':return readScript(id,args.section);
    case 'script.plan.save':return saveScriptPlan(id,args);
    case 'aroll.align':return alignAroll(id,args);
    case 'local.generate':return generateLocal(id,args);
    case 'local.collect':return collectLocal(id,args.assetKey);
    case 'library.index':return indexLibrary();
    case 'library.search':return searchLibrary(args.query||'',args.category);
    case 'library.import':return importLibrary(id,z.string().parse(args.assetId));
    case 'asset.grade':return gradeAsset(id,z.string().parse(args.file),z.string().parse(args.lut));
    case 'media.inspect':{
      const file=z.string().parse(args.file);if(!/\.(jpg|png)$/i.test(file))throw new Error('Inspect a project screenshot or extracted frame.');
      const bytes=await fs.readFile(safePath(projectDir(id),file));if(bytes.length>3000000)throw new Error('Image exceeds 3 MB.');
      return {file,imageBase64:bytes.toString('base64'),mediaType:file.endsWith('.png')?'image/png':'image/jpeg'};
    }
    case 'project.save':return mutate(id,p=>{
      if(args.script!==undefined){if(p.heygen.video)throw new Error('The A-roll has already been submitted. Keep its script fixed.');const script=z.string().max(100000).parse(args.script);if(script.split(/\r?\n/).some(l=>/^TITLE:|^\[.*\]$|^SHOT PLAN\b|^Capture\/evidence checklist:/i.test(l.trim())))throw new Error('Keep only spoken narration in Script; move titles, shot plans and bracketed stage directions into the production notes.');p.script=script;delete p.heygen.verified;}
      if(args.notes!==undefined)p.notes=z.string().max(100000).parse(args.notes);
      event(p,'saved','Saved script and production notes.');
    });
    case 'course.index':return indexCourse();
    case 'course.search':return searchCourse(z.string().min(1).parse(args.query));
    case 'reference.ingest':return ingestReference(id);
    case 'reference.analyze':return analyzeReference(id,z.string().parse(args.file));
    case 'asset.import':{
      const source=z.string().parse(args.path);if(!path.isAbsolute(source))throw new Error('Use an absolute local file path.');
      const ext=path.extname(source).toLowerCase();if(!['.mp4','.webm','.mov','.mkv','.wav','.mp3'].includes(ext))throw new Error('Import a video or audio file.');
      const kind=z.enum(['aroll','screen','broll','reference','narration']).parse(args.kind);
      const file=`assets/${Date.now()}-${path.basename(source).replace(/[^a-z0-9_.-]/gi,'_')}`;
      await fs.mkdir(path.join(projectDir(id),'assets'),{recursive:true});await fs.copyFile(source,safePath(projectDir(id),file));return addAsset(id,file,kind);
    }
    case 'captions.import':{
      const file=z.string().parse(args.path);const captions=parseVtt(await fs.readFile(file,'utf8'));if(!captions.length)throw new Error('No timed captions found. Import SRT or VTT.');
      return mutate(id,p=>{if(!p.timeline)throw new Error('Save a timeline first.');checkReferenceStyle({...p.timeline,captions},p.reference);p.timeline.captions=captions;event(p,'captions','Imported timed captions; inspect them against the actual narration.');});
    }
    case 'timeline.save':{const timeline=await validateTimeline(id,args.timeline);return mutate(id,p=>{p.timeline=timeline;event(p,'timeline','Validated source durations and timeline coverage.');});}
    case 'render':return renderProject(id);
    case 'browser.open':return browser.openBrowser(id,z.enum(['heygen','walkthrough']).parse(args.kind),args.url);
    case 'browser.snapshot':return browser.snapshot(id,z.enum(['heygen','walkthrough']).parse(args.kind));
    case 'browser.navigate':return browser.navigate(id,z.enum(['heygen','walkthrough']).parse(args.kind),z.string().url().parse(args.url));
    case 'browser.act':return browser.act(id,z.enum(['heygen','walkthrough']).parse(args.kind),z.enum(['click','fill','press','scroll']).parse(args.action),args.ref,args.value);
    case 'heygen.create_draft':return browser.oneHeyGenClick(id,'draft',z.string().parse(args.ref));
    case 'heygen.submit_video':return browser.oneHeyGenClick(id,'video',z.string().parse(args.ref));
    case 'heygen.link':return browser.reconcileHeyGen(id,z.enum(['draft','video']).parse(args.kind),z.string().url().parse(args.url));
    case 'heygen.verify':return browser.verifyHeyGen(id);
    case 'heygen.download':return browser.downloadHeyGen(id,z.string().parse(args.ref));
    case 'record.start':return browser.startRecording(id);
    case 'record.stop':return browser.stopRecording(id);
    default:throw new Error(`Unknown action: ${name}`);
  }
}
