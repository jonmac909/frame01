import fs from 'node:fs/promises';
import {feedback,feedbackCollectionBatches} from '../src/feedback.js';
const [command,id,input]=process.argv.slice(2);
if(command==='reviews')console.log(JSON.stringify(await feedback.reviews(),null,2));
else if(command==='context')console.log(JSON.stringify(await feedback.context(id),null,2));
else if(command==='import')console.log(JSON.stringify(await feedback.import(id,JSON.parse(await fs.readFile(input,'utf8')))));
else if(command==='collect'){const batches=feedbackCollectionBatches(JSON.parse(await fs.readFile(input,'utf8')));const results=[];for(const batch of batches)results.push({version:batch.version,...await feedback.import(id,batch)});console.log(JSON.stringify(results));}
else if(command==='verify')console.log(JSON.stringify(await feedback.verify(id,JSON.parse(await fs.readFile(input,'utf8')))));
else throw new Error('Usage: tsx scripts/feedback.ts reviews | context PROJECT | import PROJECT BATCH.json | collect PROJECT SNAPSHOT.json | verify PROJECT REQUEST.json');
