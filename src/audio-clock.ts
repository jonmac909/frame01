import fs from 'node:fs/promises';
import type {AudioCue} from './edit-contract.js';

// Bounded-memory mixing of 48 kHz stereo float PCM. Each asset is decoded once;
// hundreds of narration cues do not create hundreds of decoder/delay buffers.
export async function mixAudioCues(cues:AudioCue[],sources:Map<string,string>,destination:string,frames:number){
  const samples=frames*1600,bytesPerSample=8,output=await fs.open(destination,'w+');let peak=0;
  try{await output.truncate(samples*bytesPerSample);
    for(const cue of cues){
      const source=sources.get(cue.asset);if(!source)throw new Error(`Missing decoded audio: ${cue.asset}`);
      if(cue.fromSample<0||cue.trimSample<0||cue.samples<=0||cue.fromSample+cue.samples>samples)throw new Error(`Audio cue ${cue.id} exceeds the master`);
      const input=await fs.open(source,'r');try{
        if((await input.stat()).size<(cue.trimSample+cue.samples)*bytesPerSample)throw new Error(`Decoded audio ends inside ${cue.id}; never silently truncate narration.`);
        for(let offset=0;offset<cue.samples;offset+=8192){const length=Math.min(8192,cue.samples-offset)*bytesPerSample,src=Buffer.alloc(length),dst=Buffer.alloc(length),position=(cue.fromSample+offset)*bytesPerSample;
          const read=await input.read(src,0,length,(cue.trimSample+offset)*bytesPerSample);if(read.bytesRead!==length)throw new Error(`Short audio read in ${cue.id}`);
          const previous=await output.read(dst,0,length,position);if(previous.bytesRead!==length)throw new Error('Short master read');
          for(let i=0;i<length;i+=4){const value=dst.readFloatLE(i)+src.readFloatLE(i)*cue.gain;if(!Number.isFinite(value))throw new Error('Non-finite audio sample');dst.writeFloatLE(value,i);}
          const written=await output.write(dst,0,length,position);if(written.bytesWritten!==length)throw new Error('Short master write');
        }
      }finally{await input.close()}
    }
    // Inspect the completed mix (intermediate cancellation can otherwise misstate peak).
    const chunk=Buffer.alloc(65536);for(let offset=0;offset<samples*bytesPerSample;offset+=chunk.length){const expected=Math.min(chunk.length,samples*bytesPerSample-offset),{bytesRead}=await output.read(chunk,0,expected,offset);if(bytesRead!==expected)throw new Error('Short master verification read');for(let i=0;i<bytesRead;i+=4)peak=Math.max(peak,Math.abs(chunk.readFloatLE(i)));}
    if(peak>=1)throw new Error(`Audio mix clips (peak ${peak.toFixed(4)}). Lower explicit gains; automatic limiting is disabled.`);
    if(peak<.00001)throw new Error('Audio mix is silent');
    await output.sync();return {samples,sampleRate:48000,channels:2,peak,peakDb:20*Math.log10(peak)};
  }finally{await output.close()}
}
