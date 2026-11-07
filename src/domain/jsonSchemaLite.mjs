/** [LAYER: DOMAIN] */
/**
 * Minimal, dependency-free JSON Schema validator for MCP tool arguments. Supports the subset the
 * tool catalog uses: `type` (object, string, integer, number, boolean, array), `enum`, `minimum`,
 * `maximum`, `minLength`, `maxLength`, `pattern`, `items`, `maxItems`, `required`, and
 * `additionalProperties: false`. Unknown schema keywords are ignored.
 *
 * @returns {string[]} human-readable problems; empty when `value` is valid
 */
export function validateAgainstSchema(schema, value, path = "arguments") {
  const problems = [];
  const type = schema.type;
  const describe = (v) => (v === null ? "null" : Array.isArray(v) ? "array" : typeof v);
  if (type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) return [`${path} must be an object, got ${describe(value)}`];
    for (const key of schema.required ?? []) if (value[key] === undefined) problems.push(`${path}.${key} is required`);
    const props = schema.properties ?? {};
    for (const [key, v] of Object.entries(value)) {
      if (props[key]) problems.push(...validateAgainstSchema(props[key], v, `${path}.${key}`));
      else if (schema.additionalProperties === false) problems.push(`${path}.${key} is not a recognized argument (allowed: ${Object.keys(props).join(", ")})`);
    }
    return problems;
  }
  if (type === "array") {
    if (!Array.isArray(value)) return [`${path} must be an array, got ${describe(value)}`];
    if (schema.maxItems !== undefined && value.length > schema.maxItems) problems.push(`${path} may contain at most ${schema.maxItems} items`);
    if (schema.items) value.forEach((item, i) => problems.push(...validateAgainstSchema(schema.items, item, `${path}[${i}]`)));
    return problems;
  }
  if (type === "string") {
    if (typeof value !== "string") return [`${path} must be a string, got ${describe(value)}`];
    if (schema.minLength !== undefined && value.length < schema.minLength) problems.push(`${path} must be at least ${schema.minLength} characters`);
    if (schema.maxLength !== undefined && value.length > schema.maxLength) problems.push(`${path} must be at most ${schema.maxLength} characters`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) problems.push(`${path} has an invalid format`);
  } else if (type === "integer" || type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value) || (type === "integer" && !Number.isInteger(value))) return [`${path} must be ${type === "integer" ? "an integer" : "a number"}, got ${describe(value)}`];
    if (schema.minimum !== undefined && value < schema.minimum) problems.push(`${path} must be >= ${schema.minimum}`);
    if (schema.maximum !== undefined && value > schema.maximum) problems.push(`${path} must be <= ${schema.maximum}`);
  } else if (type === "boolean") {
    if (typeof value !== "boolean") return [`${path} must be a boolean, got ${describe(value)}`];
  }
  if (schema.enum && !schema.enum.includes(value)) problems.push(`${path} must be one of ${schema.enum.join(", ")}`);
  return problems;
}
