// Rendering configuration only: no game rules, DOM, preferences or saved character data.
import config from '../../data/rendering.json' with {type:'json'};
import art from '../../data/art.json' with {type:'json'};
export const renderConfig = config;
const requested = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('look') : null;
/** Opt-in look prototype name (?look=<name>, a key of rendering.json looks), else null. */
export const lookName = requested && typeof config.looks[requested] === 'object' ? requested : null;
/** That look's lighting profile, screen-grade overrides and outline, else null. */
export const look = lookName ? config.looks[lookName] : null;
/** The look's art palette overrides (art.json looks), else null. */
export const artLook = lookName ? art.looks[lookName] ?? null : null;
/** The screen grade with the look's overrides and outline applied when one is on. */
export const postConfig = () => look ? { ...config.post, ...look.post, outline: look.outline } : config.post;
export function qualitySettings(name) {
  const quality = Object.hasOwn(config.quality, name) ? name : 'medium';
  return {name:quality, ...config.quality[quality]};
}
export function lightingSettings(name = config.lighting.active) {
  if (!Object.hasOwn(config.lighting.profiles, name)) throw new RangeError('Unknown lighting profile: '+name);
  return {name, ...config.lighting.profiles[name]};
}
/** Reallocate a shadow target when changing preset. Lower settings release GPU storage. */
export function applyShadowQuality(renderer, sun, name) {
  const settings = qualitySettings(name), shadow = sun.shadow;
  const enabled = settings.shadowMapSize > 0;
  const changed = shadow.mapSize.x !== settings.shadowMapSize || renderer.shadowMap.enabled !== enabled;
  if (changed) {
    const targets = new Set([shadow.map, shadow.mapPass]);
    for (const target of targets) target?.dispose();
    shadow.map = null;
    shadow.mapPass = null;
    // Keep a legal map size even while disabled; zero means no allocated target.
    shadow.mapSize.set(settings.shadowMapSize || 512, settings.shadowMapSize || 512);
    shadow.needsUpdate = enabled;
    renderer.shadowMap.needsUpdate = enabled;
  }
  renderer.shadowMap.enabled = enabled;
  return settings;
}
