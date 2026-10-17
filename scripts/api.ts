import fs from 'node:fs/promises';
const [id,name,json='{}']=process.argv.slice(2);const token=await fs.readFile('data/runtime-token','utf8');
const r=await fetch(`http://127.0.0.1:4317/api/projects/${id}/action`,{method:'POST',headers:{'Content-Type':'application/json','X-Editor-Token':token},body:JSON.stringify({name,args:JSON.parse(json)})});const data:any=await r.json();
if(!r.ok){console.error(data.error);process.exitCode=1}else console.log(JSON.stringify(data,null,2));
