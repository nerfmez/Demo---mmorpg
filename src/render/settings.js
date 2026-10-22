// Rendering configuration only: no game rules, DOM, preferences or saved character data.
import config from '../../data/rendering.json' with {type:'json'};
export const renderConfig = config;
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
