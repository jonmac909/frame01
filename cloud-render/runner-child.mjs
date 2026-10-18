import fs from 'node:fs/promises';
import {renderUnit} from './runner.mjs';
const [root,jobFile,out]=process.argv.slice(2);
try{const result=await renderUnit(root,JSON.parse(await fs.readFile(jobFile,'utf8')),out,p=>process.send?.({progress:p}));process.send?.({result});process.disconnect?.();}catch(e){console.error(e.stack);process.exitCode=1;process.disconnect?.();}
