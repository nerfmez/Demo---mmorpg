// Frontier skill expansion. Pure simulation helpers; all content/tuning comes from data.
import { angleTo, angleDiff, dist, DEG } from './math.js';

export const EXTRA_FIELDS = ['guard','positionalMult','exposure','interrupt','width','aimDuringCast','taunt','waves','waveInterval','channel','wall','cleanse','aura'];
export function compileFrontier(s, def, activeMods) {
  for (const key of EXTRA_FIELDS) if (def[key] !== undefined) s[key] = Array.isArray(def[key]) ? [...def[key]] : typeof def[key] === 'object' ? { ...def[key] } : def[key];
  s.modEffects = {};
  for (const { mod, level } of activeMods) for (const [key, value] of Object.entries(mod.effect))
    s.modEffects[key] = Array.isArray(value) ? value[Math.min(level, value.length) - 1] : value;
  const e = s.modEffects;
  if (e.arcMult) s.arc *= e.arcMult;
  if(e.returnMult)s.pierce=Infinity;
  if (e.healMult && s.heal) s.heal *= e.healMult;
  if (e.barrierMult && s.barrier) s.barrier *= e.barrierMult;
  if (e.triggerCost && s.trigger) s.trigger.cost = true;
  if(s.summon&&e.summonDamage&&!e.extraSummons)s.summon.damage*=1+e.summonDamage;
  if (s.summon) s.summon = { ...s.summon, tauntRadius:def.summon.tauntRadius, tauntInterval:def.summon.tauntInterval, tauntDuration:def.summon.tauntDuration, effects:e, skill:s.id };
}

