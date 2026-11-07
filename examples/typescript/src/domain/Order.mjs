/** [LAYER: DOMAIN] */
/**
 * Pure Domain entity and pricing policy.
 * 0% I/O Entropy: imports only from `plumbing`.
 */

import { roundCurrency, applyBasisPointsDiscount } from "../plumbing/currencyMath.mjs";

export class Order {
  /**
   * @param {Object} params
   * @param {string} params.id
   * @param {Array<{ sku: string, unitPriceCents: number, quantity: number }>} params.items
   * @param {string} [params.customerTier]
   */
  constructor({ id, items, customerTier = "STANDARD" }) {
    if (!id || typeof id !== "string") {
      throw new Error("Order requires a non-empty string id.");
    }
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("Order must contain at least one line item.");
    }
    this.id = id;
    this.items = items;
    this.customerTier = customerTier;
  }

  computeTotalCents() {
    let subtotal = 0;
    for (const item of this.items) {
      if (item.quantity > 0 && item.unitPriceCents >= 0) {
        subtotal += roundCurrency(item.unitPriceCents * item.quantity);
      }
    }
    if (this.customerTier === "VIP" && subtotal >= 10000) {
      return applyBasisPointsDiscount(subtotal, 1000); // 10% VIP discount
    }
    if (subtotal >= 25000) {
      return applyBasisPointsDiscount(subtotal, 500); // 5% bulk discount
    }
    return subtotal;
  }
}

