/** [LAYER: PLUMBING] */
/**
 * Pure, stateless canonical serialization, FIPS 180-4 SHA-256 hashing,
 * head/tail command output summarization, and structural AST skeletonization.
 *
 * Zero external or Node built-in dependencies (`ioEntropy = 0.0000`).
 */

const SHA256_K = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
]);

const SHA256_H0 = Object.freeze([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
]);

const UTF8_ENCODER = new TextEncoder();

function rotr(n, x) {
  return (x >>> n) | (x << (32 - n));
}

/**
 * Computes a standard FIPS 180-4 SHA-256 hex digest with zero Node I/O imports.
 *
 * @param {string | Uint8Array} input
 * @returns {string} 64-character lowercase hexadecimal SHA-256 digest
 */
export function sha256Hex(input) {
  const bytes = typeof input === 'string'
    ? UTF8_ENCODER.encode(input)
    : (input instanceof Uint8Array ? input : UTF8_ENCODER.encode(String(input ?? '')));

  const bitLenHi = Math.floor((bytes.length * 8) / 0x100000000);
  const bitLenLo = (bytes.length * 8) >>> 0;

  const totalLen = (((bytes.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(totalLen);
  padded.set(bytes, 0);
  padded[bytes.length] = 0x80;

  const view = new DataView(padded.buffer);
  view.setUint32(totalLen - 8, bitLenHi, false);
  view.setUint32(totalLen - 4, bitLenLo, false);

  let h0 = SHA256_H0[0];
  let h1 = SHA256_H0[1];
  let h2 = SHA256_H0[2];
  let h3 = SHA256_H0[3];
  let h4 = SHA256_H0[4];
  let h5 = SHA256_H0[5];
  let h6 = SHA256_H0[6];
  let h7 = SHA256_H0[7];

  const w = new Uint32Array(64);

  for (let offset = 0; offset < totalLen; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const s0 = rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3);
      const s1 = rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i += 1) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => (word >>> 0).toString(16).padStart(8, '0'))
    .join('');
}

/**
 * Recursively normalizes an arbitrary JS value into a deterministic structure:
 * - Objects have keys sorted lexicographically
 * - Circular references resolve to `"[Circular]"`
 * - `BigInt` values serialize as `"<n>n"`
 * - `undefined`, functions, and symbols normalize to `null`
 *
 * @param {any} value
 * @param {WeakSet<object>} [seen]
 * @returns {any}
 */
export function normalizeForHash(value, seen = new WeakSet()) {
  if (value === null || typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? 'InvalidDate' : value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeForHash(item, seen));
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);
    const out = {};
    for (const key of Object.keys(value).sort()) {
      const normalized = normalizeForHash(value[key], seen);
      if (normalized !== undefined) {
        out[key] = normalized;
      }
    }
    seen.delete(value);
    return out;
  }
  return String(value);
}

/**
 * Deterministically stringifies any value with sorted keys and circular reference safety.
 *
 * @param {any} value
 * @returns {string}
 */
export function stableStringify(value) {
  return JSON.stringify(normalizeForHash(value));
}

/**
 * Computes a deterministic SHA-256 fingerprint (default 24 hex chars, configurable)
 * for any structured value.
 *
 * @param {any} value
 * @param {number} [length=24]
 * @returns {string}
 */
export function computeDeterministicFingerprint(value, length = 24) {
  const digest = sha256Hex(stableStringify(value));
  return length > 0 && length < 64 ? digest.slice(0, length) : digest;
}

/**
 * Computes UTF-8 byte length of a string without Node `Buffer`.
 *
 * @param {string} text
 * @returns {number}
 */
export function utf8ByteLength(text) {
  return UTF8_ENCODER.encode(String(text ?? '')).byteLength;
}

/**
 * Summarizes long command output using LUMI JoyRide's 65% head / 35% tail windowing
 * while preserving exact character and UTF-8 byte metrics.
 *
 * @param {string} output
 * @param {number} [maxChars=1600]
 * @returns {{ summary: string, truncated: boolean, totalChars: number, totalBytes: number }}
 */
export function summarizeCommandOutput(output, maxChars = 1600) {
  const normalized = String(output ?? '');
  const totalChars = normalized.length;
  const totalBytes = utf8ByteLength(normalized);

  if (totalChars <= maxChars || maxChars <= 0) {
    return {
      summary: normalized,
      truncated: false,
      totalChars,
      totalBytes
    };
  }

  const headBudget = Math.max(120, Math.floor(maxChars * 0.65));
  const tailBudget = Math.max(80, maxChars - headBudget);
  const head = normalized.slice(0, headBudget).trimEnd();
  const tail = normalized.slice(Math.max(headBudget, totalChars - tailBudget)).trimStart();
  const omittedChars = Math.max(0, totalChars - head.length - tail.length);

  return {
    summary: `${head}\n... [truncated ${omittedChars} chars] ...\n${tail}`,
    truncated: true,
    totalChars,
    totalBytes
  };
}

