// apply_targeted_revision.mjs — apply reviewer-driven fixes to SPECIFIC Slide IR slides
// only, and report exactly which slides now need re-QA. This is what keeps a revision loop
// cheap and safe: the whole deck never gets regenerated from scratch over one finding, so a
// fix to slide 7 cannot silently reword slide 12 or drift its design.
//
// Patch format (what Fresh-eye/Visual QA findings get turned into after disposition):
//   [{ "slideNumber": 7, "path": "title", "value": "組立工程が全工数の42%を占め、最大のDX余地となる" },
//    { "slideNumber": 7, "path": "claims.0.sourceId", "value": "src_process_hours_2026" }]
// `path` is a dot-path into that ONE slide object (array indices as plain numbers).
//
// Usage: node scripts/apply_targeted_revision.mjs <spec.json> <patches.json> -o <out-spec.json>
// Output (also written to stdout): { patchedSlides:[n], affectedSlides:[n], regressionScope:[n] }
// affectedSlides = patchedSlides plus immediate neighbors (n-1, n+1) — a fix can break the
// transition_from_previous/transition_to_next continuity with either neighbor even when the
// neighbor's own content is untouched, so both must be back in scope for Fresh-eye Review's
// "connects to previous/next" check even though their Slide IR never changes.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

function setByPath(obj, dotPath, value) {
  const parts = dotPath.split(".");
  let node = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
    if (node[key] == null) node[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
    node = node[key];
  }
  const lastKey = /^\d+$/.test(parts[parts.length - 1]) ? Number(parts[parts.length - 1]) : parts[parts.length - 1];
  node[lastKey] = value;
}

export function applyTargetedRevision(spec, patches) {
  const patchedSlides = new Set();
  for (const p of patches) {
    const idx = p.slideNumber - 1;
    const slide = spec.slides[idx];
    if (!slide) throw new Error(`patch references slideNumber ${p.slideNumber}, but the deck only has ${spec.slides.length} slides`);
    setByPath(slide, p.path, p.value);
    patchedSlides.add(p.slideNumber);
  }
  const affected = new Set();
  for (const n of patchedSlides) {
    affected.add(n);
    if (n - 1 >= 1) affected.add(n - 1);
    if (n + 1 <= spec.slides.length) affected.add(n + 1);
  }
  return {
    spec,
    patchedSlides: [...patchedSlides].sort((a, b) => a - b),
    affectedSlides: [...affected].sort((a, b) => a - b),
  };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const oi = args.indexOf("-o");
  const outPath = oi >= 0 ? args[oi + 1] : null;
  const positional = oi >= 0 ? [...args.slice(0, oi), ...args.slice(oi + 2)] : args;
  const [specPath, patchesPath] = positional;
  if (!specPath || !patchesPath) {
    console.error("usage: node scripts/apply_targeted_revision.mjs <spec.json> <patches.json> [-o out-spec.json]");
    process.exit(2);
  }
  const spec = JSON.parse(await fs.readFile(path.resolve(process.cwd(), specPath), "utf8"));
  const patches = JSON.parse(await fs.readFile(path.resolve(process.cwd(), patchesPath), "utf8"));
  const result = applyTargetedRevision(spec, patches);
  if (outPath) await fs.writeFile(path.resolve(process.cwd(), outPath), JSON.stringify(result.spec, null, 2));
  console.log(JSON.stringify({ patchedSlides: result.patchedSlides, affectedSlides: result.affectedSlides, regressionScope: result.affectedSlides }, null, 2));
}
