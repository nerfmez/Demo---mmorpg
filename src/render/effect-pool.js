// Small owner-scoped pools retain compiled materials and GPU buffers between casts.
// Overflow is still rendered, then disposed; it never grows the retained pool.
export class EffectPool {
  constructor(create, dispose, capacity = 3) {
    this.create = create;
    this.dispose = dispose;
    this.capacity = capacity;
    this.idle = [];
    this.live = new Set();
  }
  take() {
    const object = this.idle.pop() || this.create();
    this.live.add(object);
    return object;
  }
  release(object) {
    if (!this.live.delete(object)) return;
    object.removeFromParent();
    if (this.idle.length < this.capacity) this.idle.push(object);
    else this.dispose(object);
  }
  clear() {
    for (const object of this.live) this.dispose(object);
    for (const object of this.idle) this.dispose(object);
    this.live.clear();
    this.idle.length = 0;
  }
}
