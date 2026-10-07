// Short Chromium UI capture after startup, preserving each CDP frame timestamp.
import {mkdirSync,writeFileSync} from 'node:fs';
import {dirname,basename,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

export async function startTimedScreencast(page, output) {
 const client=await page.context().newCDPSession(page),frames=[],acks=[];
 let firstResolve,firstReject;
 const first=new Promise((resolve,reject)=>{firstResolve=resolve;firstReject=reject;});
 const timer=setTimeout(()=>firstReject(Error('No initial screencast frame')),10000);
 const onFrame=e=>{
  frames.push({time:e.metadata.timestamp,data:e.data});
  acks.push(client.send('Page.screencastFrameAck',{sessionId:e.sessionId}));
  clearTimeout(timer);firstResolve();
 };
 client.on('Page.screencastFrame',onFrame);
 const {width,height}=page.viewportSize();
 await client.send('Page.startScreencast',{format:'jpeg',quality:92,maxWidth:width,maxHeight:height,everyNthFrame:1});
 await first;
 return async()=>{
  await client.send('Page.stopScreencast');client.off('Page.screencastFrame',onFrame);
  await Promise.all(acks);await client.detach();frames.sort((a,b)=>a.time-b.time);
  assert.ok(frames.length>2&&frames.every(f=>Number.isFinite(f.time)),'timestamped live frames');
  const dir=join(dirname(output),basename(output,'.mp4')+'-frames');mkdirSync(dir,{recursive:true});
  const unique=frames.filter((f,i)=>!i||f.time>frames[i-1].time),lines=['ffconcat version 1.0'];
  for(let i=0;i<unique.length;i++){
   const file=String(i).padStart(4,'0')+'.jpg';writeFileSync(join(dir,file),Buffer.from(unique[i].data,'base64'));
   lines.push(`file '${file}'`,'option framerate 1000',`duration ${i+1<unique.length?unique[i+1].time-unique[i].time:.04}`);
  }
  lines.push(`file '${String(unique.length-1).padStart(4,'0')}.jpg'`,'option framerate 1000');
  const concat=join(dir,'frames.ffconcat');writeFileSync(concat,lines.join('\n')+'\n');
  const encode=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-f','concat','-safe','0','-i',concat,'-vf','scale=in_range=full:out_range=limited','-r','25','-fps_mode','cfr','-c:v','libx264','-pix_fmt','yuv420p','-color_range','tv','-movflags','+faststart',output],{encoding:'utf8'});
  assert.equal(encode.status,0,encode.stderr);
  const duration=unique.at(-1).time-unique[0].time;
  const probe=spawnSync('ffprobe',['-v','error','-show_entries','format=duration','-of','csv=p=0',output],{encoding:'utf8'});
  assert.ok(Math.abs(Number(probe.stdout)-duration)<.13,'encoded duration follows real frame timestamps');
  const result={file:output,frames:unique.length,firstTimestamp:unique[0].time,lastTimestamp:unique.at(-1).time,duration,encodedDuration:Number(probe.stdout),method:'CDP live JPEG frame timestamps → concat durations → 25fps MP4; no speed filter'};
  writeFileSync(output+'.json',JSON.stringify(result,null,2));return result;
 };
}
