// Dynamic resolution: keeps the frame rate up on a GPU that falls behind by lowering the render
// scale a step at a time, and climbs back to full sharpness once frames are comfortably fast.
// A device that holds the target never leaves scale 1, so it renders exactly as before.
// Pure logic (frame times in, scale out); the view applies the scale to the pixel ratio.
export class ResolutionGovernor {
  constructor({ minScale = 0.67, slowMs = 19.5, fastMs = 15.5, stepDown = 0.125, stepUp = 0.0625, settle = 1.5, recover = 4 } = {}) {
    Object.assign(this, { minScale, slowMs, fastMs, stepDown, stepUp, settle, recover });
    this.scale = 1; this.average = 0; this.sinceChange = 0; this.fastFor = 0;
  }
  /** One frame's wall time in ms; returns the new scale when it changes, otherwise null. */
  update(ms) {
    if (!(ms > 0) || ms > 100) return null; // tab switches and hitches are not GPU load
    this.average = this.average ? this.average * 0.9 + ms * 0.1 : ms;
    this.sinceChange += ms / 1000;
    this.fastFor = this.average < this.fastMs ? this.fastFor + ms / 1000 : 0;
    if (this.sinceChange < this.settle) return null;
    let next = this.scale;
    if (this.average > this.slowMs && this.scale > this.minScale) next = Math.max(this.minScale, this.scale - this.stepDown);
    else if (this.fastFor > this.recover && this.scale < 1) next = Math.min(1, this.scale + this.stepUp);
    if (next === this.scale) return null;
    this.scale = next; this.sinceChange = 0; this.fastFor = 0;
    return next;
  }
}