const inArc = (p,m,aim,s) => dist(p.x,p.z,m.x,m.z)-m.r <= s.range && Math.abs(angleDiff(aim.angle,angleTo(p.x,p.z,m.x,m.z))) <= (s.arc || 360)*DEG/2;
const units = g => g.units().filter(u => !u.dead && u.life !== 0 && u.hp > 0);
const activeAura = (g,a) => {const s=g.skills[a.slot];return s?.id===a.skill.id&&s.requirementsMet&&(a.skill.aura?!!s.aura:!!s.modEffects?.buffAura);};
export function manaLimit(g) {
  let reserve=0;
  for(const a of Object.values(g.player.auras || {})) if(activeAura(g,a)) reserve += a.reserve;
  return g.player.maxMp * (1 - Math.min(.8,reserve));
}
export function cancelChannel(g) {
  const c=g.player.channeling;
  if (!c) return;
  g.player.cooldowns[c.slot]=Math.max(g.player.cooldowns[c.slot],c.skill.cooldown);
  g.player.channeling=null;
  g.emit({type:'channelEnd'});
}
export function startChannel(g,s) {
  const p=g.player;
  p.queued=null;
  p.mp-=s.cost;
  p.channeling={slot:s.slot,skill:s,t:0,next:s.castTime};
  g.emit({type:'channelStart',skill:s.id,slot:s.slot,total:s.castTime,weapon:g.derived.weaponType});
}
export function commandAllies(g,command,targetId=null) {
  if(!['attack','follow','guard'].includes(command))return false;
  const target=targetId && g.monsterById(targetId);
  if(command==='attack'&&(!target||target.dead||dist(target.x,target.z,g.player.x,g.player.z)>16))return false;
  for(const a of g.allies){a.command=command;a.targetId=command==='attack'?target.id:null;a.state='follow';a.stateT=0;}
  return true;
}
export function healUnit(g,u,amount,s,mult=1) {
  if(u.dead||u.hp<=0)return;
  const e=s?.modEffects || {},part=e.healBarrier || 0;
  const actual=amount*mult;
  if(u===g.player)g.healPlayer(actual*(1-part));
  else {const got=Math.min(u.maxHp-u.hp,actual*(1-part));u.hp+=got;if(got>0)g.emit({type:'heal',amount:Math.round(got),x:u.x,z:u.z});}
  if(part){u.barrier=Math.max(u.barrier||0,Math.min(u.maxHp*e.healBarrierCap,actual*part));u.barrierT=Math.max(u.barrierT||0,e.healBarrierDuration);}
}
export function executeFrontier(g,s,aim,mult,triggered) {
  const p=g.player,e=s.modEffects || {};
  if(s.channel){if(!p.channeling)startChannel(g,s);return true;}
  if(s.kind==='heal_target'){
    g.emit({type:'healCast',skill:s.id,x:p.x,z:p.z,radius:1.2});
    const candidates=units(g).filter(u=>dist(p.x,p.z,u.x,u.z)<=s.range);
    // Manual point selects nearest ally; quick cast selects the most injured ratio.
    candidates.sort((a,b)=>aim.targetId?(a.id===aim.targetId?-1:b.id===aim.targetId?1:0):(a.hp/a.maxHp-b.hp/b.maxHp));
    const hit=new Set();let u=candidates[0]||p,heal=s.heal*mult;
    for(let i=0;i<= (e.healChain||0)&&u;i++){
      hit.add(u.id);healUnit(g,u,heal,s);
      const status=s.cleanse.find(k=>u.statuses?.[k]);if(status)delete u.statuses[status];
      const source=u;u=units(g).filter(q=>!hit.has(q.id)&&q.hp<q.maxHp&&dist(q.x,q.z,source.x,source.z)<=e.healChainRange).sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
      heal*=e.healChainFalloff || 1;
    }
    return true;
  }
  if(s.kind==='aura'||e.buffAura){
    p.auras ||= {};
    if(p.auras[s.slot])delete p.auras[s.slot];
    else p.auras[s.slot]={slot:s.slot,skill:s,reserve:s.aura?.reserve||e.auraReserve,tick:s.aura?.tick||.5,next:0};
    p.mp=Math.min(p.mp,manaLimit(g));
    g.emit({type:'auraToggle',skill:s.id,active:!!p.auras[s.slot],x:p.x,z:p.z,radius:s.radius});
    return true;
  }
  if(s.kind==='counter_stance'){
    if(s.counterStrike){
      p.riposte=null;
      for(const m of g.monsters)if(!m.dead&&inArc(p,m,aim,s))g.hitMonster(m,s.damage*mult,g.hitOpts(s,{crit:g.rollCrit()}));
      g.emit({type:'slash',skill:s.id,x:p.x,z:p.z,angle:aim.angle,arc:s.arc,range:s.range,element:s.element});
    }else {p.riposte={skill:s,guardUntil:g.time+s.guard.duration,readyUntil:0};g.emit({type:'guardStance',x:p.x,z:p.z,duration:s.guard.duration});}
    return true;
  }
  if(s.kind==='melee_line'){
    for(const m of g.monsters){
      if(m.dead)continue;const dx=m.x-p.x,dz=m.z-p.z;
      const forward=dx*Math.sin(aim.angle)+dz*Math.cos(aim.angle),side=dx*Math.cos(aim.angle)-dz*Math.sin(aim.angle);
      if(forward < -m.r || forward>s.range+m.r || Math.abs(side)>s.width/2+m.r)continue;
      g.hitMonster(m,s.damage*mult,g.hitOpts(s,{crit:g.rollCrit()}));
    }
    g.emit({type:'lineStrike',skill:s.id,x:p.x,z:p.z,angle:aim.angle,range:s.range,width:s.width,element:s.element});return true;
  }
  if(s.kind==='wall'){
    const axis=aim.angle+Math.PI/2,half=s.wall.length/2,walls=[];
    // Two safe endpoints leave a route around the wall; reject enclosed/occupied placement.
    const ends=[-half-s.wall.minGap,half+s.wall.minGap];
    if(!ends.every(d=>g.world.isFree(aim.x+Math.sin(axis)*d,aim.z+Math.cos(axis)*d,p.r)))return true;
    for(let i=-1;i<=1;i++){
      const x=aim.x+Math.sin(axis)*i*s.wall.length/3,z=aim.z+Math.cos(axis)*i*s.wall.length/3,r=s.wall.length/6;
      if(!g.world.isFree(x,z,r)||[...units(g),...g.monsters.filter(m=>!m.dead)].some(u=>dist(x,z,u.x,u.z)<r+u.r))return true;
      walls.push({x,z,r});
    }
    for(const w of walls)g.spawnArea({owner:'player',kind:'crystal_wall',skill:s,...w,radius:w.r,angle:axis,duration:s.duration,wallHp:s.wall.hp.base+s.wall.hp.scale*g.derived.magic,wallHitAt:0});
    return true;
  }
  if(s.waves){
    for(let i=0;i<s.waves;i++){
      const wave={owner:'player',kind:s.id,skill:s,x:aim.x,z:aim.z,radius:s.radius,delay:s.delay+i*s.waveInterval,duration:.35,damage:s.damage*mult,element:s.element};
      g.spawnArea(wave);
      if(s.echo)g.spawnArea({...wave,echo:true,delay:wave.delay+s.echo.delay,damage:wave.damage*s.echo.mult});
    }return true;
  }
  return false;
}

