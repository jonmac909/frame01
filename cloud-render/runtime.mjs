import fs from 'node:fs/promises';
import {digest} from './protocol.mjs';

// Normalize checkout line endings, but bind every executable renderer input.
export async function runtimeHash() {
  const files=['runtime.mjs','protocol.mjs','local-files.mjs','runner.mjs','runner-child.mjs','container.mjs','package.json','package-lock.json','Dockerfile'];
  const inputs={};
  for(const file of files)inputs[file]=(await fs.readFile(new URL(file,import.meta.url),'utf8')).replaceAll('\r\n','\n');
  return digest(inputs);
}
