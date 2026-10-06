// Packaging only. Uses unchanged B3-D1 recorder and exact A/B runtime snapshots.
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,writeFileSync,cpSync,existsSync,rmSync,readdirSync} from 'node:fs';
import {resolve,join,dirname,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const [webArg,offlineArg]=process.argv.slice(2);
if(!webArg||!offlineArg)throw Error('Usage: build-b3-package.mjs NEW_WEB_OUTPUT NEW_OFFLINE_OUTPUT');
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..'),web=resolve(webArg),offline=resolve(offlineArg);
const diagnostic='97cfaf42a5a9607abccab1872403b2303a9d27d6';
const sources={baseline:'1c6d2269d40f5e0524de13c6c5c5b1e2e4e56c0c',candidate:'08bf5cbb4bcd7b93f1b466ee88db79f1b347ee24'};
const text=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',timeout:60000}).trim();
const sha=text(['rev-parse','HEAD']),hash=b=>createHash('sha256').update(b).digest('hex');
const run=(cmd,args,cwd=root)=>execFileSync(cmd,args,{cwd,stdio:'inherit',timeout:600000,env:{...process.env,GIT_TERMINAL_PROMPT:'0',GITHUB_SHA:sha}});
assert(!existsSync(web)&&!existsSync(offline),'Do not overwrite previous outputs');
run('git',['diff','--exit-code',diagnostic,'HEAD','--','src','data','public','package.json','package-lock.json','vite.config.js','tools/perf','tools/device-test/ui.mjs','tools/device-test/index.html']);
assert.equal(hash(readFileSync(join(root,'tools/perf/recorder.mjs'))),'d1f2b1bfb515489af7a916d0890418641f0fabca24a9eed3e0803a07076d0ecd');
const lab=mkdtempSync(join(tmpdir(),'b3-offline-package-'));
try {
 for(const [variant,source]of Object.entries(sources)){
  const d=join(lab,variant);
  run('node',['tools/perf/prepare.mjs',source,d]);
  run('npm',['ci'],d);
  run('npm',['run','build','--','--mode','profile','--sourcemap'],d);
 }
 run('node',['tools/device-test/package.mjs',join(lab,'baseline'),join(lab,'candidate'),web,offline]);
 const manifest=JSON.parse(readFileSync(join(web,'stack-manifest.json')));
 for(const p of manifest.pairs){assert.equal(hash(readFileSync(join(web,p.javascript))),p.javascriptSha256);assert.equal(hash(readFileSync(join(offline,p.sourceMap))),p.sourceMapSha256);}
 for(const name of ['package.mjs','build-b3-package.mjs'])cpSync(join(root,'tools/device-test',name),join(offline,name));
 const receipt={schema:1,diagnostic:'B3-D1',packaging:'offline-symbols-v1',packagingCommit:sha,diagnosticCommit:diagnostic,sources,
  node:process.version,packageLockSha256:hash(readFileSync(join(root,'package-lock.json'))),
  buildCommand:'npm run build -- --mode profile --sourcemap',normalRuntimeUnmodified:true,
  sourceMapsPublished:false,pairs:manifest.pairs.length,stackManifestSha256:hash(readFileSync(join(web,'stack-manifest.json')))};
 writeFileSync(join(offline,'build-receipt.json'),JSON.stringify(receipt,null,2));
 const lines=[];function walk(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const f=join(dir,e.name);if(e.isDirectory())walk(f);else{assert(e.isFile());lines.push(hash(readFileSync(f))+'  '+relative(offline,f).split('\\').join('/'));}}}walk(offline);
 writeFileSync(join(offline,'SHA256SUMS.txt'),lines.sort().join('\n')+'\n');
 console.log(JSON.stringify({builds:'passed',...receipt}));
}finally{rmSync(lab,{recursive:true,force:true});}
