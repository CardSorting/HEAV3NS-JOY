/** [LAYER: PLUMBING] */
/**
 * Minimal FIFO async mutex. Instance state is private to each mutex; the module
 * itself holds no mutable top-level bindings.
 */
export class AsyncMutex {
  #queue = [];
  #locked = false;

  /**
   * Acquires the lock, resolving to an idempotent release function.
   * @returns {Promise<() => void>}
   */
  acquire() {
    const makeRelease = () => {
      let released = false;
      return () => {
        if (released) return;
        released = true;
        this.#release();
      };
    };
    if (!this.#locked) {
      this.#locked = true;
      return Promise.resolve(makeRelease());
    }
    return new Promise((resolve) => this.#queue.push(() => resolve(makeRelease())));
  }

  /**
   * Runs `fn` while holding the lock.
   * @template T
   * @param {() => Promise<T> | T} fn
   * @returns {Promise<T>}
   */
  async runExclusive(fn) {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }

  #release() {
    const next = this.#queue.shift();
    if (next) next();
    else this.#locked = false;
  }
}
