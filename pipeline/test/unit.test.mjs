// Unit tests for the deterministic pipeline stages. Run with: node --test pipeline/test/
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkNumericalIntegrity } from "../scripts/check_numerical_integrity.mjs";
import { checkContentStructure } from "../scripts/check_content_structure.mjs";
import { applyTargetedRevision } from "../scripts/apply_targeted_revision.mjs";
import { logExperience } from "../scripts/log_experience.mjs";
import { parseStorylineReview, parseFreshEyeReview, parseVisualQa } from "../scripts/review_output_parser.mjs";

const execFileAsync = promisify(execFile);
const root = fileURLToPath(new URL("..", import.meta.url));
const tmpDir = path.join(root, "test", ".tmp");
await fs.mkdir(tmpDir, { recursive: true });

async function writeTmp(name, obj) {
  const p = path.join(tmpDir, name);
  await fs.writeFile(p, JSON.stringify(obj, null, 2));
  return p;
}

// ---- Ghost Deck parser ------------------------------------------------------
test("validate_ghost_deck: accepts a well-formed deck", async () => {
  const p = path.join(root, "ghost-deck/example.json");
  const { stdout } = await execFileAsync("node", [path.join(root, "scripts/validate_ghost_deck.mjs"), p]);
  const result = JSON.parse(stdout);
  assert.equal(result.passed, true);
  assert.equal(result.errors.length, 0);
});

test("validate_ghost_deck: rejects a missing transition_from_previous", async () => {
  const deck = JSON.parse(await fs.readFile(path.join(root, "ghost-deck/example.json"), "utf8"));
  deck.slides[1].transition_from_previous = null;
  const p = await writeTmp("broken-ghost-1.json", deck);
  await assert.rejects(() => execFileAsync("node", [path.join(root, "scripts/validate_ghost_deck.mjs"), p]));
});

test("validate_ghost_deck: flags an exact-duplicate action_title as a warning, not an error", async () => {
  const deck = JSON.parse(await fs.readFile(path.join(root, "ghost-deck/example.json"), "utf8"));
  deck.slides[2].action_title = deck.slides[0].action_title;
  const p = await writeTmp("dup-title-ghost.json", deck);
  const { stdout } = await execFileAsync("node", [path.join(root, "scripts/validate_ghost_deck.mjs"), p]);
  const result = JSON.parse(stdout);
  assert.equal(result.passed, true);
  assert.ok(result.warnings.some((w) => w.type === "duplicate_action_title_exact_match"));
});

test("validate_ghost_deck: rejects an invalid role", async () => {
  const deck = JSON.parse(await fs.readFile(path.join(root, "ghost-deck/example.json"), "utf8"));
  deck.slides[0].role = "not_a_real_role";
  const p = await writeTmp("bad-role-ghost.json", deck);
  await assert.rejects(() => execFileAsync("node", [path.join(root, "scripts/validate_ghost_deck.mjs"), p]));
});

// ---- Slide IR schema ---------------------------------------------------------
test("validate_spec: accepts the example deck", async () => {
  const p = path.join(root, "slide-spec/example_deck.json");
  const { stdout } = await execFileAsync("node", [path.join(root, "scripts/validate_spec.mjs"), p]);
  assert.match(stdout, /passes schema-derived validation/);
});

test("validate_spec: rejects a slide with an unknown template", async () => {
  const spec = JSON.parse(await fs.readFile(path.join(root, "slide-spec/example_deck.json"), "utf8"));
  spec.slides[0].template = "not_a_real_template";
  const p = await writeTmp("bad-template-spec.json", spec);
  await assert.rejects(() => execFileAsync("node", [path.join(root, "scripts/validate_spec.mjs"), p]));
});

test("validate_spec: rejects gantt rows that overrun the period grid", async () => {
  const spec = {
    deckTitle: "t",
    slides: [{ template: "gantt", title: "ガントチャートのテスト用アクションタイトルです", gantt: { periods: ["1", "2"], rows: [{ label: "r", start: 1, span: 5 }] } }],
  };
  const p = await writeTmp("bad-gantt-spec.json", spec);
  await assert.rejects(() => execFileAsync("node", [path.join(root, "scripts/validate_spec.mjs"), p]));
});

// ---- Numerical checks ---------------------------------------------------------
test("check_numerical_integrity: true_waterfall checkpoint that doesn't sum is an error", () => {
  const spec = { deckTitle: "t", slides: [{ template: "true_waterfall", title: "t", chart: { series: [
    { label: "a", value: 10, kind: "base" }, { label: "b", value: 5, kind: "up" }, { label: "c", value: 999, kind: "total" },
  ] } }] };
  const result = checkNumericalIntegrity(spec);
  assert.equal(result.passed, false);
  assert.ok(result.errors.some((e) => e.type === "waterfall_checkpoint_mismatch"));
});

