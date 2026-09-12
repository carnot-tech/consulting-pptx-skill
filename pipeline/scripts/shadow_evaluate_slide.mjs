// shadow_evaluate_slide.mjs — the ONE entry point production code calls to get a shadow
// observation for a single slide. This is where the hard invariant actually lives in code:
//
//   Shadow processing must never affect production output, and a shadow-side failure must
//   never halt or alter the production pipeline.
//
// evaluateSlideForShadow() NEVER throws. Any failure — drafting the Pre-family IR, calling
// selectPattern(), or writing the log itself — is caught and folded into the returned record's
// shadow.status "SHADOW_ERROR" / shadow.error, never propagated to the caller. A caller can
// therefore invoke this after production has already produced its result, discard the return
// value entirely, and production is provably unaffected by anything that happens in here.
//
// A slide the caller has already screened as NOT a plausible candidate for one of the 7
// Library v0.2 patterns is not evaluated at all — evaluateSlideForShadow returns null and
// nothing is logged (see references/reference-pattern-library-shadow-mode.md: forcing every
// slide through the Selector would flood the log with meaningless NOT_EVALUATED noise).
import crypto from "node:crypto";
import { selectPattern } from "./reference_pattern_selector.mjs";
import { logShadowRouting } from "./log_shadow_routing.mjs";

export async function evaluateSlideForShadow({
  runId,
  deckId,
  slideId,
  candidateScreen,
  productionTemplate,
  intent,
  draftPreFamilyIr,
  libraryVersion = "reference-pattern-library-v0.2",
  selectorHash = null,
  preFamilyIrHash = null,
  logPath,
}) {
  if (!candidateScreen?.eligibleForShadow) return null;

  const recordId = `shadow-${runId}-${slideId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  let shadow;
  try {
    const preFamilyIr = draftPreFamilyIr();
    const selection = await selectPattern(intent, preFamilyIr);

    if (selection.eligibility === "PASS") {
      const consideredPatterns = [...selection.rejectedCandidates.map((c) => c.patternId), selection.selectedPattern];
      shadow = {
        status: "SELECTED",
        selectedPattern: selection.selectedPattern,
        consideredPatterns,
        eligibilityEvidence: { evidence: selection.evidence, rejectedCandidates: selection.rejectedCandidates },
        deferReason: null,
        error: null,
      };
    } else if (selection.eligibility === "FAIL") {
      const consideredPatterns = selection.rejectedCandidates.map((c) => c.patternId);
      shadow = {
        status: "DEFERRED",
        selectedPattern: null,
        consideredPatterns,
        eligibilityEvidence: { rejectedCandidates: selection.rejectedCandidates },
        deferReason: selection.rejectedCandidates.map((c) => `${c.patternId}: ${c.reason}`).join(" | ") || "no eligible pattern",
        error: null,
      };
    } else {
      // "NOT_CONSIDERED" — the (family, variant) intent isn't wired into
      // FAMILY_VARIANT_MAP at all. That's a caller/config mistake, not a content-based defer,
      // so it's folded into SHADOW_ERROR rather than reported as a legitimate DEFERRED.
      throw new Error(`selectPattern returned eligibility "${selection.eligibility}" for intent ${JSON.stringify(intent)} — this (family, variant) is not registered`);
    }
  } catch (err) {
    shadow = {
      status: "SHADOW_ERROR",
      selectedPattern: null,
      consideredPatterns: [],
      eligibilityEvidence: {},
      deferReason: null,
      error: String(err?.message ?? err),
    };
  }

  const record = {
    recordId,
    timestamp: new Date().toISOString(),
    runId,
    deckId,
    slideId,
    candidateScreen,
    production: { template: productionTemplate, unchanged: true },
    shadow,
    provenance: { libraryVersion, selectorHash, preFamilyIrHash },
  };

  if (logPath) {
    try {
      await logShadowRouting(record, logPath);
    } catch (logErr) {
      // The log write itself failed (bad path, disk full, a genuine bug in the logger) — this
      // must not propagate to the caller either. Fold it into the record we hand back so the
      // caller can still see something went wrong, without production ever seeing an exception.
      record.shadow.error = record.shadow.error ? `${record.shadow.error}; also failed to log: ${String(logErr?.message ?? logErr)}` : `failed to log: ${String(logErr?.message ?? logErr)}`;
      if (record.shadow.status !== "SHADOW_ERROR") record.shadow.status = "SHADOW_ERROR";
    }
  }
  return record;
}
