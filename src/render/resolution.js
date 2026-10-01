// Dynamic resolution: keeps the frame rate up on a GPU that falls behind by lowering the render
// scale a step at a time, and climbs back to full sharpness once frames are comfortably fast.
// A device that holds the target never leaves scale 1, so it renders exactly as before.
// Pure logic (frame times in, scale out); the view applies the scale to the pixel ratio.
//
// requestAnimationFrame is paced by the display, so frame times never fall below its refresh
// interval (16.7 ms at 60 Hz, 8.3 ms at 120 Hz). "Fast" therefore means running at the display
// rate: the average within `vsyncSlack` of the shortest recent frame (the display interval).
// A step back up that is followed by a slowdown doubles the wait before trying again.
export class ResolutionGovernor {
  constructor({ minScale = 0.67, slowMs = 19.5, vsyncSlack = 1.12, stepDown = 0.125, stepUp = 0.0625, settle = 1.5, recover = 4, maxRecover = 60 } = {}) {
    Object.assign(this, { minScale, slowMs, vsyncSlack, stepDown, stepUp, settle, recover, maxRecover });
    this.scale = 1; this.average = 0; this.sinceChange = 0; this.fastFor = 0; this.interval = 0; this.wait = recover; this.lastWasUp = false;
  }
  /** One frame's wall time in ms; returns the new scale when it changes, otherwise null. */
  update(ms) {
    if (!(ms > 0) || ms > 100) return null; // tab switches and hitches are not GPU load
    // the display interval: the shortest frame, forgotten over ~20-30 s so a lasting refresh-rate change is followed
    this.interval = this.interval ? Math.min(ms, this.interval * 1.0005) : ms;
    this.average = this.average ? this.average * 0.9 + ms * 0.1 : ms;
    this.sinceChange += ms / 1000;
    this.fastFor = this.average <= this.interval * this.vsyncSlack ? this.fastFor + ms / 1000 : 0;
    if (this.sinceChange < this.settle) return null;
    let next = this.scale, up = false;
    if (this.average > this.slowMs && this.scale > this.minScale) {
      next = Math.max(this.minScale, this.scale - this.stepDown);
      // the last step up did not hold: be slower to try again
      if (this.lastWasUp && this.sinceChange < this.wait + this.settle) this.wait = Math.min(this.maxRecover, this.wait * 2);
    } else if (this.fastFor > this.wait && this.scale < 1) { next = Math.min(1, this.scale + this.stepUp); up = true; }
    if (next === this.scale) return null;
    this.scale = next; this.sinceChange = 0; this.fastFor = 0; this.lastWasUp = up;
    return next;
  }
}