export function adjustFrontierHit(g,m,amount,opts) {
  const s=opts.skill && g.skills.find(s=>s?.id===opts.skill),e=opts.modEffects || {};
  if(opts.dot||opts.secondary)return amount;
  if(s?.positionalMult&&Math.abs(angleDiff(m.facing,angleTo(m.x,m.z,opts.fromX??g.player.x,opts.fromZ??g.player.z)))>Math.PI/2)amount*=s.positionalMult;
  if(opts.exposure)m.statuses.exposure={fraction:Math.max(m.statuses.exposure?.fraction||0,opts.exposure.fraction),t:Math.max(m.statuses.exposure?.t||0,opts.exposure.duration)};
  if(opts.interrupt&&m.state==='windup'){
    const attack=m.def.attacks?.[m.windup?.name];
    if(!m.boss&&attack?.interruptible!==false){m.state='stunned';m.stateT=0;m.stateDur=opts.interrupt.duration;m.windup=null;m.melee=null;cancelWindup(g,m);}
    else if(m.boss){
      const poise=(m.statuses.poise?.value||0)+opts.interrupt.bossPoise;
      m.statuses.poise={value:poise,t:opts.interrupt.poiseDuration};
      if(poise>=opts.interrupt.poiseThreshold&&attack?.interruptible===true){m.state='stunned';m.stateT=0;m.stateDur=opts.interrupt.duration;m.windup=null;delete m.statuses.poise;cancelWindup(g,m);}
    }
  }
  if(opts.taunt){m.forcedTargetId=g.player.id;m.tauntT=Math.max(m.tauntT||0,opts.taunt.duration);}
  if(e.pull&&!m.boss){const a=angleTo(m.x,m.z,opts.fromX??g.player.x,opts.fromZ??g.player.z),d=Math.min(e.pull,dist(m.x,m.z,opts.fromX??g.player.x,opts.fromZ??g.player.z));g.moveEntity(m,Math.sin(a)*d,Math.cos(a)*d);}
  if(e.bleedFraction){const source=amount/(1-e.bleedFraction),old=m.statuses.bleed;const next={dps:source*e.bleedFraction/e.bleedDuration,t:e.bleedDuration,acc:0};if(!old||next.dps>=old.dps)m.statuses.bleed=next;}
  if(e.consumeBurn&&m.statuses.burn?.owner==='player'){
    const burn=m.statuses.burn;delete m.statuses.burn;
    secondaryBurst(g,m.x,m.z,e.statusBurstRadius,Math.min(burn.dps*burn.t,amount*e.consumeBurn),'fire',opts.skill);
  }
  if(e.shatter&&m.statuses.chill?.slow>=e.shatterThreshold){
    m.statuses.chill.slow*=.5;opts.consumedChill=true;
    secondaryBurst(g,m.x,m.z,e.shatterRadius,amount*e.shatter,'cold',opts.skill);
  }
  return amount;
}
function cancelWindup(g,m){g.areas=g.areas.filter(a=>{const remove=a.owner==='monster'&&a.sourceId===m.id&&a.t<a.delay;if(remove)g.emit({type:'areaEnd',id:a.id});return !remove;});}
function secondaryBurst(g,x,z,radius,damage,element,skill){
  for(const q of g.monsters)if(!q.dead&&dist(x,z,q.x,q.z)<=radius+q.r)g.hitMonster(q,damage,{element,secondary:true,skill});
  g.emit({type:'burst',kind:'mod_burst',element,x,z,radius});
}
export function spreadCurse(g,m){
  const h=m.statuses.hex;if(!h?.spread||h.t<=0)return;
  const next=g.monsters.filter(q=>q!==m&&!q.dead&&!q.statuses.hex&&dist(m.x,m.z,q.x,q.z)<=h.spread).sort((a,b)=>dist(m.x,m.z,a.x,a.z)-dist(m.x,m.z,b.x,b.z))[0];
  if(next)next.statuses.hex={...h};
}
export function applyGuard(g,amount,source,opts){
  const p=g.player,r=p.riposte;
  if(!r||g.time>r.guardUntil||!source||opts.dot||opts.unblockable)return {amount,guarded:false};
  if(Math.abs(angleDiff(p.facing,angleTo(p.x,p.z,source.x,source.z)))>r.skill.guard.arc*DEG/2)return {amount,guarded:false};
  r.guardUntil=0;r.readyUntil=g.time+r.skill.guard.readyDuration;
  return {amount:amount*r.skill.guard.taken,guarded:true};
}
export function shareGuardDamage(g,amount){
  const p=g.player,a=g.allies.find(a=>!a.dead&&a.life>0&&a.hp>0&&a.effects?.guardShare&&dist(a.x,a.z,p.x,p.z)<=a.effects.guardShareRange);
  if(!a)return amount;
  const share=amount*a.effects.guardShare;g.damageAlly(a,share,null);return amount-share;
}
export function breakBarrier(g,unit){
  const effect=unit.barrierBreak;if(!effect)return;
  unit.barrierBreak=null;
  for(const m of g.monsters)if(!m.dead&&dist(unit.x,unit.z,m.x,m.z)<=effect.radius+m.r){const a=angleTo(unit.x,unit.z,m.x,m.z);g.moveEntity(m,Math.sin(a)*effect.knock*(m.boss?.2:1),Math.cos(a)*effect.knock*(m.boss?.2:1));}
  g.emit({type:'nova',element:'arcane',x:unit.x,z:unit.z,radius:effect.radius});
}
export function wallBlocked(g,e,x,z){
  if(e.def?.flyer)return null;
  return g.areas.find(a=>{
    if(!(a.wallHp>0&&a.t>=a.delay))return false;
    const sn=Math.sin(a.angle),cs=Math.cos(a.angle);
    const sx=(e.x-a.x)*sn+(e.z-a.z)*cs,sz=(e.x-a.x)*cs-(e.z-a.z)*sn;
    const tx=(x-a.x)*sn+(z-a.z)*cs,tz=(x-a.x)*cs-(z-a.z)*sn;
    // Swept segment vs expanded rectangle prevents dashes/knockback tunnelling.
    let enter=0,exit=1;
    for(const [start,end,half]of [[sx,tx,a.r+e.r],[sz,tz,a.skill.wall.thickness/2+e.r]]){
      const d=end-start;if(Math.abs(d)<1e-9){if(Math.abs(start)>=half)return false;continue;}
      const t1=(-half-start)/d,t2=(half-start)/d;enter=Math.max(enter,Math.min(t1,t2));exit=Math.min(exit,Math.max(t1,t2));if(enter>exit)return false;
    }
    return exit>=0&&enter<=1;
  });
}
export function tickFrontier(g,dt){
  const p=g.player;
  if(p.riposte&&g.time>Math.max(p.riposte.guardUntil,p.riposte.readyUntil))p.riposte=null;
  for(const [key,a] of Object.entries(p.auras||{})){
    if(p.dead||!activeAura(g,a)){delete p.auras[key];continue;}
    a.next-=dt;if(a.next>0)continue;a.next+=a.tick;
    for(const u of units(g))if(dist(p.x,p.z,u.x,u.z)<=a.skill.radius+u.r){
      if(a.skill.aura&&u===p)p.mp=Math.min(manaLimit(g),p.mp+a.skill.aura.mpRegen*a.tick);
      if(a.skill.modEffects.buffAura){const k=a.skill.modEffects.buffAura;if(!u.buffs.war_cry||u.buffs.war_cry.damage<=a.skill.damageBuff*k)u.buffs.war_cry={t:a.tick*2,damage:a.skill.damageBuff*k,speed:a.skill.speedBuff*k};}
    }
  }
  p.mp=Math.min(p.mp,manaLimit(g));
  if(p.channeling){
    const c=p.channeling,s=c.skill;
    if(p.dead||p.dash||!g.skills[c.slot]?.requirementsMet||g.skills[c.slot].id!==s.id){cancelChannel(g);return;}
    c.t+=dt;
    const aim=g.resolveAim(s,null);p.facing=aim.angle;
    if(c.t>=c.next){
      const cost=s.channel.manaPerSecond*s.channel.tick;
      if(p.mp<cost){cancelChannel(g);return;}
      p.mp-=cost;c.next+=s.channel.tick;
      for(const m of g.monsters)if(!m.dead&&inArc(p,m,aim,s))g.hitMonster(m,s.damage*s.channel.tick*g.playerDamageMult(),g.hitOpts(s,{crit:g.rollCrit()}));
      g.emit({type:'channelPulse',skill:s.id,x:p.x,z:p.z,angle:aim.angle,range:s.range,arc:s.arc,element:s.element});
    }
  }
  for(const a of g.allies){
    if(a.barrierT){a.barrierT=Math.max(0,a.barrierT-dt);if(!a.barrierT){a.barrier=0;a.barrierBreak=null;}}
    if(a.tauntRadius&&!a.dead&&a.life>0){a.tauntCd=(a.tauntCd||0)-dt;if(a.tauntCd<=0){a.tauntCd=a.tauntInterval;for(const m of g.monsters)if(!m.dead&&dist(a.x,a.z,m.x,m.z)<=a.tauntRadius){m.forcedTargetId=a.id;m.tauntT=Math.max(m.tauntT||0,a.tauntDuration);}}}
  }
  for(const m of g.monsters){
    for(const k of ['exposure','poise'])if(m.statuses[k]){m.statuses[k].t-=dt;if(m.statuses[k].t<=0)delete m.statuses[k];}
    if(m.wallTarget){const w=g.areas.find(a=>a.id===m.wallTarget);if(!w||w.wallHp<=0||dist(m.x,m.z,w.x,w.z)>m.r+w.r+.8){m.wallTarget=null;continue;}if(m.state!=='chase'){m.wallAttackT=0;continue;}if(!(m.wallAttackT>0))g.emit({type:'wallWindup',x:w.x,z:w.z,radius:w.r+.2,duration:w.skill.wall.breakWindup});m.wallAttackT=(m.wallAttackT||0)+dt;if(m.wallAttackT>=w.skill.wall.breakWindup){m.wallAttackT=0;w.wallHp-=m.damage;g.emit({type:'wallHit',id:w.id,x:w.x,z:w.z});}}
  }
}
export function endProjectile(g,pr){
  const e=pr.skill?.modEffects;if(e?.terminalBurst&&(!e.returnMult||pr.returning))secondaryBurst(g,pr.x,pr.z,e.burstRadius,pr.damage*e.terminalBurst,pr.element,pr.kind);
  if(e?.returnMult&&!pr.returning){pr.returning=true;pr.hit.clear();pr.vx*=-1;pr.vz*=-1;pr.angle+=Math.PI;pr.damage*=e.returnMult;pr.travelled=0;pr.range=dist(pr.x,pr.z,pr.startX,pr.startZ);pr.pierce=Infinity;return pr.range>.05;}
  return false;
}
