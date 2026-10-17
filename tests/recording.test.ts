import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {run,FFMPEG} from '../src/core.js';
import {normalizeRecording} from '../src/recording.js';
test('Chrome millisecond-timebase capture becomes bounded 1080p 30 fps media',async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'frame01-recording-'));
  try{
    const raw=path.join(dir,'capture.webm'),out=path.join(dir,'capture.mp4');
    await run(FFMPEG,['-y','-f','lavfi','-i','testsrc2=size=320x180:rate=12','-t','1.5','-c:v','libvpx-vp9','-threads','2','-deadline','realtime',raw]);
    const info=await normalizeRecording(raw,out),video=info.streams.find((s:any)=>s.codec_type==='video');
    assert.equal(video.avg_frame_rate,'30/1');assert.equal(Number(video.nb_frames),45);
    assert.ok(Math.abs(info.duration-1.5)<.04);assert.equal(video.width,1920);assert.equal(video.height,1080);
    const bounded=await normalizeRecording(raw,path.join(dir,'bounded.mp4'),{trimStart:.2,maxDuration:.6,withoutAudio:true});
    assert.equal(bounded.streams.find((s:any)=>s.codec_type==='video').nb_frames,'18');assert.ok(Math.abs(bounded.duration-.6)<.001);
  }finally{for(const file of ['capture.webm','capture.mp4','bounded.mp4'])await fs.unlink(path.join(dir,file)).catch(()=>{});await fs.rmdir(dir)}
});
