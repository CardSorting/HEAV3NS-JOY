/** [LAYER: UI] */
/**
 * Composition Root wiring `InMemoryOrderRepository` (`infrastructure`) into
 * `CheckoutController` (`core`) and `OrderReceiptPresenter` (`ui`).
 */

import { InMemoryOrderRepository } from "./infrastructure/InMemoryOrderRepository.mjs";
import { CheckoutController } from "./core/CheckoutController.mjs";
import { OrderReceiptPresenter } from "./ui/OrderReceiptPresenter.mjs";

export function createCheckoutApp() {
  const repository = new InMemoryOrderRepository();
  const controller = new CheckoutController(repository);
  const presenter = new OrderReceiptPresenter(controller);
  return { repository, controller, presenter };
}

