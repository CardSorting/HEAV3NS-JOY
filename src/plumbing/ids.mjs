/** [LAYER: PLUMBING] */
/**
 * Stateless identifier helpers built on the Web Crypto global (`globalThis.crypto`),
 * so DOMAIN and CORE modules can mint unique IDs without importing Node built-ins.
 */

/**
 * Returns an RFC 4122 v4 UUID using Web Crypto when available (Node >= 19, all
 * modern runtimes) and a `getRandomValues`/`Math.random` fallback otherwise.
 *
 * @returns {string}
 */
export function newUuid() {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === "function") {
    return webCrypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  if (webCrypto && typeof webCrypto.getRandomValues === "function") {
    webCrypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
