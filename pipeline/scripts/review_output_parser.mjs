// review_output_parser.mjs — validates the structured-JSON output contract each LLM review
// stage must produce (references/storyline-review-prompt.md, content-review-prompt.md,
// visual-qa-prompt.md), so a malformed review result fails loudly and immediately instead of
// silently breaking Targeted Revision or the disposition log three steps later.
const SEVERITIES = new Set(["critical", "major", "minor"]);

const STORYLINE_CATEGORIES = new Set([
  "answers_the_question", "conclusion_first", "connects_to_previous", "duplicate_claim",
  "logic_jump", "so_what_missing", "issue_analysis_implication_recommendation", "exec_summary_mismatch",
]);
const FRESH_EYE_CATEGORIES = new Set([
  "japanese_phrasing", "logic", "numerical_consistency", "title_figure_mismatch",
  "unsupported_evaluative_word", "duplicate_slide", "toc_mismatch", "source_missing",
]);
const VISUAL_QA_CATEGORIES = new Set([
  "clarity_at_a_glance", "visual_hierarchy", "whitespace", "alignment", "density",
  "chart_readability", "table_readability", "text_wrapping", "awkward_line_break",
  "information_balance", "slide_to_slide_consistency", "awkward_spacing",
]);

// slideField: which key carries the slide number. storyline-review-prompt.md's contract
// documents "slide_number" (it reviews Ghost Deck slide objects, whose own native field is
// slide_number) — content-review-prompt.md and visual-qa-prompt.md both document "slide"
// (they review the rendered deck's page number). Keeping each parser aligned to its own
// prompt file's documented example, rather than silently renormalizing, so a finding that
// doesn't match its own contract is caught here instead of downstream.
function parseFindings(findings, allowedCategories, kind, slideField = "slide") {
  const errors = [];
  if (!Array.isArray(findings)) {
    return { valid: false, errors: [`${kind}: findings must be an array`], findings: [] };
  }
  findings.forEach((f, i) => {
    const at = `${kind}.findings[${i}]`;
    if (typeof f[slideField] !== "number") errors.push(`${at}.${slideField} must be a number`);
    if (!SEVERITIES.has(f.severity)) errors.push(`${at}.severity must be one of ${[...SEVERITIES].join("|")}, got ${JSON.stringify(f.severity)}`);
    if (!allowedCategories.has(f.category)) errors.push(`${at}.category "${f.category}" is not in the allowed vocabulary for ${kind}`);
    if (!f.issue || typeof f.issue !== "string") errors.push(`${at}.issue must be a non-empty string`);
  });
  return { valid: errors.length === 0, errors, findings };
}

export function parseStorylineReview(json) {
  const body = json?.storylineReview;
  if (!body) return { valid: false, errors: ["missing top-level 'storylineReview' key"], findings: [] };
  const result = parseFindings(body.findings, STORYLINE_CATEGORIES, "storylineReview", "slide_number");
  if (!["coherent", "needs_revision", "incoherent"].includes(body.overallVerdict)) {
    result.errors.push("storylineReview.overallVerdict must be coherent|needs_revision|incoherent");
    result.valid = false;
  }
  return result;
}

export function parseFreshEyeReview(json) {
  const body = json?.freshEyeReview;
  if (!body) return { valid: false, errors: ["missing top-level 'freshEyeReview' key"], findings: [] };
  return parseFindings(body.findings, FRESH_EYE_CATEGORIES, "freshEyeReview");
}

export function parseVisualQa(json) {
  const body = json?.visualQa;
  if (!body) return { valid: false, errors: ["missing top-level 'visualQa' key"], findings: [] };
  return parseFindings(body.findings, VISUAL_QA_CATEGORIES, "visualQa");
}

export function findingsRequiringAction(parsed, { includeMinor = false } = {}) {
  return parsed.findings.filter((f) => f.severity === "critical" || f.severity === "major" || (includeMinor && f.severity === "minor"));
}
