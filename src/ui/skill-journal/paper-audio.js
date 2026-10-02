// Original, deterministic paper rustle. No recordings, external assets or live-game storage.
const KEY='frontier-demo.journal-paper-sfx.v1';
export function paperSamples(rate=48000,direction=1){
 const count=Math.round(rate*.48),out=new Float32Array(count);let seed=direction<0?0x78259a1:0x49ab751,slow=0,fast=0,previous=0,crack=0;
 const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
 for(let i=0;i<count;i++){
  const t=i/rate,n=random()*2-1;slow+=.055*(n-slow);fast+=.62*(n-fast);const high=(n-previous)*.28;previous=n;
  crack=crack*.63+(random()<.006?(random()*2-1)*.42:0);
  const scrape=.18+.46*Math.exp(-(((t-.075)/.037)**2))+.8*Math.exp(-(((t-.205)/.076)**2))+.48*Math.exp(-(((t-.345)/.046)**2));
  const edge=Math.min(1,t/.018,(.48-t)/.055),grain=.72+.18*Math.sin(t*185)+.1*Math.sin(t*413);
  out[i]=((fast-slow)*.65+high*.15+crack)*scrape*Math.max(0,edge)*grain*.66;
 }
 return out;
}
export function createPaperAudio(initial={muted:false,volume:.38}){
 let settings={muted:Boolean(initial.muted),volume:Math.max(0,Math.min(1,Number(initial.volume)||0))};try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved&&typeof saved.muted==='boolean'&&Number.isFinite(saved.volume))settings={muted:saved.muted,volume:Math.max(0,Math.min(1,saved.volume))};}catch{}
 let context,master,analyser,buffers={},voice=null,epoch=0,plays=0,denied=0,history=[];const samples=new Float32Array(256);
 const persist=()=>{try{localStorage.setItem(KEY,JSON.stringify(settings));}catch{}};
 const gain=()=>settings.muted?0:settings.volume;
 function stop(){epoch++;if(voice){const v=voice;voice=null;try{v.gain.gain.cancelScheduledValues(context.currentTime);v.gain.gain.setTargetAtTime(0,context.currentTime,.003);v.source.stop(context.currentTime+.018);}catch{}}}
 function ensure(){
  if(!context){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return null;context=new Audio();master=context.createGain();master.gain.value=gain();analyser=context.createAnalyser();analyser.fftSize=512;master.connect(analyser);analyser.connect(context.destination);}
  return context;
 }
 function prime(){if(!gain())return;try{const c=ensure();if(c&&c.state==='suspended')c.resume().catch(()=>{denied++});}catch{denied++}}
 async function play(direction=1){
  stop();if(!gain()||document.hidden)return false;const token=epoch;
  try{const c=ensure();if(!c)return false;if(c.state==='suspended')await c.resume();if(token!==epoch||!gain()||c.state!=='running'||document.hidden)return false;
   const key=direction<0?'back':'forward';if(!buffers[key]){const pcm=paperSamples(c.sampleRate,direction),buffer=c.createBuffer(1,pcm.length,c.sampleRate);buffer.copyToChannel(pcm,0);buffers[key]=buffer;}
   const source=c.createBufferSource(),voiceGain=c.createGain();source.buffer=buffers[key];source.connect(voiceGain);voiceGain.connect(master);const at=c.currentTime+.008;voice={source,gain:voiceGain};const v=voice;
   source.onended=()=>{source.disconnect();voiceGain.disconnect();if(voice===v)voice=null};source.start(at);plays++;history.push({wallTime:performance.timeOrigin+performance.now(),direction:direction<0?-1:1,volume:gain()});if(history.length>64)history.shift();return true;
  }catch{denied++;return false}
 }
 function set(muted,volume=settings.volume){settings={muted:Boolean(muted),volume:Math.max(0,Math.min(1,Number(volume)||0))};if(master)master.gain.setTargetAtTime(gain(),context.currentTime,.008);if(!gain())stop();persist();}
 const hidden=()=>{if(document.hidden)stop()};document.addEventListener('visibilitychange',hidden);
 return {play,prime,stop,set,destroy(){stop();document.removeEventListener('visibilitychange',hidden);context?.close().catch(()=>{});buffers={};},snapshot(){let peak=0;if(analyser&&context.state==='running'){analyser.getFloatTimeDomainData(samples);for(const s of samples)peak=Math.max(peak,Math.abs(s))}return {...settings,contextState:context?.state||'not-created',plays,activeVoice:Boolean(voice),denied,peak}},events:()=>history.map(e=>({...e}))};
}
