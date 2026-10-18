import fs from 'node:fs/promises';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {selectComposition,renderMedia} from '@remotion/renderer';
import {ROOT,projectDir,readProject,validateTimeline,mutate,event,probe,serial,atomicJson,run,FFMPEG,safePath,type Timeline} from './core.js';
import {checkExport,checkRuntime} from './preflight.js';
import {readProductionContract,validateProductionContract,prepareContractAudio} from './production-contract.js';
import {hashFile} from './render-cache.js';
let bundled:Promise<string>|undefined;
export async function renderProps(id:string,timeline:Timeline){
  // Font fetches enforce CORS even when ordinary media loads. Embed the validated
  // local font for rendering instead of broadening the editor's origin permissions.
  const fontDataUrl=timeline.font?`data:font/${path.extname(timeline.font).slice(1)};base64,${(await fs.readFile(safePath(projectDir(id),timeline.font))).toString('base64')}`:undefined;
  return {timeline,baseUrl:`http://127.0.0.1:${process.env.PORT||4317}/media/${id}`,fontDataUrl};
}
export async function renderProject(id:string){
  return serial('render:'+id,async()=>{
    const p=await readProject(id);const timeline=await validateTimeline(id,p.timeline);
    const checked=p.contractVersion===1?await validateProductionContract(id,await readProductionContract(id),{requireComplete:true,measure:true}):undefined;
    if(checked&&checked.contract.planFile!=='timeline.json')throw new Error('This contract uses a full section plan; use the section renderer and contract assembler.');
    const stem=checked?await prepareContractAudio(id,checked):undefined;
    if(p.heygen.video&&p.heygen.verified?.voiceSpeed!==(p.voiceSpeed??1)&&!(p.heygen.acceptedTestVoiceSpeed!==undefined&&p.heygen.acceptedTestVoiceSpeed===p.heygen.verified?.voiceSpeed))throw new Error('The submitted A-roll has the wrong or unverified voice speed. Resolve it before exporting. Do not create another HeyGen video automatically.');
    await mutate(id,p=>event(p,'render-started','Rendering the saved timeline to H.264 at 1920 × 1080, 30 fps.'));
    bundled??=bundle({entryPoint:path.join(ROOT,'video','index.tsx'),outDir:path.join(ROOT,'.render-bundle')}).catch(e=>{bundled=undefined;throw e});
    const serveUrl=await bundled;const inputProps={...await renderProps(id,timeline),effects:checked?.compiled.effects??[]};
    const browserExecutable=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    const composition=await selectComposition({serveUrl,id:'CourseEditor',inputProps,browserExecutable});
    const file=`exports/edit-${Date.now()}.mp4`;const destination=path.join(projectDir(id),file);await fs.mkdir(path.dirname(destination),{recursive:true});
    const picture=stem?destination+'.picture.mp4':destination;
    await renderMedia({serveUrl,composition,inputProps,codec:'h264',outputLocation:picture,browserExecutable,concurrency:2,crf:18,pixelFormat:'yuv420p',muted:Boolean(stem),chromiumOptions:{gl:'swangle'}});
    if(stem)await run(FFMPEG,['-v','error','-y','-i',picture,'-i',safePath(projectDir(id),stem),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-movflags','+faststart',destination],{timeout:1800000});
    const info=await probe(destination);const expected=composition.durationInFrames/30;
    if(p.reference?.duration&&!timeline.runtime)checkRuntime(expected,Number(p.reference.duration));
    const levels=info.audio?await run(FFMPEG,['-i',destination,'-vn','-af','volumedetect','-f','null','-'],{timeout:300000}):'';
    checkExport(info,expected,Number(levels.match(/max_volume: ([-\d.]+) dB/)?.[1]??NaN));
    const proof={file,duration:info.duration,expectedDuration:expected,hasAudio:info.audio,maxVolumeDb:levels.match(/max_volume: ([-\d.]+) dB/)?.[1]||null,meanVolumeDb:levels.match(/mean_volume: ([-\d.]+) dB/)?.[1]||null,width:info.streams.find((s:any)=>s.codec_type==='video')?.width,height:info.streams.find((s:any)=>s.codec_type==='video')?.height,verifiedAt:new Date().toISOString(),timeline};
    if(checked)await validateProductionContract(id,checked.contract,{requireComplete:true});
    await atomicJson(destination+'.proof.json',{...proof,sha256:await hashFile(destination),contractSha256:checked?.contractSha256??null,audioStem:stem??null,qa:'Technical validation only; rendered 4 FPS visual review and listening are required.'});
    return mutate(id,p=>{p.render={file,at:new Date().toISOString(),duration:info.duration};event(p,'render-complete',`Verified ${file}: ${info.duration.toFixed(2)}s, ${proof.width} × ${proof.height}, audio ${info.audio?'present':'absent'}.`)});
  });
}
