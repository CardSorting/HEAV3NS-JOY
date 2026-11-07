/** [LAYER: DOMAIN] */
/**
 * Contractual Sovereignty interface (`IOrderRepository`) decoupling Core use-cases
 * from concrete Infrastructure persistence.
 */

export class IOrderRepository {
  /**
   * @param {string} _orderId
   * @returns {Promise<Object|null>}
   */
  async findById(_orderId) {
    throw new Error("IOrderRepository.findById must be implemented by Infrastructure.");
  }

  /**
   * @param {Object} _order
   * @returns {Promise<void>}
   */
  async save(_order) {
    throw new Error("IOrderRepository.save must be implemented by Infrastructure.");
  }
}

