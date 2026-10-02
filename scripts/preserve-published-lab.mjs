// Main releases retain the exact Lab directory from the last actual Pages publish.
// A later Dreamloop failure does not undo a successful deploy-pages step.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,existsSync,cpSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function publishedRun(runs,jobsForRun,skipId){
 for(const run of runs){
  if(String(run.id)===String(skipId))continue;
  const jobs=jobsForRun(run.id);
  if(jobs.some(job=>job.steps?.some(step=>step.name==='Run actions/deploy-pages@v4'&&step.conclusion==='success')))return run.id;
 }
 throw Error('No prior published Pages run found; refusing to overwrite the existing Lab.');
}
export function preserveLab(repository,destination,skipId){
 if(!/^[\w.-]+\/[\w.-]+$/.test(repository||''))throw Error('GITHUB_REPOSITORY is required');
 const api=path=>JSON.parse(execFileSync('gh',['api',path],{encoding:'utf8'}));
 const runs=api(`repos/${repository}/actions/workflows/deploy.yml/runs?status=completed&per_page=20`).workflow_runs;
 const id=publishedRun(runs,id=>api(`repos/${repository}/actions/runs/${id}/jobs?per_page=100`).jobs,skipId);
 const work=mkdtempSync(join(tmpdir(),'seeker-published-lab-'));
 try{
  execFileSync('gh',['run','download',String(id),'--repo',repository,'--name','github-pages','--dir',join(work,'download')],{stdio:'inherit'});
  execFileSync('mkdir',['-p',join(work,'site')]);
  execFileSync('tar',['-xf',join(work,'download','artifact.tar'),'-C',join(work,'site')]);
  const lab=join(work,'site','lab'),meta=JSON.parse(readFileSync(join(lab,'lab-source.json'),'utf8'));
  if(!/^[a-f0-9]{40}$/.test(meta.sha)||!existsSync(join(lab,'index.html')))throw Error('Prior Lab is incomplete');
  if(existsSync(destination))throw Error('Lab destination already exists');
  cpSync(lab,destination,{recursive:true});return {publishedRun:id,preview:meta};
 }finally{rmSync(work,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 console.log(JSON.stringify(preserveLab(process.env.GITHUB_REPOSITORY,resolve(process.argv[2]||'lab-out'),process.env.GITHUB_RUN_ID)));
}
