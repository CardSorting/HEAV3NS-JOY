/** [LAYER: UI] */
/**
 * Presentation layer (`OrderReceiptPresenter`).
 * Routes user intent through `CheckoutController` (`core`) and formats output.
 * Never imports directly from `infrastructure`.
 */

import { CheckoutController } from "../core/CheckoutController.mjs";

export class OrderReceiptPresenter {
  /**
   * @param {CheckoutController} controller
   */
  constructor(controller) {
    if (!(controller instanceof CheckoutController)) {
      throw new TypeError("OrderReceiptPresenter requires a CheckoutController instance.");
    }
    this.controller = controller;
  }

  async submitAndFormatReceipt(orderInput) {
    const summary = await this.controller.placeOrder(orderInput);
    const dollars = (summary.totalCents / 100).toFixed(2);
    return `Order #${summary.id} [${summary.customerTier}] (${summary.itemCount} items) — Total: $${dollars}`;
  }
}

