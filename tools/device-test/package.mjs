// Package two already-built, identically instrumented sources. Does not alter repository runtime.
import {readFileSync,writeFileSync,cpSync,mkdirSync,existsSync,readdirSync} from 'node:fs';
import {resolve,dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {SourceMap} from 'node:module';
import assert from 'node:assert/strict';
import {SHAS} from './ui.mjs';
const [a,b,o,offlineArg]=process.argv.slice(2);
if(!a||!b||!o||!offlineArg)throw Error('Usage: package.mjs BASELINE_PROFILE_DIR CANDIDATE_PROFILE_DIR NEW_WEB_OUTPUT NEW_OFFLINE_SYMBOLS');
const dirs={baseline:resolve(a),candidate:resolve(b)},out=resolve(o),here=dirname(fileURLToPath(import.meta.url));
const offline=resolve(offlineArg);
if(existsSync(out)||existsSync(offline))throw Error('Refusing to overwrite an output directory');
assert(offline!==out&&!offline.startsWith(out+'/')&&!out.startsWith(offline+'/'),'Web and offline roots must be separate');
const sha=data=>createHash('sha256').update(data).digest('hex');
const manifests=Object.fromEntries(Object.entries(dirs).map(([k,d])=>[k,JSON.parse(readFileSync(join(d,'profile-source.json')))]));
for(const k of Object.keys(SHAS))assert.equal(manifests[k].source,SHAS[k]);
for(const field of ['overlaySha256','recorderSha256'])assert.equal(manifests.baseline[field],manifests.candidate[field]);
assert.equal(manifests.baseline.overlaySha256,'a15bb578723c1e5246abf73a83d9fa534ef3099c49a4061f283e0a68a226bae1');
assert.equal(manifests.baseline.recorderSha256,sha(readFileSync(join(here,'../perf/recorder.mjs'))));
assert.equal(readFileSync(join(dirs.baseline,'package-lock.json'),'utf8'),readFileSync(join(dirs.candidate,'package-lock.json'),'utf8'));
mkdirSync(out,{recursive:true});mkdirSync(offline,{recursive:true});
const pairs=[],mappingProof=[];
const kit={schema:1,sources:SHAS,wrapperCommit:process.env.GITHUB_SHA||null,buildRun:process.env.GITHUB_RUN_ID||null,createdAt:new Date().toISOString(),overlaySha256:manifests.baseline.overlaySha256,recorderSha256:manifests.baseline.recorderSha256,uiSha256:sha(readFileSync(join(here,'ui.mjs'))),mode:'manual-device-test',diagnostic:'B3-D1',packaging:'offline-symbols-v1',normalGameDeployed:false,defaults:{seed:4,quality:'medium',dynres:0,streamBudget:6},runtimeVerified:false};
for(const [k,d] of Object.entries(dirs)){
 assert.deepEqual(JSON.parse(readFileSync(join(d,'dist/profile-source.json'))),manifests[k]);
 // Public copy excludes maps at the source, not by ignoring failed HTTP requests.
 cpSync(join(d,'dist'),join(out,k),{recursive:true,filter:src=>!src.endsWith('.map')});
 function collect(dir){for(const e of readdirSync(dir,{withFileTypes:true})){
  const file=join(dir,e.name);if(e.isDirectory()){collect(file);continue;}
  if(!e.isFile())throw Error('Unexpected entry: '+file);
  if(!e.name.endsWith('.map'))continue;
  assert(e.name.endsWith('.js.map'),'Unexpected source-map kind: '+e.name);
  const rel=relative(join(d,'dist'),file).split('\\').join('/'),jsRel=rel.slice(0,-4);
  const original=readFileSync(join(d,'dist',jsRel),'utf8'),mapBytes=readFileSync(file),map=JSON.parse(mapBytes);
  assert.equal(map.version,3);assert.equal(map.file,jsRel.split('/').at(-1));
  assert(map.sources.length&&map.mappings.length&&map.sourcesContent?.length===map.sources.length);
  assert(map.sourcesContent.every(c=>typeof c==='string'),'Archive requires embedded original sources');
  const footer=original.match(/\/\/# sourceMappingURL=([^\r\n]+)[\r\n]*$/);
  assert(footer,'Missing source-map footer: '+jsRel);assert.equal(footer[1],e.name);
  // Only remove the trailing comment. Every mapped code character retains its position.
  const served=original.slice(0,footer.index);
  assert(!/\/\/# sourceMappingURL=/.test(served));
  writeFileSync(join(out,k,jsRel),served);
  const target=join(offline,k,jsRel);mkdirSync(dirname(target),{recursive:true});
  writeFileSync(target,served);writeFileSync(target+'.map',mapBytes);
  const pair={variant:k,source:SHAS[k],javascript:k+'/'+jsRel,javascriptSha256:sha(served),
   originalJavascriptSha256:sha(original),sourceMap:k+'/'+rel,sourceMapSha256:sha(mapBytes),
   javascriptBytes:Buffer.byteLength(served),sourceMapBytes:mapBytes.length,sources:map.sources.length};
  pairs.push(pair);
  const sm=new SourceMap(map),index=served.indexOf('shaderSource(');
  const offset=index>=0?index:Math.min(100,served.length-1),before=served.slice(0,offset).split('\n');
  let entry=sm.findEntry(before.length-1,before.at(-1).length);
  if(!entry.originalSource){const lines=served.split('\n');for(let line=0;line<lines.length&&!entry.originalSource;line++)entry=sm.findEntry(line,Math.max(0,lines[line].length-1));}
  assert(entry.originalSource,'Source map does not decode: '+jsRel);
  mappingProof.push({javascript:pair.javascript,probe:index>=0?'shaderSource':'code-position',
   mappingCoordinates:'zero-based',entry});
 }}collect(join(d,'dist'));
 assert(pairs.filter(p=>p.variant===k).length>=3,'Missing a game or lab source map');
 const path=join(out,k,'index.html'),html=readFileSync(path,'utf8');
 assert.equal(html.split('</head>').length,2);
 writeFileSync(path,html.replace('</head>','<meta name="robots" content="noindex,nofollow"><script type="module" src="../ui.mjs"></script></head>'));
}
for(const f of ['ui.mjs','index.html','serve.py'])cpSync(join(here,f),join(out,f));
const stackManifest={schema:'pr80-offline-symbols-v1',diagnostic:'B3-D1',sources:SHAS,
 recorderSha256:kit.recorderSha256,overlaySha256:kit.overlaySha256,
 packagingCommit:kit.wrapperCommit,pairs:pairs.sort((a,b)=>a.javascript.localeCompare(b.javascript)),
 unbundledSources:[{path:'ui.mjs',sha256:kit.uiSha256,reason:'Unminified source: use stack line directly'}]};
const stackJSON=JSON.stringify(stackManifest,null,2);
kit.sourceMaps={storage:'offline-artifact-only',manifest:'stack-manifest.json',manifestSha256:sha(stackJSON)};
writeFileSync(join(out,'stack-manifest.json'),stackJSON);
writeFileSync(join(offline,'stack-manifest.json'),stackJSON);
writeFileSync(join(offline,'mapping-proof.json'),JSON.stringify(mappingProof,null,2));
cpSync(join(here,'ui.mjs'),join(offline,'ui.mjs'));
for(const [k,d]of Object.entries(dirs))cpSync(join(d,'profile-source.json'),join(offline,k,'profile-source.json'));
writeFileSync(join(offline,'README.txt'),'B3-D1 exact offline symbols. Not a web directory. Keep this archive after Actions expires.\nEach pair records SHA-256 of the actual published JavaScript and its source map. sourcesContent is embedded.\nMap using Node.js 22 built-in SourceMap.findOrigin(stackLine,stackColumn); stack coordinates are 1-based.\nOnly the trailing sourceMappingURL comment was removed; all mapped source positions are unchanged.\nMap the exact JavaScript filename and verify its SHA first; never substitute a map from a rebuilt/other version.\nThese maps do not retroactively restore the missing stack of the original iPad B3 report.\n');
writeFileSync(join(out,'kit.json'),JSON.stringify(kit,null,2));
writeFileSync(join(out,'START-PC.bat'),'@echo off\r\ncd /d "%~dp0"\r\npy -3 serve.py\r\npause\r\n');
writeFileSync(join(out,'README.txt'),'PR80 hardware test: run python3 serve.py (Windows: py -3 serve.py), then open http://127.0.0.1:8765/.\nFor iPad use python3 serve.py --lan on a PC and open its LAN URL in trusted Wi-Fi.\nWithout a PC, use separately authorized static hosting on an origin different from the main game. ZIP/file:// is not playable on iPad.\nThis bundle has not been published and is not a verified hardware benchmark. No runtime result is invented.\nThe launcher describes the AB/BA/AB manual protocol. Save JSON before starting the next round.\n');
const hashes=[];
function walk(p){for(const e of readdirSync(p,{withFileTypes:true})){const f=join(p,e.name);if(e.isDirectory())walk(f);else if(e.isFile())hashes.push(`${sha(readFileSync(f))}  ${relative(out,f).split('\\').join('/')}`);else throw Error('Unexpected non-regular entry');}}
walk(out);assert(!hashes.some(h=>/\.map$/.test(h)),'Public output contains source maps');writeFileSync(join(out,'SHA256SUMS.txt'),hashes.sort().join('\n')+'\n');
console.log(JSON.stringify({out,files:hashes.length,sources:SHAS,uiSha256:kit.uiSha256,runtimeVerified:false}));
