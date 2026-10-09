// Diagnostic names retain pending promises even when the construction queue is
// empty (a yielded import/compile promise is no longer a runnable queue job).
export function trackStartupReadiness(dependencies, status, now=()=>performance.now()) {
  return Promise.all(Object.entries(dependencies).map(([name,promise])=>{
    const started=now(),entry=status[name]={state:'pending',startedMs:started};
    return Promise.resolve(promise).then(value=>{
      entry.state='ready';entry.elapsedMs=now()-started;return value;
    },error=>{
      entry.state='failed';entry.elapsedMs=now()-started;entry.error=error?.message??String(error);throw error;
    });
  }));
}
