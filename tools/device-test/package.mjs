// Package two already-built, identically instrumented sources. Does not alter repository runtime.
import {readFileSync,writeFileSync,cpSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {resolve,dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {SHAS} from './ui.mjs';
const [a,b,o]=process.argv.slice(2);
if(!a||!b||!o)throw Error('Usage: package.mjs BASELINE_PROFILE_DIR CANDIDATE_PROFILE_DIR NEW_OUTPUT');
const dirs={baseline:resolve(a),candidate:resolve(b)},out=resolve(o),here=dirname(fileURLToPath(import.meta.url));
if(existsSync(out))throw Error('Refusing to overwrite an output directory');
const sha=data=>createHash('sha256').update(data).digest('hex');
const manifests=Object.fromEntries(Object.entries(dirs).map(([k,d])=>[k,JSON.parse(readFileSync(join(d,'profile-source.json')))]));
for(const k of Object.keys(SHAS))assert.equal(manifests[k].source,SHAS[k]);
for(const field of ['overlaySha256','recorderSha256'])assert.equal(manifests.baseline[field],manifests.candidate[field]);
assert.equal(manifests.baseline.overlaySha256,'a15bb578723c1e5246abf73a83d9fa534ef3099c49a4061f283e0a68a226bae1');
assert.equal(manifests.baseline.recorderSha256,sha(readFileSync(join(here,'../perf/recorder.mjs'))));
assert.equal(readFileSync(join(dirs.baseline,'package-lock.json'),'utf8'),readFileSync(join(dirs.candidate,'package-lock.json'),'utf8'));
mkdirSync(out,{recursive:true});
const kit={schema:1,sources:SHAS,wrapperCommit:process.env.GITHUB_SHA||null,buildRun:process.env.GITHUB_RUN_ID||null,createdAt:new Date().toISOString(),overlaySha256:manifests.baseline.overlaySha256,recorderSha256:manifests.baseline.recorderSha256,uiSha256:sha(readFileSync(join(here,'ui.mjs'))),mode:'manual-device-test',diagnostic:'B3-D1',normalGameDeployed:false,defaults:{seed:4,quality:'medium',dynres:0,streamBudget:6},runtimeVerified:false};
for(const [k,d] of Object.entries(dirs)){
 assert.deepEqual(JSON.parse(readFileSync(join(d,'dist/profile-source.json'))),manifests[k]);
 cpSync(join(d,'dist'),join(out,k),{recursive:true});
 const path=join(out,k,'index.html'),html=readFileSync(path,'utf8');
 assert.equal(html.split('</head>').length,2);
 writeFileSync(path,html.replace('</head>','<meta name="robots" content="noindex,nofollow"><script type="module" src="../ui.mjs"></script></head>'));
}
for(const f of ['ui.mjs','index.html','serve.py'])cpSync(join(here,f),join(out,f));
writeFileSync(join(out,'kit.json'),JSON.stringify(kit,null,2));
writeFileSync(join(out,'START-PC.bat'),'@echo off\r\ncd /d "%~dp0"\r\npy -3 serve.py\r\npause\r\n');
writeFileSync(join(out,'README.txt'),'PR80 hardware test: run python3 serve.py (Windows: py -3 serve.py), then open http://127.0.0.1:8765/.\nFor iPad use python3 serve.py --lan on a PC and open its LAN URL in trusted Wi-Fi.\nWithout a PC, use separately authorized static hosting on an origin different from the main game. ZIP/file:// is not playable on iPad.\nThis bundle has not been published and is not a verified hardware benchmark. No runtime result is invented.\nThe launcher describes the AB/BA/AB manual protocol. Save JSON before starting the next round.\n');
const hashes=[];
function walk(p){for(const e of readdirSync(p,{withFileTypes:true})){const f=join(p,e.name);if(e.isDirectory())walk(f);else if(e.isFile())hashes.push(`${sha(readFileSync(f))}  ${relative(out,f).split('\\').join('/')}`);else throw Error('Unexpected non-regular entry');}}
walk(out);writeFileSync(join(out,'SHA256SUMS.txt'),hashes.sort().join('\n')+'\n');
console.log(JSON.stringify({out,files:hashes.length,sources:SHAS,uiSha256:kit.uiSha256,runtimeVerified:false}));
