/** [LAYER: CORE] */
/**
 * Process-local `ISwarmLeaseService`: fenced, renewable leases held in memory. Safe for a
 * single Node process (the same trust boundary as BroccoliQueue and BufferedDb); swap in
 * a database-backed implementation of the interface for multi-process coordination.
 */

import { ISwarmLeaseService } from "../domain/interfaces/ISwarmLeaseService.mjs";

export class InMemorySwarmLeaseService extends ISwarmLeaseService {
  #leases = new Map();
  #epoch = 0n;
  #fence = 0n;
  #now;

  /** @param {{ now?: () => number }} [options] injectable clock for deterministic tests */
  constructor(options = {}) {
    super();
    this.#now = options.now ?? Date.now;
  }

  async acquireLease(resourceKey, ownerId, timeoutMs = 300_000) {
    const now = this.#now();
    const existing = this.#leases.get(resourceKey);
    if (existing && existing.expiresAt > now) {
      throw new Error(`SWARM_LEASE_BUSY: resource '${resourceKey}' is held by '${existing.ownerId}'`);
    }
    this.#epoch += 1n;
    this.#fence += 1n;
    const lease = {
      resource: resourceKey,
      ownerId,
      expiresAt: now + timeoutMs,
      createdAt: now,
      leaseEpoch: String(this.#epoch),
      fencingToken: String(this.#fence)
    };
    this.#leases.set(resourceKey, lease);
    return { ...lease };
  }

  async assertLease(lease) {
    const current = this.#leases.get(lease.resource);
    if (!current || current.ownerId !== lease.ownerId || current.leaseEpoch !== lease.leaseEpoch || current.fencingToken !== lease.fencingToken) {
      throw new Error(`SWARM_LEASE_LOST: lease for '${lease.resource}' is no longer held by '${lease.ownerId}'`);
    }
    if (current.expiresAt <= this.#now()) {
      throw new Error(`SWARM_LEASE_EXPIRED: lease for '${lease.resource}' expired`);
    }
    return { ...current };
  }

  async renewLease(lease, timeoutMs = 60_000) {
    await this.assertLease(lease);
    // Renewal extends the same grant: epoch and fencing token only rotate on a new acquisition.
    const renewed = { ...this.#leases.get(lease.resource), expiresAt: this.#now() + timeoutMs };
    this.#leases.set(lease.resource, renewed);
    return { ...renewed };
  }

  async release(resourceKey, ownerId, leaseEpoch, fencingToken) {
    const current = this.#leases.get(resourceKey);
    if (!current || current.ownerId !== ownerId || current.leaseEpoch !== leaseEpoch || current.fencingToken !== fencingToken) return false;
    this.#leases.delete(resourceKey);
    return true;
  }
}