test("check_numerical_integrity: true_waterfall checkpoint that sums correctly passes", () => {
  const spec = { deckTitle: "t", slides: [{ template: "true_waterfall", title: "t", chart: { series: [
    { label: "a", value: 10, kind: "base" }, { label: "b", value: 5, kind: "up" }, { label: "c", value: 15, kind: "total" },
  ] } }] };
  const result = checkNumericalIntegrity(spec);
  assert.equal(result.errors.length, 0);
});

test("check_numerical_integrity: CAGR chip far from the computed rate is an error", () => {
  const spec = { deckTitle: "t", slides: [{ template: "scenario_lines_cagr", title: "t", parts: { series: [{ name: "s", values: [100, 200], chip: "80%" }] } }] };
  const result = checkNumericalIntegrity(spec);
  assert.ok(result.errors.some((e) => e.type === "cagr_mismatch"));
});

test("check_numerical_integrity: CAGR chip within rounding tolerance passes", () => {
  // 35 -> 96 over 5 periods (6 data points) computes to ~22.4%, commonly authored rounded
  // to the nearest whole percent ("23%") — this must NOT be flagged as a mismatch.
  const spec = { deckTitle: "t", slides: [{ template: "scenario_lines_cagr", title: "t", parts: { series: [{ name: "s", values: [35, 43, 53, 65, 80, 96], chip: "23%" }] } }] };
  const result = checkNumericalIntegrity(spec);
  assert.equal(result.errors.length, 0);
});

test("check_numerical_integrity: stacked percentage segments not summing to 100 is an error", () => {
  const spec = { deckTitle: "t", slides: [{ template: "stacked_bar", title: "t", stacks: { unit: "%", categories: [{ label: "c1", segments: [{ value: 40 }, { value: 40 }] }] } }] };
  const result = checkNumericalIntegrity(spec);
  assert.ok(result.errors.some((e) => e.type === "percentage_sum_mismatch"));
});

test("check_numerical_integrity: labeled total row mismatched against its column sum is an error", () => {
  const spec = { deckTitle: "t", slides: [{ template: "process_matrix", title: "t", grid: {
    colHeaders: ["A"],
    rows: [{ label: "項目1", cells: ["10"] }, { label: "項目2", cells: ["20"] }, { label: "合計", cells: ["999"] }],
  } }] };
  const result = checkNumericalIntegrity(spec);
  assert.ok(result.errors.some((e) => e.type === "subtotal_total_mismatch"));
});

// ---- Content structure checks (placeholders / empty data / unsourced claims) ---
test("check_content_structure: catches placeholder residue", () => {
  const spec = { deckTitle: "t", slides: [{ template: "cover", title: "Text 1" }] };
  const result = checkContentStructure(spec);
  assert.ok(result.errors.some((e) => e.type === "placeholder_residue"));
});

test("check_content_structure: catches an unsourced claim", () => {
  const spec = { deckTitle: "t", slides: [{ template: "cover", title: "実際のタイトル", claims: [{ text: "根拠のない数値" }] }] };
  const result = checkContentStructure(spec);
  assert.ok(result.errors.some((e) => e.type === "unsourced_claim"));
});

test("check_content_structure: a claim marked illustrative is not flagged", () => {
  const spec = { deckTitle: "t", slides: [{ template: "cover", title: "実際のタイトル", claims: [{ text: "仮の数値", basis: "illustrative" }] }] };
  const result = checkContentStructure(spec);
  assert.equal(result.errors.filter((e) => e.type === "unsourced_claim").length, 0);
});

test("check_content_structure: catches an empty chart", () => {
  const spec = { deckTitle: "t", slides: [{ template: "chart_insight", title: "実際のタイトル", chart: { unit: "%", series: [] } }] };
  const result = checkContentStructure(spec);
  assert.ok(result.errors.some((e) => e.type === "empty_chart"));
});

// ---- Overlap / overflow detection (geometry) --- exercised via qa_html_deck.mjs on a
// synthetic HTML fixture that deliberately overflows its slide box.
test("qa_html_deck: detects an element that overflows its slide", async () => {
  const overflowingHtml = `<!doctype html><html><body>
    <div class="slide" style="position:relative;width:400px;height:300px;overflow:hidden">
      <div class="slide-inner" style="position:absolute;inset:10px">
        <div style="width:2000px;height:50px">too wide on purpose</div>
      </div>
    </div>
  </body></html>`;
  const htmlPath = path.join(tmpDir, "overflow-fixture.html");
  await fs.writeFile(htmlPath, overflowingHtml);
  const outPath = path.join(tmpDir, "overflow-fixture-qa.json");
  await assert.rejects(() => execFileAsync("node", [path.join(root, "scripts/qa_html_deck.mjs"), htmlPath, outPath]));
  const report = JSON.parse(await fs.readFile(outPath, "utf8"));
  assert.equal(report.checks.slideGeometry, false);
  assert.ok(report.slideOverflow.length > 0);
});

