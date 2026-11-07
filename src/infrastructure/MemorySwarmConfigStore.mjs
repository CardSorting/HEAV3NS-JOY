/** [LAYER: INFRASTRUCTURE] */
/** Volatile `ISwarmConfigStore` for tests and embedded hosts. */

import { ISwarmConfigStore } from "../domain/interfaces/ISwarmConfigStore.mjs";

export class MemorySwarmConfigStore extends ISwarmConfigStore {
  #document;

  /** @param {unknown} [initial] */
  constructor(initial) {
    super();
    this.#document = initial;
  }

  async read() {
    return this.#document === undefined ? undefined : structuredClone(this.#document);
  }

  async write(document) {
    this.#document = structuredClone(document);
  }
}
