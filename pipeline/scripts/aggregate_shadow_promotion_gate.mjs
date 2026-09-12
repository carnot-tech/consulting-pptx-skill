// aggregate_shadow_promotion_gate.mjs — joins shadow-routing predictions with their
// shadow-adjudications (by recordId) and reports the Promotion Gate metrics from
// references/reference-pattern-library-shadow-mode.md. Only REVIEWED predictions (those with a
// matching adjudication) count toward the official score — an un-reviewed prediction is
// neither a hit nor a miss yet, so it is excluded entirely, never guessed at. This script only
// FLAGS a verdict (PASS/FAIL/INSUFFICIENT_DATA), the same non-auto-acting spirit as
// log_experience.mjs's own eligibleForPromotion flag — it never itself promotes Library v0.2.
//
// Precision-first priority order (any nonzero count in the first four is an automatic FAIL,
// no matter how good the rest looks):
//   1. wrongSelection            (reviewed SELECTED predictions with verdict WRONG_SELECTION)
//   2. unsupportedInvention      (summed from adjudications)
//   3. semanticDrop              (summed from adjudications)
//   4. productionInterference    (summed from adjudications — this is "a shadow error actually
//                                  reached production", not merely "a shadow error happened")
//   5. shadowErrors              (raw count from ALL predictions, reviewed or not — reported
//                                  only; a shadow-side failure that stayed contained is not a
//                                  promotion blocker by itself, only productionInterference is)
//   6. unnecessaryDefer          (reported only — a safe/conservative miss, not a hard failure)
//   7. selectableRecall          (reported last, informational — recall is secondary here)
//
// Usage: node scripts/aggregate_shadow_promotion_gate.mjs <shadow-routing.json> <shadow-adjudications.json> [--sample-floor N]
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_SAMPLE_FLOOR = 20;

async function readJsonArray(p) {
  try {
    const parsed = JSON.parse(await fs.readFile(p, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function aggregateShadowPromotionGate(predictions, adjudications, { sampleFloor = DEFAULT_SAMPLE_FLOOR } = {}) {
  const adjudicationByRecordId = new Map(adjudications.map((a) => [a.recordId, a]));
  const shadowErrors = predictions.filter((p) => p.shadow?.status === "SHADOW_ERROR").length;

  const reviewedPairs = predictions
    .filter((p) => p.shadow?.status === "SELECTED" || p.shadow?.status === "DEFERRED")
    .map((p) => ({ prediction: p, adjudication: adjudicationByRecordId.get(p.recordId) }))
    .filter((pair) => pair.adjudication);

  const evaluable = reviewedPairs.filter((pair) => pair.adjudication.verdict !== "NOT_EVALUABLE");
  const notEvaluable = reviewedPairs.length - evaluable.length;

  const correctSelection = evaluable.filter((p) => p.adjudication.verdict === "CORRECT_SELECTION").length;
  const wrongSelection = evaluable.filter((p) => p.adjudication.verdict === "WRONG_SELECTION").length;
  const correctDefer = evaluable.filter((p) => p.adjudication.verdict === "CORRECT_DEFER").length;
  const unnecessaryDefer = evaluable.filter((p) => p.adjudication.verdict === "UNNECESSARY_DEFER").length;

  const unsupportedInvention = reviewedPairs.filter((p) => p.adjudication.unsupportedInvention).length;
  const semanticDrop = reviewedPairs.filter((p) => p.adjudication.semanticDrop).length;
  const productionInterference = reviewedPairs.filter((p) => p.adjudication.productionInterference).length;

  const selectableUniverse = correctSelection + wrongSelection + unnecessaryDefer;
  const selectableRecall = selectableUniverse > 0 ? Number((correctSelection / selectableUniverse).toFixed(4)) : null;

  const metrics = {
    reviewed: reviewedPairs.length,
    notEvaluable,
    selected: reviewedPairs.filter((p) => p.prediction.shadow.status === "SELECTED").length,
    deferred: reviewedPairs.filter((p) => p.prediction.shadow.status === "DEFERRED").length,
    correctSelection,
    wrongSelection,
    correctDefer,
    unnecessaryDefer,
    unsupportedInvention,
    semanticDrop,
    productionInterference,
    shadowErrors,
    selectableRecall,
  };

  const reasons = [];
  const blocking = ["wrongSelection", "unsupportedInvention", "semanticDrop", "productionInterference"];
  for (const key of blocking) {
    if (metrics[key] > 0) reasons.push(`${key} = ${metrics[key]} (must be 0)`);
  }

  let promotionVerdict;
  if (reasons.length > 0) {
    promotionVerdict = "FAIL";
  } else if (metrics.reviewed < sampleFloor) {
    promotionVerdict = "INSUFFICIENT_DATA";
    reasons.push(`only ${metrics.reviewed} reviewed observations (sample floor is ${sampleFloor})`);
  } else {
    promotionVerdict = "PASS";
    reasons.push(`0 wrong selection/invention/drop/interference across ${metrics.reviewed} reviewed observations (${metrics.selected} select, ${metrics.deferred} defer, ${shadowErrors} shadow errors none reaching production)`);
  }

  return { ...metrics, promotionVerdict, reasons };
}

// Deck-level coverage summary — informational only, to catch selection bias (e.g. Shadow
// quietly skipping most slides in a deck). totalSlides must come from the caller: a slide that
// was never even screened as a candidate is never logged at all (by design), so it can't be
// recovered from the routing log alone.
export function summarizeShadowDeckCoverage(deckId, totalSlides, predictions) {
  const deckRecords = predictions.filter((p) => p.deckId === deckId);
  const shadowEvaluated = deckRecords.filter((p) => p.shadow?.status === "SELECTED" || p.shadow?.status === "DEFERRED" || p.shadow?.status === "SHADOW_ERROR").length;
  return { deckId, totalSlides, shadowCandidates: deckRecords.length, shadowEvaluated };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const positional = args.filter((a) => !a.startsWith("--"));
  const [routingPath, adjudicationsPath] = positional;
  const floorFlagIdx = args.indexOf("--sample-floor");
  const sampleFloor = floorFlagIdx >= 0 ? Number(args[floorFlagIdx + 1]) : DEFAULT_SAMPLE_FLOOR;
  if (!routingPath || !adjudicationsPath) {
    console.error("usage: node scripts/aggregate_shadow_promotion_gate.mjs <shadow-routing.json> <shadow-adjudications.json> [--sample-floor N]");
    process.exit(2);
  }
  const predictions = await readJsonArray(path.resolve(process.cwd(), routingPath));
  const adjudications = await readJsonArray(path.resolve(process.cwd(), adjudicationsPath));
  const report = aggregateShadowPromotionGate(predictions, adjudications, { sampleFloor });
  console.log(JSON.stringify(report, null, 2));
}
