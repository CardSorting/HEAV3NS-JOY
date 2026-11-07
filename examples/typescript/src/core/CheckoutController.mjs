/** [LAYER: CORE] */
/**
 * Application use-case orchestrator (`CheckoutController`).
 * Coordinates `Order` (`domain`) and `IOrderRepository` (`domain/interfaces/`).
 * Never imports `ui` or concrete `infrastructure` implementations.
 */

import { Order } from "../domain/Order.mjs";
import { IOrderRepository } from "../domain/interfaces/IOrderRepository.mjs";

export class CheckoutController {
  /**
   * @param {IOrderRepository} orderRepository
   */
  constructor(orderRepository) {
    if (!(orderRepository instanceof IOrderRepository)) {
      throw new Error("CheckoutController requires a valid IOrderRepository contract.");
    }
    this.orderRepository = orderRepository;
  }

  /**
   * Places an order, computes domain pricing, persists via the repository contract,
   * and returns a plain DTO for presentation layers.
   */
  async placeOrder({ id, items, customerTier }) {
    const order = new Order({ id, items, customerTier });
    const totalCents = order.computeTotalCents();
    const record = {
      id: order.id,
      customerTier: order.customerTier,
      itemCount: order.items.length,
      totalCents
    };
    await this.orderRepository.save(record);
    return record;
  }
}