/**
 * Normalizes source code into a canonical token stream for semantic footprinting
 * (strips comments and collapses whitespace so formatting/comment edits do not alter the hash).
 *
 * @param {string} source
 * @returns {string}
 */
export function normalizeAstTokens(source) {
  const raw = String(source ?? '');
  const withoutBlockComments = raw.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const withoutLineComments = withoutBlockComments.replace(/\/\/.*$/gm, ' ');
  return withoutLineComments.replace(/\s+/g, ' ').trim();
}

/**
 * Extracts exported symbol signatures (`function`, `class`, `interface`, `type`, `const`)
 * and their normalized body hashes for Spider Semantic Footprinting (`FootprintEngine`).
 *
 * @param {string} source
 * @param {string} [filePath='']
 * @returns {Array<{
 *   symbolName: string,
 *   kind: string,
 *   filePath: string,
 *   signature: string,
 *   signatureHash: string,
 *   astNormalizedHash: string,
 *   line: number
 * }>}
 */
export function extractSymbolFootprints(source, filePath = '') {
  const lines = String(source ?? '').split(/\r?\n/);
  const footprints = [];
  const declRegex = /^\s*export\s+(?:default\s+)?(?:async\s+)?(function|class|interface|type|const|let|enum)\s+([A-Za-z0-9_$]+)/;

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const match = line.match(declRegex);
    if (!match) continue;

    const kind = match[1];
    const symbolName = match[2];
    const signature = line.trim().replace(/\{$/, '').trim();

    // Capture block body if brace-delimited, or statement lines
    let braceDepth = 0;
    let startedBlock = false;
    const bodyLines = [];
    for (let j = i; j < lines.length && j < i + 250; j += 1) {
      const current = lines[j];
      bodyLines.push(current);
      for (let c = 0; c < current.length; c += 1) {
        const ch = current[c];
        if (ch === '{') {
          braceDepth += 1;
          startedBlock = true;
        } else if (ch === '}') {
          braceDepth -= 1;
        }
      }
      if (startedBlock && braceDepth <= 0) break;
      if (!startedBlock && (current.trim().endsWith(';') || j > i + 3)) break;
    }

    const normalizedBody = normalizeAstTokens(bodyLines.join('\n'));
    const normalizedSig = normalizeAstTokens(signature);

    footprints.push({
      symbolName,
      kind,
      filePath,
      signature,
      signatureHash: sha256Hex(normalizedSig).slice(0, 16),
      astNormalizedHash: sha256Hex(normalizedBody).slice(0, 16),
      line: i + 1
    });
  }

  return footprints;
}

/**
 * Structural AST / Lexical Skeletonizer (LUMI Benchmark Category 4: Structural AST Distillation).
 * Distills a source module into its `[LAYER]` header, imports/exports, class/interface/type
 * declarations, and function/method signatures while eliding implementation bodies into `{ /* ... * / }`.
 *
 * Optionally preserves the full implementation of `keepSymbol` (e.g., the active function/method being edited).
 *
 * @param {string} source
 * @param {object} [options]
 * @param {string} [options.keepSymbol] - Optional symbol/method name whose body should remain intact
 * @returns {{
 *   skeleton: string,
 *   originalBytes: number,
 *   skeletonBytes: number,
 *   reductionRatio: number,
 *   preservedSymbols: string[]
 * }}
 */
