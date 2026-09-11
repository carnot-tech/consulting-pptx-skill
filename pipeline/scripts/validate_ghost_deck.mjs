// validate_ghost_deck.mjs — structural checks on a Ghost Deck, BEFORE the semantic
// Storyline Review (references/storyline-review-prompt.md) ever runs. Deterministic-only:
// required fields, role enum, slide_number sequencing, transition continuity, and a cheap
// (string-match) duplicate-title proxy. Whether the STORY holds together — So What, logic
// jumps, Issue->Analysis->Implication->Recommendation — is a semantic judgment left entirely
// to the Storyline Review; this script only catches malformed/incomplete input before that
// review wastes a pass on it.
//
// Usage: node scripts/validate_ghost_deck.mjs <ghost-deck.json>
// Output: structured JSON on stdout, {passed, errors[], warnings[]}. Exit 1 if any error.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const inputArg = process.argv[2];
if (!inputArg) {
  console.error("usage: node scripts/validate_ghost_deck.mjs <ghost-deck.json>");
  process.exit(2);
}

const ROLES = new Set([
  "cover", "executive_summary", "agenda", "problem_framing", "evidence",
  "analysis", "implication", "recommendation", "roadmap", "risk",
  "decision_ask", "appendix", "section_divider", "back_cover",
]);
// Roles that structurally assert facts and therefore should name evidence to gather.
// Pure argument/navigation slides (cover, agenda, section_divider, back_cover, decision_ask
// itself) are exempt — flagged as a warning only, never a hard error, since a slide can
// legitimately be pure logic with no new evidence.
const EVIDENCE_BEARING_ROLES = new Set(["problem_framing", "evidence", "analysis", "implication", "recommendation", "roadmap", "risk"]);
// back_cover is a pure structural bookend (slide-rules.md §4.24: ロゴ＋会社名・連絡先のみ,
// no argument content) — it never continues the previous slide's logic, so it needs no
// transition_from_previous either, the same as cover/section_divider/agenda.
const NO_PREV_TRANSITION_ROLES = new Set(["cover", "section_divider", "agenda", "back_cover"]);
const NO_NEXT_TRANSITION_ROLES = new Set(["section_divider", "back_cover"]);

function isEmpty(v) {
  return v == null || (typeof v === "string" && v.trim() === "");
}

async function main() {
  const inputPath = path.resolve(process.cwd(), inputArg);
  const deck = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const errors = [];
  const warnings = [];

  if (isEmpty(deck.deckTitle)) errors.push({ type: "missing_field", field: "deckTitle" });
  if (isEmpty(deck.audience)) errors.push({ type: "missing_field", field: "audience", note: "slide-rules.md §0 Define-before-Produce: 誰の・どの会議の資料かを先に確認する" });
  if (isEmpty(deck.decisionAsked)) errors.push({ type: "missing_field", field: "decisionAsked", note: "1文で言えないなら、まだスコープが決まっていない" });
  if (!Array.isArray(deck.slides) || !deck.slides.length) {
    errors.push({ type: "missing_field", field: "slides" });
    return { passed: false, errors, warnings };
  }

  const seenNumbers = new Set();
  const titleFirstSeenAt = new Map();
  deck.slides.forEach((s, i) => {
    const at = `slide ${i + 1}`;
    if (typeof s.slide_number !== "number") errors.push({ type: "missing_field", at, field: "slide_number" });
    else if (seenNumbers.has(s.slide_number)) errors.push({ type: "duplicate_slide_number", at, slide_number: s.slide_number });
    else seenNumbers.add(s.slide_number);

    if (!ROLES.has(s.role)) errors.push({ type: "invalid_role", at, role: s.role, allowed: [...ROLES] });
    if (isEmpty(s.action_title)) errors.push({ type: "missing_field", at, field: "action_title" });
    if (isEmpty(s.key_message)) errors.push({ type: "missing_field", at, field: "key_message" });

    if (!isEmpty(s.action_title)) {
      const norm = s.action_title.trim();
      if (titleFirstSeenAt.has(norm)) {
        // Exact-string duplicate is a MECHANIZABLE proxy for "同じ主張を重複していない" —
        // catches copy-paste, not paraphrased repetition (that needs the semantic review).
        warnings.push({ type: "duplicate_action_title_exact_match", at, alsoAt: titleFirstSeenAt.get(norm), title: norm, note: "文字列として完全一致。言い換えでの重複はStoryline Reviewが担当" });
      } else {
        titleFirstSeenAt.set(norm, at);
      }
    }

    if (s.role && EVIDENCE_BEARING_ROLES.has(s.role) && (!Array.isArray(s.evidence_needed) || !s.evidence_needed.length)) {
      warnings.push({ type: "no_evidence_needed_listed", at, role: s.role });
    }

    const isFirst = i === 0;
    if (!isFirst && s.transition_from_previous == null && !NO_PREV_TRANSITION_ROLES.has(s.role)) {
      errors.push({ type: "missing_transition", at, field: "transition_from_previous", note: "§4.44の「前ページを受けて次の1段だけを足す」を機械的に担保する必須フィールド" });
    }
    if (isFirst && s.transition_from_previous != null) {
      warnings.push({ type: "unexpected_transition", at, field: "transition_from_previous", note: "1枚目はnullが基本（表紙・章扉直後も同様）" });
    }
    const isLast = i === deck.slides.length - 1;
    if (!isLast && s.transition_to_next == null && !NO_NEXT_TRANSITION_ROLES.has(s.role)) {
      errors.push({ type: "missing_transition", at, field: "transition_to_next" });
    }
  });

  return { passed: errors.length === 0, errors, warnings };
}

const result = await main();
console.log(JSON.stringify(result, null, 2));
if (!result.passed) process.exitCode = 1;
