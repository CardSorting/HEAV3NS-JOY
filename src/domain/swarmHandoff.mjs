/** [LAYER: DOMAIN] */
import { utf8ByteLength } from "../plumbing/canonicalHash.mjs";
/** Escape untrusted specialist text while keeping the enclosing handoff intact. */
export function escapeSwarmHandoffText(value, maxCharacters = 11_000) {
    let output = "";
    for (const character of value) {
        const escaped = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[character] ??
            character;
        if (output.length + escaped.length > maxCharacters)
            break;
        output += escaped;
    }
    return output;
}
const TRUNCATION_NOTICE = "\n[report truncated]";
/** Escape untrusted handoff text and cap its encoded size without splitting Unicode characters. */
export function formatLegionHandoffText(value, maxBytes = 12_000) {
    const limit = Math.max(0, Math.floor(maxBytes));
    const noticeBytes = utf8ByteLength(TRUNCATION_NOTICE);
    const escaped = escapeSwarmHandoffText(value, Number.MAX_SAFE_INTEGER);
    if (utf8ByteLength(escaped) <= limit)
        return escaped;
    if (limit < noticeBytes) {
        let suffix = "";
        for (const character of TRUNCATION_NOTICE) {
            if (utf8ByteLength(suffix + character) > limit)
                break;
            suffix += character;
        }
        return suffix;
    }
    const budget = limit - noticeBytes;
    let low = 0;
    let high = escaped.length;
    while (low < high) {
        const middle = Math.ceil((low + high) / 2);
        const safeEnd = middle > 0 && /[\uD800-\uDBFF]/.test(escaped[middle - 1]) ? middle - 1 : middle;
        if (utf8ByteLength(escaped.slice(0, safeEnd)) <= budget)
            low = middle;
        else
            high = middle - 1;
    }
    let end = low;
    if (end > 0 && /[\uD800-\uDBFF]/.test(escaped[end - 1]))
        end--;
    while (end > 0 && utf8ByteLength(escaped.slice(0, end)) > budget)
        end--;
    return `${escaped.slice(0, end)}${TRUNCATION_NOTICE}`;
}
export function legionHandoffStatus(status) {
    return /^[a-z_]{1,40}$/.test(status) ? status : "unknown";
}
