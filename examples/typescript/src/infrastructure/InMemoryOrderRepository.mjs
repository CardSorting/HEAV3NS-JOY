/** [LAYER: INFRASTRUCTURE] */
/**
 * Concrete persistence adapter implementing `IOrderRepository` from `domain/interfaces/`.
 * Notice it imports only the contract from `domain/interfaces/IOrderRepository.mjs`, never concrete `Order.mjs` or `ui`.
 */

import { IOrderRepository } from "../domain/interfaces/IOrderRepository.mjs";

export class InMemoryOrderRepository extends IOrderRepository {
  constructor() {
    super();
    this.store = new Map();
  }

  async findById(orderId) {
    return this.store.get(orderId) || null;
  }

  async save(orderSnapshot) {
    this.store.set(orderSnapshot.id, orderSnapshot);
  }

  async dispose() {
    this.store.clear();
  }
}

