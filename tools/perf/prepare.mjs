#!/usr/bin/env node
// Usage: node tools/perf/prepare.mjs <EXACT_SOURCE_SHA> <NEW_OUTPUT_DIRECTORY>
// No writes to the working repository, no network, no workflow/permission changes.
import {execFileSync,spawnSync} from 'node:child_process';
import {existsSync,mkdirSync,readFileSync,writeFileSync,copyFileSync,rmSync,realpathSync} from 'node:fs';
import {resolve,dirname,relative,join,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {instrument,TARGETS} from './overlay.mjs';
const [sha,argument] = process.argv.slice(2);
if(!/^[a-f0-9]{40}$/.test(sha||'') || !argument) throw Error('Supply exact 40-character source SHA and a new output directory.');
const root=execFileSync('git',['rev-parse','--show-toplevel'],{encoding:'utf8'}).trim();
const out=resolve(argument);
// A real parent path prevents a symlinked destination from pointing back into the repo.
let parent=dirname(out);while(!existsSync(parent))parent=dirname(parent);
const actualParent=realpathSync(parent);
const inside=(base,path)=>{const r=relative(base,path);return r===''||(r!=='..'&&!r.startsWith('..'+sep));};
if(inside(root,actualParent))throw Error('Output parent resolves inside repository.');
if(inside(root,out)) throw Error('Output must be outside the repository.');
if(existsSync(out)) throw Error('Output already exists; refusing overwrite.');
execFileSync('git',['cat-file','-e',sha+'^{commit}'],{cwd:root});
mkdirSync(out,{recursive:true});
let ok=false;
try {
  const tar=execFileSync('git',['archive','--format=tar',sha],{cwd:root,maxBuffer:1024*1024*1024});
  const unpack=spawnSync('tar',['-xf','-','-C',out],{input:tar,encoding:'utf8'});
  if(unpack.status!==0) throw Error(unpack.stderr||'git archive extraction failed');
  const hashes={};
  for(const file of TARGETS){
    const path=join(out,file),source=readFileSync(path,'utf8'),result=instrument(file,source);
    hashes[file]={originalSha256:createHash('sha256').update(source).digest('hex'),
      profiledSha256:createHash('sha256').update(result).digest('hex')};
    writeFileSync(path,result);
  }
  const here=dirname(fileURLToPath(import.meta.url));
  const helper=readFileSync(join(here,'recorder.mjs'));
  copyFileSync(join(here,'recorder.mjs'),join(out,'src/render/__stream-profile.mjs'));
  const manifest={schema:1,source:sha,tree:execFileSync('git',['rev-parse',sha+'^{tree}'],{cwd:root,encoding:'utf8'}).trim(),
    overlaySha256:createHash('sha256').update(readFileSync(join(here,'overlay.mjs'))).digest('hex'),
    recorderSha256:createHash('sha256').update(helper).digest('hex'),files:hashes,normalRepositoryUnmodified:true};
  mkdirSync(join(out,'public'),{recursive:true});
  writeFileSync(join(out,'public/profile-source.json'),JSON.stringify(manifest,null,2));
  writeFileSync(join(out,'profile-source.json'),JSON.stringify(manifest,null,2));
  // A source archive is intentionally not a git working tree; source identity is the manifest.
  ok=true;console.log(JSON.stringify({out:realpathSync(out),source:sha,files:TARGETS.length},null,2));
} finally {if(!ok)rmSync(out,{recursive:true,force:true});}