export function distillSourceSkeleton(source, options = {}) {
  const raw = String(source ?? '');
  const keepSymbol = options.keepSymbol ? String(options.keepSymbol).trim() : null;
  const lines = raw.split(/\r?\n/);
  const output = [];
  const preservedSymbols = [];

  let i = 0;
  // Preserve leading [LAYER] header, shebang, and module docblock
  while (i < lines.length && i < 15) {
    const trimmed = lines[i].trim();
    if (
      trimmed.startsWith('#!') ||
      trimmed.includes('[LAYER:') ||
      trimmed.startsWith('/**') ||
      trimmed.startsWith('*') ||
      trimmed.startsWith('*/') ||
      trimmed === ''
    ) {
      output.push(lines[i]);
      i += 1;
    } else {
      break;
    }
  }

  const countBraces = (str) => {
    let open = 0;
    let close = 0;
    let inSingle = false;
    let inDouble = false;
    let inTemplate = false;
    for (let k = 0; k < str.length; k += 1) {
      const ch = str[k];
      const prev = k > 0 ? str[k - 1] : '';
      if (prev === '\\') continue;
      if (!inDouble && !inTemplate && ch === "'") inSingle = !inSingle;
      else if (!inSingle && !inTemplate && ch === '"') inDouble = !inDouble;
      else if (!inSingle && !inDouble && ch === '`') inTemplate = !inTemplate;
      if (inSingle || inDouble || inTemplate) continue;
      if (ch === '/' && str[k + 1] === '/') break;
      if (ch === '{') open += 1;
      else if (ch === '}') close += 1;
    }
    return { open, close, delta: open - close };
  };

  let inClassDepth = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      if (output.length > 0 && output[output.length - 1] !== '') {
        output.push('');
      }
      i += 1;
      continue;
    }

    // Keep imports and re-exports intact
    if (/^(import|export\s+\*|export\s+\{)/.test(trimmed)) {
      output.push(line);
      while (i < lines.length && !lines[i].includes(';') && !lines[i].includes('from ') && i + 1 < lines.length) {
        i += 1;
        output.push(lines[i]);
        if (lines[i].includes('from ') || lines[i].includes(';')) break;
      }
      i += 1;
      continue;
    }

    // Keep class / interface / type header declarations and step inside class body to keep method signatures
    const classMatch = trimmed.match(/^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?(class|interface)\s+([A-Za-z0-9_$]+)/);
    if (classMatch) {
      preservedSymbols.push(classMatch[2]);
      output.push(line);
      const { delta } = countBraces(line);
      inClassDepth += delta;
      i += 1;
      continue;
    }

    if (inClassDepth > 0 && trimmed === '}') {
      inClassDepth = Math.max(0, inClassDepth - 1);
      output.push(line);
      i += 1;
      continue;
    }

    // Detect function or class method definitions (single-line or multi-line parameter lists)
    const fnMatch = trimmed.match(
      /^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/
    );
    const methodMatch =
      inClassDepth > 0
        ? trimmed.match(
            /^(?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:async\s+)?([A-Za-z0-9_$#]+)\s*\(/
          )
        : null;
    const constFnMatch = trimmed.match(
      /^(?:export\s+)?const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z0-9_$]+)\s*=>\s*\{/
    );

    const matchedSymbol =
      fnMatch?.[1] || methodMatch?.[1] || constFnMatch?.[1] || null;
    const isControlKeyword =
      matchedSymbol &&
      ['if', 'for', 'while', 'switch', 'catch', 'try', 'return', 'super', 'new'].includes(
        matchedSymbol
      );

    if (matchedSymbol && !isControlKeyword) {
      preservedSymbols.push(matchedSymbol);
      // Accumulate signature lines until opening `{`
      let sigLines = [line];
      let braceState = countBraces(line);
      while (braceState.open === 0 && i + 1 < lines.length) {
        i += 1;
        sigLines.push(lines[i]);
        const nextBrace = countBraces(lines[i]);
        braceState = {
          open: braceState.open + nextBrace.open,
          close: braceState.close + nextBrace.close,
          delta: braceState.delta + nextBrace.delta
        };
        if (lines[i].includes(';')) break;
      }

      if (keepSymbol && matchedSymbol === keepSymbol) {
        // Keep full body of the active symbol
        for (const sLine of sigLines) output.push(sLine);
        let depth = braceState.delta;
        while (depth > 0 && i + 1 < lines.length) {
          i += 1;
          output.push(lines[i]);
          depth += countBraces(lines[i]).delta;
        }
        i += 1;
        continue;
      }

      if (braceState.open > 0) {
        const joinedSig = sigLines.join('\n');
        const openBraceIdx = joinedSig.indexOf('{');
        const cleanHeader = openBraceIdx >= 0 ? joinedSig.slice(0, openBraceIdx).trimEnd() : joinedSig;
        output.push(`${cleanHeader} { /* ... */ }`);

        let depth = braceState.delta;
        while (depth > 0 && i + 1 < lines.length) {
          i += 1;
          depth += countBraces(lines[i]).delta;
        }
        i += 1;
        continue;
      }
    }

    // Top-level exported constants or types
    if (/^export\s+(const|let|type|enum)\s+([A-Za-z0-9_$]+)/.test(trimmed)) {
      const m = trimmed.match(/^export\s+(?:const|let|type|enum)\s+([A-Za-z0-9_$]+)/);
      if (m) preservedSymbols.push(m[1]);
      const { delta } = countBraces(line);
      if (delta > 0) {
        const prefix = line.slice(0, line.indexOf('{')).trimEnd();
        output.push(`${prefix} { /* ... */ };`);
        let depth = delta;
        while (depth > 0 && i + 1 < lines.length) {
          i += 1;
          depth += countBraces(lines[i]).delta;
        }
        i += 1;
        continue;
      }
      output.push(line);
      i += 1;
      continue;
    }

    i += 1;
  }

  const skeleton = output.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  const originalBytes = utf8ByteLength(raw);
  const skeletonBytes = utf8ByteLength(skeleton);
  const reductionRatio = originalBytes > 0
    ? Number(Math.max(0, (originalBytes - skeletonBytes) / originalBytes).toFixed(4))
    : 0;

  return {
    skeleton,
    originalBytes,
    skeletonBytes,
    reductionRatio,
    preservedSymbols
  };
}

