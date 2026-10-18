// Shared CLI for Frame projects and existing Frontier job directories. No server or new project required.
import path from 'node:path';
import {createEvidenceStore,projectEvidence,evidenceIndexSchema,evidenceSearchSchema,evidenceFramesSchema,evidenceInspectSchema,evidenceBurstSchema} from '../src/evidence.js';
const [mode,location,operation,json='{}']=process.argv.slice(2);
if(!['--project','--workspace'].includes(mode)||!location)throw new Error('Usage: node --import tsx scripts/evidence.ts --project ID | --workspace ABSOLUTE_ROOT index|list|search|frames|inspect|burst JSON');
if(mode==='--workspace'&&!path.isAbsolute(location))throw new Error('Workspace must be an explicit absolute directory.');
const {store,fallback}=mode==='--project'?await projectEvidence(location):{store:createEvidenceStore(location),fallback:undefined};
const args=JSON.parse(json);
if(operation==='search'&&args.scope==='library')throw new Error('Cross-project search uses the editor evidence.search API with scope:library; this CLI searches only its explicit project/workspace.');
const result=operation==='index'?await store.index(evidenceIndexSchema.parse(args),fallback):operation==='list'?await store.list():operation==='search'?await store.search(evidenceSearchSchema.parse(args)):operation==='frames'?await store.frames(evidenceFramesSchema.parse(args)):operation==='inspect'?await store.inspect(evidenceInspectSchema.parse(args)):operation==='burst'?await store.inspect(evidenceBurstSchema.parse(args),true):(()=>{throw new Error('Unknown evidence operation')})();
console.log(JSON.stringify(result));
