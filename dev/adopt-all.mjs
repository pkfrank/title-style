// Adopt every unmanaged, unlocked workspace on the local daemon: preview, then apply.
// Applying enrolls the workspace in automatic naming. Uses one Haiku call per workspace.
// Usage: node dev/adopt-all.mjs [--dry-run]
import {DaemonClient} from '@getpaseo/client/internal/daemon-client';
const dry=process.argv.includes('--dry-run');
const rpc=new DaemonClient({url:'ws://127.0.0.1:6767/ws',clientId:'tiger-titles-adopt-all'});
const call=(name,input)=>rpc.invokePluginRpc('tiger-titles',name,input);
const rows=async()=>(await call('titles.list',{})).rows;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
await rpc.connect();
try{
 const todo=(await rows()).filter(r=>!r.managed&&!r.locked);
 console.log(`${todo.length} workspace(s) to adopt`);
 for(const t of todo){
  if(dry){console.log(`would adopt: ${t.name}`);continue;}
  try{
   await call('titles.change',{workspaceId:t.id,revision:t.revision,action:'preview'});
   let r;
   for(let i=0;i<40;i++){await sleep(1500);r=(await rows()).find(x=>x.id===t.id);if(!r||r.error||(r.proposal&&!r.busy))break;}
   if(!r){console.log(`gone: ${t.name}`);continue;}
   if(r.error||!r.proposal){console.log(`skip: ${t.name}: ${r.error??'no proposal'}`);continue;}
   await call('titles.change',{workspaceId:r.id,revision:r.revision,action:'apply'});
   console.log(`${t.name} -> ${r.proposal}`);
  }catch(e){console.log(`fail: ${t.name}: ${e.message}`);}
 }
}finally{await rpc.close();}
