// Rendering configuration only: no game rules, DOM, preferences or saved character data.
import config from '../../data/rendering.json' with {type:'json'};
export const renderConfig = config;
/** A preset's values, or 'custom' built from the player's own choices (each checked
 *  against data/rendering.json -> graphics; anything missing or unknown keeps medium's). */
export function qualitySettings(name, custom = null) {
  if (name === 'custom') return {name, ...customQuality(custom)};
  const quality = Object.hasOwn(config.quality, name) ? name : 'medium';
  return {name:quality, ...config.quality[quality]};
}
export function customQuality(custom) {
  const base = config.quality.medium, g = config.graphics, c = custom || {};
  return {
    pixelRatio: g.pixelRatios.includes(c.pixelRatio) ? c.pixelRatio : base.pixelRatio,
    shadowMapSize: g.shadowMapSizes.includes(c.shadowMapSize) ? c.shadowMapSize : base.shadowMapSize,
    post: typeof c.post === 'boolean' ? c.post : base.post,
    dynres: typeof c.dynres === 'boolean' ? c.dynres : base.dynres,
  };
}
/** Anti-aliasing samples: one of graphics.antialias, else the default. */
export function antialiasSamples(value) {
  const n = value === null || value === undefined || value === '' ? NaN : Number(value);
  return config.graphics.antialias.includes(n) ? n : config.graphics.defaultAntialias;
}
export function lightingSettings(name = config.lighting.active) {
  if (!Object.hasOwn(config.lighting.profiles, name)) throw new RangeError('Unknown lighting profile: '+name);
  return {name, ...config.lighting.profiles[name]};
}
/** Reallocate a shadow target when changing preset. Lower settings release GPU storage. */
export function applyShadowQuality(renderer, sun, quality) {
  const settings = typeof quality === 'string' ? qualitySettings(quality) : quality, shadow = sun.shadow;
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
