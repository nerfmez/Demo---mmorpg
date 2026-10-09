// Simulation can advance before imported assets hide the loading card. UI input
// must wait for the actual presentation gate, not click through that card.
export async function waitForGameUi(page,{timeout=60000}={}){
 try{await page.waitForFunction(()=>window.__frontier?.modelsReady&&__frontier.game?.time>.2&&document.querySelector('#loading')?.classList.contains('done'),null,{timeout});}
 catch(error){
  const state=await page.evaluate(()=>{const f=window.__frontier,v=f?.view;return {modelsReady:!!f?.modelsReady,time:f?.game?.time,loading:document.querySelector('#loading')?.textContent,loadingDone:document.querySelector('#loading')?.classList.contains('done'),staticReady:v?.region?.staticReady,importedState:v?.region?.importedState,regionError:v?.region?.error?.message,queue:v?.buildQueue.jobs.map(j=>({label:j.label,state:j.state,steps:j.stats.steps})),queueStats:v?.buildQueue.stats,contextLost:v?.renderer.getContext().isContextLost()};}).catch(e=>({diagnosticError:e.message}));
  console.error('Game UI readiness failed',JSON.stringify(state));throw error;
 }
}
