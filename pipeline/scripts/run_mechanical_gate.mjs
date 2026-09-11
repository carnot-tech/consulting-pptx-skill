// run_mechanical_gate.mjs — the single Mechanical Quality Gate entry point.
//
// Composes every DETERMINISTIC check this pipeline has, in the order the target
// architecture runs them, and reduces them to one pass/fail verdict with one combined,
// machine-readable error/warning list. Nothing in here is a judgment call — every check is
// either a schema/structure rule, a geometry measurement, or a recomputed number. Semantic
// judgment (does the argument hold together, does it read well, is the emphasis right)
// belongs to Visual QA / Fresh-eye Review, not here.
//
// Tiers, and where each one runs:
//   1. schema        — scripts/validate_spec.mjs            (IR shape, per-template required fields)
//   2. content       — scripts/check_content_structure.mjs  (placeholders/TODO/lorem/empty data/unsourced claims)
//   3. numerical     — scripts/check_numerical_integrity.mjs (waterfall/CAGR/%-sum/subtotal consistency)
//   4. geometry+type — scripts/qa_html_deck.mjs              (needs a RENDERED html path — overflow, overlap,
//                                                              font count, tiny text, source presence, CSS vars)
//
// Tier 4 needs a rendered HTML file (render_spec_to_html.mjs's output), since overflow/overlap
// can only be measured after layout actually happens — pass its path as the 2nd argument, or
// omit it to run tiers 1-3 only (useful right after Slide IR authoring, before rendering).
//
// Usage: node scripts/run_mechanical_gate.mjs <spec.json> [rendered.html] [-o report.json]
// Output shape (also the CONTRACT other tools should read):
//   {
//     "passed": bool,
//     "errors":   [{slide, type, element, detail, tier}],
//     "warnings": [{slide, type, element, detail, tier}],
//     "tiers": { schema: {...}, content: {...}, numerical: {...}, geometry: {...} | null }
//   }
// Exit code 1 if any Critical error exists in any tier (errors[].length > 0 anywhere).
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { checkContentStructure } from "./check_content_structure.mjs";
import { checkNumericalIntegrity } from "./check_numerical_integrity.mjs";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));

function normalize(tierName, result) {
  const errors = (result.errors || []).map((e) => ({ ...e, tier: tierName }));
  const warnings = (result.warnings || []).map((w) => ({ ...w, tier: tierName }));
  return { errors, warnings, raw: result };
}

async function runSchemaValidation(specPath) {
  try {
    await execFileAsync("node", [path.join(root, "scripts/validate_spec.mjs"), specPath]);
    return { errors: [], warnings: [] };
  } catch (e) {
    // validate_spec.mjs prints "  - message" lines to stderr and exits 1 on failure.
    const lines = String(e.stderr || "").split("\n").filter((l) => l.trim().startsWith("- "));
    return { errors: lines.map((l) => ({ type: "schema_violation", detail: l.replace(/^\s*-\s*/, "") })), warnings: [] };
  }
}

async function runGeometryQa(htmlPath) {
  const outPath = path.join(root, "generated", ".mechanical-gate-qa-tmp.json");
  try {
    await execFileAsync("node", [path.join(root, "scripts/qa_html_deck.mjs"), htmlPath, outPath]);
  } catch {
    // qa_html_deck.mjs exits 1 when checks fail — it still wrote the report; only re-throw
    // if the report itself is missing (a real crash, not just a failed check).
  }
  const report = JSON.parse(await fs.readFile(outPath, "utf8").catch(() => "null"));
  if (!report) return { errors: [{ type: "geometry_qa_crashed", detail: "qa_html_deck.mjs produced no report" }], warnings: [] };
  const errors = [];
  const warnings = [];
  for (const [name, ok] of Object.entries(report.checks || {})) {
    if (!ok) errors.push({ type: `geometry_or_typography:${name}`, detail: JSON.stringify(report[name] ?? report.slideOverflow ?? "see full report") });
  }
  for (const name of report.advisoryHints || []) warnings.push({ type: `advisory:${name}` });
  return { errors, warnings, fullReport: report };
}

export async function runMechanicalGate(specPath, htmlPath) {
  const spec = JSON.parse(await fs.readFile(path.resolve(process.cwd(), specPath), "utf8"));

  const schemaResult = normalize("schema", await runSchemaValidation(specPath));
  const contentResult = normalize("content", checkContentStructure(spec));
  const numericalResult = normalize("numerical", checkNumericalIntegrity(spec));
  const geometryResult = htmlPath ? normalize("geometry", await runGeometryQa(htmlPath)) : null;

  const tiers = {
    schema: { passed: schemaResult.errors.length === 0 },
    content: { passed: contentResult.errors.length === 0 },
    numerical: { passed: numericalResult.errors.length === 0 },
    geometry: geometryResult ? { passed: geometryResult.errors.length === 0 } : { passed: null, note: "no rendered HTML path given — geometry/typography tier skipped" },
  };

  const errors = [...schemaResult.errors, ...contentResult.errors, ...numericalResult.errors, ...(geometryResult?.errors || [])];
  const warnings = [...schemaResult.warnings, ...contentResult.warnings, ...numericalResult.warnings, ...(geometryResult?.warnings || [])];

  return { passed: errors.length === 0, errors, warnings, tiers };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2).filter((a) => a !== "-o" && a !== process.argv[process.argv.indexOf("-o") + 1]);
  const oi = process.argv.indexOf("-o");
  const outPath = oi >= 0 ? process.argv[oi + 1] : null;
  const [specPath, htmlPath] = args;
  if (!specPath) { console.error("usage: node scripts/run_mechanical_gate.mjs <spec.json> [rendered.html] [-o report.json]"); process.exit(2); }
  const result = await runMechanicalGate(specPath, htmlPath);
  const json = JSON.stringify(result, null, 2);
  console.log(json);
  if (outPath) await fs.writeFile(path.resolve(process.cwd(), outPath), json);
  if (!result.passed) process.exitCode = 1;
}
