import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {bundle} from '@remotion/bundler';
import {selectComposition,renderStill} from '@remotion/renderer';
import {ROOT,atomicJson,run,FFMPEG} from '../src/core.js';
import {sourceDependencies,hashFile,digest} from '../src/render-cache.js';
const output=path.join(ROOT,'test-results','effects-regression');await fs.mkdir(output,{recursive:true});
const dependencies=await sourceDependencies(ROOT,'video/effects-fixture.tsx'),inspectExisting=process.argv.includes('--inspect-existing');
const prior=inspectExisting?JSON.parse(await fs.readFile(path.join(output,'proof.json'),'utf8')):undefined;
if(prior)assert.equal(digest(prior.dependencies),digest(dependencies),'Existing fixture inputs changed; render fresh frames');
const serveUrl=inspectExisting?undefined:await bundle({entryPoint:path.join(ROOT,'video/effects-fixture.tsx'),outDir:path.join(output,'bundle')});
const browserExecutable=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const composition=serveUrl?await selectComposition({serveUrl,id:'EffectRegression',browserExecutable}):undefined;
const frames=[];for(const frame of [0,15,29,30,45,59]){const file=path.join(output,`frame-${frame}.png`);if(serveUrl&&composition)await renderStill({serveUrl,composition,browserExecutable,frame,output:file,imageFormat:'png',chromiumOptions:{gl:'swangle'}});const sha256=await hashFile(file);if(prior)assert.equal(sha256,prior.frames.find((f:{frame:number})=>f.frame===frame)?.sha256,'Existing fixture pixels changed');frames.push({frame,file,sha256})}
if(new Set(frames.map(f=>f.sha256)).size<4)throw new Error('Effect fixture did not change across its required keyframes');
// Count actual rendered pixels, not implementation state or labels. Regions do not overlap.
const regions={sweep:[90,100,680,440],connector:[950,195,1750,250],word:[300,450,1620,650],cta:[400,780,1520,1000]} as const;
const pixels:Record<number,Record<keyof typeof regions,number>>={};
for(const frame of frames){const raw=path.join(output,`frame-${frame.frame}.rgb`);await run(FFMPEG,['-v','error','-y','-i',frame.file,'-frames:v','1','-pix_fmt','rgb24','-f','rawvideo',raw]);const data=await fs.readFile(raw);assert.equal(data.length,1920*1080*3,'Decoded fixture dimensions changed');const counts={} as Record<keyof typeof regions,number>;
  for(const name of Object.keys(regions) as (keyof typeof regions)[]){const [left,top,right,bottom]=regions[name];let count=0;for(let y=top;y<bottom;y++)for(let x=left;x<right;x++){const i=(y*1920+x)*3;if(Math.max(Math.abs(data[i]-16),Math.abs(data[i+1]-37),Math.abs(data[i+2]-54))>8)count++}counts[name]=count}pixels[frame.frame]=counts;await fs.unlink(raw);
}
assert.ok(Object.values(pixels[0]).every(n=>n===0),'Effects appear before their entry');
assert.ok(pixels[15].sweep>10000&&pixels[29].sweep===0,'Card sweep is absent, stuck or ends late');
assert.ok(pixels[15].connector>1000&&pixels[30].connector>pixels[15].connector,'Connector does not visibly grow');
assert.ok(pixels[29].word===0&&pixels[30].word>1000,'Word reveal misses its measured frame-30 onset');
assert.ok(pixels[15].cta>10000&&pixels[15].cta===pixels[59].cta,'CTA does not enter and hold');
assert.equal(pixels[30].word,pixels[59].word,'Word does not hold through the fixture ending');
await atomicJson(path.join(output,'proof.json'),{fps:30,frames,dependencies,pixels,checks:['entry','sweep-movement-and-exit','connector-growth','word-onset','cta-entry-and-hold','word-hold'],qa:'Rendered-pixel motion regression. These synthetic fixtures do not establish owner approval or source-style similarity.'});console.log(JSON.stringify({output,frames:frames.length,pixelChecks:6}));
