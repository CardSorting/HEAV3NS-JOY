/** [LAYER: DOMAIN] */
/**
 * Contractual Sovereignty interface (`ISwarmLeaseService`) for fenced, renewable
 * leases that give a single Legion formation exclusive ownership of a resource.
 * Concrete adapters live in `src/infrastructure/` (`InMemorySwarmLeaseService`).
 */

/**
 * @typedef {Object} SwarmDurableLease
 * @property {string} resource
 * @property {string} ownerId
 * @property {number} expiresAt - epoch milliseconds
 * @property {number} createdAt - epoch milliseconds
 * @property {string} leaseEpoch - monotonic decimal string, bumped on each takeover
 * @property {string} fencingToken - monotonic decimal string, bumped on each grant/renewal
 */

export class ISwarmLeaseService {
  /**
   * Acquires a lease or rejects if another live owner holds it.
   * @param {string} _resourceKey
   * @param {string} _ownerId
   * @param {number} [_timeoutMs]
   * @returns {Promise<SwarmDurableLease>}
   */
  async acquireLease(_resourceKey, _ownerId, _timeoutMs) {
    throw new Error("ISwarmLeaseService.acquireLease must be implemented by an Infrastructure adapter.");
  }

  /**
   * Rejects unless `lease` is still the current, unexpired lease for its resource.
   * @param {SwarmDurableLease} _lease
   * @returns {Promise<SwarmDurableLease>}
   */
  async assertLease(_lease) {
    throw new Error("ISwarmLeaseService.assertLease must be implemented by an Infrastructure adapter.");
  }

  /**
   * Extends a live lease, rejecting if ownership was lost.
   * @param {SwarmDurableLease} _lease
   * @param {number} [_timeoutMs]
   * @returns {Promise<SwarmDurableLease>}
   */
  async renewLease(_lease, _timeoutMs) {
    throw new Error("ISwarmLeaseService.renewLease must be implemented by an Infrastructure adapter.");
  }

  /**
   * Releases a lease when the epoch and fencing token still match.
   * @param {string} _resourceKey
   * @param {string} _ownerId
   * @param {string} _leaseEpoch
   * @param {string} _fencingToken
   * @returns {Promise<boolean>}
   */
  async release(_resourceKey, _ownerId, _leaseEpoch, _fencingToken) {
    throw new Error("ISwarmLeaseService.release must be implemented by an Infrastructure adapter.");
  }
}
