import fs from 'node:fs/promises';
import path from 'node:path';
import {generateLocal,collectLocal,type LocalRequest} from '../src/local-generation.js';
import {projectDir,atomicJson} from '../src/core.js';
const id='nano-banana-cartoon-workflow-28043a87';
const tasks:LocalRequest[]=[];
const add=(assetKey:string,source:string,prompt:string)=>tasks.push({assetKey,kind:'image',sourceImage:'assets/local-'+source+'.png',prompt:prompt+' Preserve the exact identity, colors, materials and illustration style from the supplied reference. Clean production reference artwork, no text, letters, logos, captions or labels.'});
const sheet=(subject:string)=>`Create a character reference sheet for ${subject} only. Three equal vertical panels on a neutral plain background: full body front view, full body rear view, large expressive face close-up. Same outfit and proportions in all three views. No scenery or other characters.`;
add('watercolor-fox-sheet','watercolor-village',sheet('the orange fox with the blue scarf'));
add('watercolor-rabbit-sheet','watercolor-village',sheet('the cream rabbit wearing the ochre vest'));
add('watercolor-boat-sheet','watercolor-village','Create a prop reference sheet of the turquoise wooden boat with red gunwale and its two oars only. Three equal vertical panels: side view, front three-quarter view, overhead view. Plain watercolor paper background, no people or animals.');
add('watercolor-empty-village','watercolor-village','Show the same beautiful watercolor canal village and stone bridge as a wide environment establishing image, empty of people, animals and boats. Preserve the architecture and warm painted texture.');
add('rubber-cat-sheet','rubber-hose-magic',sheet('the black and cream rubber-hose cat magician with the bow tie and white gloves'));
add('rubber-rabbit-sheet','rubber-hose-magic',sheet('the cream rubber-hose rabbit'));
add('rubber-hat-sheet','rubber-hose-magic','Create a prop reference sheet of the black magician top hat only, three equal panels with front, three-quarter and overhead views, on warm plain cream. Preserve vintage cartoon ink outlines.');
add('rubber-empty-stage','rubber-hose-magic','Create a wide establishing environment image of this exact vintage theater stage with curtains and wooden platform, no characters and no top hat. Preserve the monochrome cream ink-drawn style.');
add('paper-diver-sheet','paper-underwater',sheet('the layered paper-cutout diver in the yellow diving suit and round helmet'));
add('paper-octopus-sheet','paper-underwater',sheet('the friendly turquoise layered paper octopus with eight arms'));
add('paper-empty-underwater','paper-underwater','Create a wide establishing environment reference of this exact underwater paper-cutout world. Layered blue waves and coral, visible paper fibers and edge shadows. No diver, no animals.');
add('nineties-lizard-sheet','nineties-dialogue',sheet('the enthusiastic orange lizard wearing turquoise overalls'));
add('nineties-frog-sheet','nineties-dialogue',sheet('the large relaxed purple frog wearing the cream short-sleeve collared shirt'));
add('nineties-gadget-sheet','nineties-dialogue','Create a production prop reference sheet showing the exact small blue and purple handheld gadget with the glowing cyan tip, three equal panels: side, front three-quarter, and overhead. Neutral tan background, no characters.');
add('nineties-room-closed','nineties-dialogue','Create a wide empty establishing image of the exact same warm nineties-cartoon workshop seen in the reference, from the same camera position, with its rectangular wooden floor hatch closed in the center foreground. No characters, no gadget. Preserve the cabinets, hanging tools, warm plaster walls and lighting.');
add('nineties-room-open','nineties-room-closed','Create exactly the same room image and camera angle as the supplied reference, changing only the rectangular wooden floor hatch: it is now open, its hinged lid upright and a dark opening visible below. Preserve every other element, cabinet, hanging tool, light and perspective. No characters.');
add('anime-traveler-sheet','anime-bridge',sheet('the black-haired young traveler wearing a red scarf, cream jacket, dark cropped trousers and brown boots'));
add('anime-dragon-sheet','anime-bridge','Create a clean anime creature design sheet of the exact long green dragon in the supplied reference. Three equally sized panels: full creature side view, full creature front three-quarter view, and a close-up of the head. Preserve green scales, gold horns and pale belly, on neutral pale paper. No traveler or bridge.');
add('anime-empty-bridge','anime-bridge','Create a wide environment image of the same dramatic stone bridge leading across the mountain canyon to the distant golden temple. Same anime painted style and warm sky. No traveler and no dragon.');
add('clay-bear-sheet','clay-kite',sheet('the small brown handmade clay bear wearing the blue knitted sweater'));
add('clay-rabbit-sheet','clay-kite',sheet('the cream handmade clay rabbit in green overalls'));
add('clay-kite-sheet','clay-kite','Create a clean handmade clay prop reference sheet of the same red diamond kite with its yellow tail and string. Three equal vertical panels: front, rear showing wooden cross spars, and a three-quarter view. Plain warm gray background, no characters.');
add('clay-empty-hill','clay-kite','Create a wide establishing image of the exact handmade grassy clay hill and small flowers from this scene. Visible miniature texture and soft studio light. No characters, kite or string.');
await atomicJson(path.join(projectDir(id),'Remaining asset requests.json'),tasks);
for(const task of tasks){
  const receipt=path.join(projectDir(id),'generation',task.assetKey+'.json');
  let existing=await fs.readFile(receipt,'utf8').then(s=>JSON.parse(s),()=>undefined);
  if(!existing){
    let waiting=false;
    for(;;){try{await generateLocal(id,task);break}catch(e){if(!/queue is unavailable or busy|active or queued work/.test(String(e)))throw e;if(!waiting){console.log(`${task.assetKey}: waiting for existing GPU1 queue to be idle`);waiting=true}await new Promise(r=>setTimeout(r,30000))}}
  }
  let previous='';
  for(;;){const result=await collectLocal(id,task.assetKey);if('file' in result){console.log(JSON.stringify({assetKey:task.assetKey,...result}));break}if(result.status==='failed'||result.status==='error'||result.status==='cancelled')throw new Error(JSON.stringify(result));if(result.status!==previous){previous=result.status;console.log(JSON.stringify(result))}await new Promise(r=>setTimeout(r,15000))}
}
console.log('All remaining reference assets collected. Visual inspection remains required.');
