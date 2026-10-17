import {reserveHeyGen} from '../src/core.js';
import {reconcileReplacement,markReplacementSubmit} from '../src/heygen-replacement.js';
const [id,action,arg]=process.argv.slice(2);
if(action==='reserve')console.log(JSON.stringify(await reserveHeyGen(id,'replacement-video')));
else if(action==='submit-intent')console.log(JSON.stringify(await markReplacementSubmit(id)));
else if(action==='reconcile')console.log(JSON.stringify(await reconcileReplacement(id,JSON.parse(arg))));
else throw new Error('Use reserve or reconcile. This command never clicks HeyGen or retries generation.');
