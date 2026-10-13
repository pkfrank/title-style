// Explicit opt-in: creates and archives a disposable workspace and one Haiku agent.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {createPaseoClient} from '@getpaseo/client';
import {DaemonClient} from '@getpaseo/client/internal/daemon-client';
const url='ws://127.0.0.1:6767/ws';const api=createPaseoClient({url});const rpc=new DaemonClient({url,clientId:'tiger-titles-live-smoke'});
const dir=await mkdtemp(path.join(tmpdir(),'tiger-titles-smoke-'));let workspace;
try{
 await Promise.all([api.connect(),rpc.connect()]);
 workspace=await api.workspaces.create({source:{kind:'directory',path:dir}});
 const agent=await workspace.agents.create({config:{provider:'claude/claude-haiku-4-5',modeId:'plan'},title:'Test sample registration form',prompt:'For a naming integration test, the objective is to test a sample registration form. Reply exactly OK. Do not use any tools or change any files.'});
 await agent.waitForFinish(30_000);
 const row=async()=>{const list=await rpc.invokePluginRpc('tiger-titles','titles.list',{});return list.rows.find(x=>x.id===workspace.id);};
 let state;
 for(let i=0;i<35;i++){state=await row();if(state.history.length||state.error)break;await new Promise(r=>setTimeout(r,1000));}
 console.log(JSON.stringify({phase:'automatic',managed:state.managed,title:state.name,error:state.error,history:state.history.length}));
 assert(state.managed,'New workspace should be automatically enrolled');
 assert(state.history.length>0,'Automatic rename should complete');
 await rpc.invokePluginRpc('tiger-titles','titles.change',{workspaceId:workspace.id,revision:state.revision,action:'undo'});
 state=await row();assert(state.locked);assert.equal(state.history[0].kind,'undo');
 console.log('Live automatic naming and undo passed.');
 // A stale revision must return an error through the actual plugin RPC.
 await assert.rejects(rpc.invokePluginRpc('tiger-titles','titles.change',{workspaceId:workspace.id,revision:-1,action:'apply'}));
 console.log('Live stale-preview rejection passed.');
}finally{if(workspace)await workspace.archive();await Promise.all([api.close(),rpc.close()]);await rm(dir,{recursive:true,force:true});}