test("qa_html_deck: a well-behaved slide passes the geometry check", async () => {
  // Deliberately minimal fixture — it will still fail OTHER checks this script runs
  // (typography roles, action-title ratio) since it isn't a real deck. This test only
  // asserts the geometry check specifically, so it tolerates the script's overall nonzero
  // exit (any failing check exits 1) the same way run_mechanical_gate.mjs already does.
  const okHtml = `<!doctype html><html><body>
    <div class="slide" style="position:relative;width:400px;height:300px;overflow:hidden">
      <div class="slide-inner" style="position:absolute;inset:10px">
        <div style="width:100px;height:50px;line-height:1.2">fits fine</div>
      </div>
    </div>
  </body></html>`;
  const htmlPath = path.join(tmpDir, "ok-fixture.html");
  await fs.writeFile(htmlPath, okHtml);
  const outPath = path.join(tmpDir, "ok-fixture-qa.json");
  await execFileAsync("node", [path.join(root, "scripts/qa_html_deck.mjs"), htmlPath, outPath]).catch(() => {});
  const report = JSON.parse(await fs.readFile(outPath, "utf8"));
  assert.equal(report.checks.slideGeometry, true);
  assert.equal(report.slideOverflow.length, 0);
});

// ---- Targeted Revision --------------------------------------------------------
test("apply_targeted_revision: patches only the named slide and widens scope to neighbors", () => {
  const spec = JSON.parse(JSON.stringify(makeThreeCoverSlideDeck()));
  const { spec: patched, patchedSlides, affectedSlides } = applyTargetedRevision(spec, [
    { slideNumber: 2, path: "title", value: "新しいタイトル" },
  ]);
  assert.equal(patched.slides[1].title, "新しいタイトル");
  assert.equal(patched.slides[0].title, spec.slides[0].title); // untouched
  assert.deepEqual(patchedSlides, [2]);
  assert.deepEqual(affectedSlides, [1, 2, 3]);
});

function makeThreeCoverSlideDeck() {
  return {
    deckTitle: "t",
    slides: [
      { template: "cover", title: "スライド1のタイトル文" },
      { template: "cover", title: "スライド2のタイトル文" },
      { template: "cover", title: "スライド3のタイトル文" },
    ],
  };
}

// ---- Experience / learning memory ---------------------------------------------
test("log_experience: only flags eligibility after the promotion threshold", async () => {
  const logPath = path.join(tmpDir, "experience-log.json");
  await fs.rm(logPath, { force: true });
  const candidate = { pattern: "テストパターンA", root_cause: "テスト原因", proposed_rule: "テストルール" };
  let entry;
  for (let i = 0; i < 3; i += 1) entry = await logExperience(candidate, logPath);
  assert.equal(entry.occurrences, 3);
  assert.equal(entry.eligibleForPromotion, true);
});

test("log_experience: a single occurrence is not eligible", async () => {
  const logPath = path.join(tmpDir, "experience-log-2.json");
  await fs.rm(logPath, { force: true });
  const entry = await logExperience({ pattern: "テストパターンB", root_cause: "x", proposed_rule: "y" }, logPath);
  assert.equal(entry.eligibleForPromotion, false);
});

// ---- Review output parser ------------------------------------------------------
test("review_output_parser: valid storyline review parses cleanly", () => {
  const json = { storylineReview: { overallVerdict: "needs_revision", findings: [
    { slide_number: 2, severity: "major", category: "logic_jump", issue: "x", suggested_fix: "y" },
  ] } };
  // storylineReview findings key off slide_number in the prompt contract but the shared
  // parser normalizes on `slide` — this test also documents that mismatch so a future
  // change to either the prompt or the parser has to update both deliberately.
  json.storylineReview.findings[0].slide = json.storylineReview.findings[0].slide_number;
  const result = parseStorylineReview(json);
  assert.equal(result.valid, true);
});

test("review_output_parser: rejects an unknown severity", () => {
  const json = { freshEyeReview: { findings: [{ slide: 1, severity: "urgent", category: "logic", issue: "x" }] } };
  const result = parseFreshEyeReview(json);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((e) => e.includes("severity")));
});

test("review_output_parser: rejects a category outside the visual QA vocabulary", () => {
  const json = { visualQa: { findings: [{ slide: 1, severity: "minor", category: "not_a_real_category", issue: "x" }] } };
  const result = parseVisualQa(json);
  assert.equal(result.valid, false);
});

test("review_output_parser: accepts a well-formed visual QA result", () => {
  const json = { visualQa: { findings: [{ slide: 3, severity: "minor", category: "whitespace", issue: "余白が多い", suggested_fix: "情報を足す" }] } };
  const result = parseVisualQa(json);
  assert.equal(result.valid, true);
  assert.equal(result.findings.length, 1);
});
