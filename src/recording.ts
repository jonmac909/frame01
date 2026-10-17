import {run,FFMPEG,probe} from './core.js';

export async function normalizeRecording(source:string,destination:string,options:{trimStart?:number;withoutAudio?:boolean;maxDuration?:number}={}){
  // Chrome tabCapture uses variable timestamps (often a 1/1000 time base).
  // Explicitly sample 30 fps; allowing the MP4 muxer to infer it duplicates
  // every held frame up to 1000 fps and produces enormous recordings.
  if(options.maxDuration!==undefined&&(!Number.isFinite(options.maxDuration)||options.maxDuration<=0))throw new Error('Recording duration limit must be positive.');
  await run(FFMPEG,['-y',...(options.trimStart?['-ss',String(options.trimStart)]:[]),'-i',source,...(options.withoutAudio?['-an']:[]),...(options.maxDuration!==undefined?['-t',String(options.maxDuration)]:[]),'-vf','setpts=PTS-STARTPTS,fps=30,scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2','-c:v','libx264','-threads','2','-preset','fast','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',destination],{timeout:1800000});
  const info=await probe(destination),video=info.streams.find((s:any)=>s.codec_type==='video');
  if(!video||video.width!==1920||video.height!==1080||video.avg_frame_rate!=='30/1'||info.duration<=0)throw new Error('Recording conversion did not produce valid 1080p 30 fps media. Keep the raw capture for recovery.');
  if(options.maxDuration!==undefined&&info.duration>options.maxDuration+1/30)throw new Error('Recording exceeded its duration limit. Keep the raw capture for recovery.');
  return info;
}
