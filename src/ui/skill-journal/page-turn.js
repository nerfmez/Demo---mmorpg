// A visual leaf only. Navigation commits synchronously; this module never changes game state.
export function createPageTurn(book){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');let active=null,count=0,cancelled=0,direction=1;
 function cancel(){if(active){const old=active;active=null;old.animations.forEach(a=>a.cancel());old.layer.remove();cancelled++}}
 function capture(){const workspace=book.querySelector('.workspace'),clone=workspace.cloneNode(true);clone.querySelectorAll('*').forEach(el=>{for(const attr of [...el.attributes])if(attr.name==='id'||attr.name.startsWith('data-'))el.removeAttribute(attr.name)});clone.removeAttribute('id');clone.querySelector('.inspector')?.remove();clone.querySelectorAll('button,input,summary,[tabindex]').forEach(el=>el.tabIndex=-1);clone.querySelectorAll('details').forEach(el=>el.open=false);clone.inert=true;clone.setAttribute('aria-hidden','true');return {clone,width:book.clientWidth,height:book.clientHeight};}
 function play(snapshot,way=1){
  cancel();direction=way<0?-1:1;count++;if(reduced.matches)return;
  const layer=document.createElement('div');layer.className='paper-turn-layer '+(direction>0?'turn-forward':'turn-backward');layer.setAttribute('aria-hidden','true');layer.inert=true;layer.style.setProperty('--turn-width',snapshot.width+'px');layer.style.setProperty('--turn-height',snapshot.height+'px');
  layer.innerHTML='<div class="turn-cast-shadow"></div><div class="turn-leaf"><div class="turn-face turn-front"></div><div class="turn-face turn-verso"><span>SEEKER / FIELD NOTES</span></div><div class="turn-curled-edge"></div></div>';
  layer.querySelector('.turn-front').append(snapshot.clone);book.append(layer);const leaf=layer.querySelector('.turn-leaf'),shadow=layer.querySelector('.turn-cast-shadow'),sign=direction>0?-1:1;
  const options={duration:620,easing:'cubic-bezier(.24,.65,.26,1)',fill:'forwards'};
  const animations=[leaf.animate([{transform:'rotateY(0deg) rotateZ(0deg)',opacity:1},{transform:`rotateY(${sign*37}deg) rotateZ(${sign*.65}deg)`,offset:.28,opacity:1},{transform:`rotateY(${sign*113}deg) rotateZ(${sign*.9}deg)`,offset:.65,opacity:1},{transform:`rotateY(${sign*178}deg) rotateZ(0deg)`,opacity:0}],options),shadow.animate([{opacity:0,transform:`translateX(${direction*28}%) scaleX(.35)`},{opacity:.23,transform:'translateX(0) scaleX(1)',offset:.42},{opacity:0,transform:`translateX(${-direction*22}%) scaleX(.2)`}],options)];
  const current={layer,animations};active=current;Promise.all(animations.map(a=>a.finished)).then(()=>{if(active===current){active=null;layer.remove()}},()=>{});
 }
 const hidden=()=>{if(document.hidden)cancel()};addEventListener('resize',cancel);reduced.addEventListener('change',cancel);document.addEventListener('visibilitychange',hidden);
 return {capture,play,cancel,destroy(){cancel();removeEventListener('resize',cancel);reduced.removeEventListener('change',cancel);document.removeEventListener('visibilitychange',hidden);},snapshot:()=>({active:Boolean(active),count,cancelled,direction,reduced:reduced.matches,layers:book.querySelectorAll('.paper-turn-layer').length})};
}
