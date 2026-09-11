// Structural SlideSpec validator derived from slide-spec/schema.json (no ajv dependency).
// Recursively enforces required fields, enums, types and minItems for each slide's data,
// plus per-template conditional-required fields. Catches "silently empty/broken slide" gaps.
// Usage: node scripts/validate_spec.mjs <spec.json>   (exit 1 on any error)
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const specArg = process.argv[2];
if (!specArg) {
  console.error("usage: node scripts/validate_spec.mjs <spec.json>");
  process.exit(2);
}

const schema = JSON.parse(await fs.readFile(path.resolve(root, "slide-spec/schema.json"), "utf8"));
const spec = JSON.parse(await fs.readFile(path.resolve(root, specArg), "utf8"));

const defs = schema.$defs;
const slideDef = defs.slide;
const slideProps = slideDef.properties;
const templateEnum = new Set(slideProps.template.enum);

const conditionalRequired = new Map();
for (const clause of slideDef.allOf || []) {
  const tmpl = clause?.if?.properties?.template?.const;
  const req = clause?.then?.required || [];
  if (tmpl && req.length) conditionalRequired.set(tmpl, req);
}

const errors = [];

function isEmpty(v) {
  if (v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  if (typeof v === "string") return v.trim() === "";
  return false;
}

const resolve = (node) => (node && node.$ref ? defs[node.$ref.split("/").pop()] : node);

// Recursively validate a value against a schema node.
function validate(value, node, label) {
  node = resolve(node);
  if (!node || value === undefined) return;
  if (node.enum && !node.enum.includes(value)) {
    errors.push(`${label}: must be one of [${node.enum.join(", ")}], got ${JSON.stringify(value)}`);
  }
  if (node.type === "string") {
    if (typeof value !== "string") errors.push(`${label}: expected string, got ${typeof value}`);
    else if (node.minLength && value.length < node.minLength) errors.push(`${label}: shorter than minLength ${node.minLength}`);
  } else if (node.type === "number" || node.type === "integer") {
    if (typeof value !== "number" || Number.isNaN(value)) {
      errors.push(`${label}: expected ${node.type}, got ${typeof value}`);
    } else {
      if (node.type === "integer" && !Number.isInteger(value)) errors.push(`${label}: expected integer, got ${value}`);
      if (node.minimum != null && value < node.minimum) errors.push(`${label}: ${value} is below minimum ${node.minimum}`);
      if (node.exclusiveMinimum != null && value <= node.exclusiveMinimum) errors.push(`${label}: ${value} must be greater than ${node.exclusiveMinimum}`);
      if (node.maximum != null && value > node.maximum) errors.push(`${label}: ${value} is above maximum ${node.maximum}`);
    }
  } else if (node.type === "boolean") {
    if (typeof value !== "boolean") errors.push(`${label}: expected boolean`);
  } else if (node.type === "object" || node.properties) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${label}: expected an object`);
      return;
    }
    // Schema-faithful presence check; emptiness is enforced via minItems/minLength where declared.
    for (const key of node.required || []) {
      if (value[key] === undefined) errors.push(`${label}.${key}: required but missing`);
    }
    for (const [key, sub] of Object.entries(node.properties || {})) {
      if (value[key] !== undefined) validate(value[key], sub, `${label}.${key}`);
    }
  } else if (node.type === "array" || node.items) {
    if (!Array.isArray(value)) {
      errors.push(`${label}: expected an array`);
      return;
    }
    if (node.minItems && value.length < node.minItems) errors.push(`${label}: needs at least ${node.minItems} items (has ${value.length})`);
    if (node.maxItems && value.length > node.maxItems) errors.push(`${label}: more than maxItems ${node.maxItems} (has ${value.length})`);
    if (node.items) value.forEach((item, i) => validate(item, node.items, `${label}[${i}]`));
  }
}

if (!spec.deckTitle || !Array.isArray(spec.slides) || spec.slides.length === 0) {
  errors.push("deck: requires a non-empty deckTitle and a non-empty slides array");
}

(spec.slides || []).forEach((slide, i) => {
  const at = `slide ${i + 1}`;
  if (!slide.template || !templateEnum.has(slide.template)) {
    errors.push(`${at}: template ${JSON.stringify(slide.template)} is not in the schema enum`);
    return;
  }
  if (isEmpty(slide.title)) errors.push(`${at}: title is required`);
  for (const field of conditionalRequired.get(slide.template) || []) {
    if (isEmpty(slide[field])) {
      errors.push(`${at}: template "${slide.template}" requires field "${field}" but it is missing/empty`);
    }
  }
  // Deep-validate every present, schema-known field.
  for (const [field, sub] of Object.entries(slideProps)) {
    if (field === "template") continue;
    if (slide[field] !== undefined) validate(slide[field], sub, `${at}.${field}`);
  }
  // Cross-field rules JSON Schema can't express: gantt elements must fit the period grid.
  if (slide.template === "gantt" && slide.gantt) {
    const cols = (slide.gantt.periods || []).length;
    (slide.gantt.rows || []).forEach((r, ri) => {
      if (typeof r.start === "number" && typeof r.span === "number" && r.start + r.span > cols) {
        errors.push(`${at}: gantt row ${ri + 1} ("${r.label}") runs past the period grid (start ${r.start} + span ${r.span} > ${cols} periods)`);
      }
    });
    (slide.gantt.milestones || []).forEach((m, mi) => {
      if (typeof m.at === "number" && m.at >= cols) {
        errors.push(`${at}: gantt milestone ${mi + 1} ("${m.label}") is at column ${m.at} but there are only ${cols} periods`);
      }
    });
    const bands = slide.gantt.periodBands || [];
    if (bands.length) {
      const sum = bands.reduce((a, b) => a + (b.span || 0), 0);
      if (sum !== cols) errors.push(`${at}: gantt periodBands spans sum to ${sum} but must equal the ${cols} periods`);
    }
  }
  // chevron_value_chain: rails and attributes must share a canonical step count
  if (slide.template === "chevron_value_chain" && slide.valueChain) {
    const rails = slide.valueChain.rails || [];
    const canonical = (rails[0] && rails[0].steps || []).length;
    if (canonical > 7) errors.push(`${at}: chevron_value_chain supports at most 7 stages (has ${canonical})`);
    rails.forEach((rail, ri) => {
      const n = (rail.steps || []).length;
      if (n !== canonical) errors.push(`${at}: rail ${ri + 1} has ${n} steps but the first rail has ${canonical}`);
    });
    (slide.valueChain.attributes || []).forEach((a, ai) => {
      const n = (a.values || []).length;
      if (n !== canonical) errors.push(`${at}: attribute "${a.label}" (row ${ai + 1}) has ${n} values but stage count is ${canonical}`);
    });
  }
  // horizontal_axis_table: row cells must match headers count; weights length must match; dotColumn in range
  if (slide.template === "horizontal_axis_table" && slide.axis) {
    const cols = (slide.axis.headers || []).length;
    (slide.axis.rows || []).forEach((row, ri) => {
      const cellLen = (row.cells || []).length;
      if (cellLen !== cols) errors.push(`${at}: axis row ${ri + 1} has ${cellLen} cells but headers count is ${cols}`);
    });
    if (Array.isArray(slide.axis.weights) && slide.axis.weights.length !== cols) {
      errors.push(`${at}: axis.weights length ${slide.axis.weights.length} must equal headers count ${cols}`);
    }
    if (typeof slide.axis.dotColumn === "number" && slide.axis.dotColumn >= cols) {
      errors.push(`${at}: axis.dotColumn ${slide.axis.dotColumn} must be < headers count ${cols}`);
    }
  }
});

if (errors.length) {
  console.error(`SlideSpec validation failed for ${specArg}:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`ok: ${specArg} (${spec.slides.length} slides) passes schema-derived validation`);
