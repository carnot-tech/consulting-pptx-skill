// log_shadow_adjudication.mjs — append-only writer for human GOLD judgments on shadow-routing
// predictions, kept in a file separate from the predictions themselves
// (pipeline/shadow/shadow-adjudications.json vs pipeline/shadow/shadow-routing.json), joined
// later by `recordId`. This mirrors a standard holdout-evaluation discipline: the prediction is
// committed first, the gold label is attached afterward, and neither file lets the other be
// rewritten in place — see aggregate_shadow_promotion_gate.mjs, which only scores predictions
// that have a matching adjudication.
//
// Usage: node scripts/log_shadow_adjudication.mjs <adjudication.json> <shadow-adjudications.json>
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const VERDICTS = new Set(["CORRECT_SELECTION", "WRONG_SELECTION", "CORRECT_DEFER", "UNNECESSARY_DEFER", "NOT_EVALUABLE"]);

function assertAdjudicationShape(a) {
  if (!a.recordId) throw new Error('adjudication missing required field "recordId"');
  if (!VERDICTS.has(a.verdict)) throw new Error(`adjudication.verdict must be one of ${[...VERDICTS].join("/")}, got ${JSON.stringify(a.verdict)}`);
}

export async function logShadowAdjudication(adjudication, logPath) {
  assertAdjudicationShape(adjudication);

  let log = [];
  try { log = JSON.parse(await fs.readFile(logPath, "utf8")); } catch {}

  if (log.some((e) => e.recordId === adjudication.recordId)) {
    throw new Error(`adjudication for "${adjudication.recordId}" already exists — adjudications are immutable, never overwrite one`);
  }

  const stored = {
    recordId: adjudication.recordId,
    reviewedAt: adjudication.reviewedAt ?? new Date().toISOString(),
    gold: adjudication.gold ?? {},
    verdict: adjudication.verdict,
    unsupportedInvention: adjudication.unsupportedInvention ?? false,
    semanticDrop: adjudication.semanticDrop ?? false,
    productionInterference: adjudication.productionInterference ?? false,
    notes: adjudication.notes ?? "",
  };
  log.push(stored);

  await fs.mkdir(path.dirname(logPath), { recursive: true });
  await fs.writeFile(logPath, JSON.stringify(log, null, 2));
  return stored;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [adjudicationPath, logPath] = process.argv.slice(2);
  if (!adjudicationPath || !logPath) {
    console.error("usage: node scripts/log_shadow_adjudication.mjs <adjudication.json> <shadow-adjudications.json>");
    process.exit(2);
  }
  const adjudication = JSON.parse(await fs.readFile(path.resolve(process.cwd(), adjudicationPath), "utf8"));
  const stored = await logShadowAdjudication(adjudication, path.resolve(process.cwd(), logPath));
  console.log(JSON.stringify(stored, null, 2));
}
