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
import { runPipeline } from "../scripts/run_pipeline.mjs";
import { logExperience } from "../scripts/log_experience.mjs";
import { parseStorylineReview, parseFreshEyeReview, parseVisualQa } from "../scripts/review_output_parser.mjs";
import { dedupeSlideShapeIds, fixPptxShapeIds } from "../scripts/fix_pptx_shape_ids.mjs";
import { auditPptxStructure } from "../scripts/audit_pptx_structure.mjs";
import JSZip from "jszip";

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

// ---- chart_insight negative-value rendering -----------------------------------
test("render_spec_to_html: chart_insight renders a negative value as a real (non-negative-height) bar below a zero line", async () => {
  // Regression test for a real bug found during the rigorous-mode E2E run: bar height was
  // computed as (value/max)*82%, which goes negative — and so is invisible — for any value
  // below zero. A mixed positive/negative series (e.g. a multi-year cumulative cash flow)
  // silently lost its negative years entirely.
  const spec = {
    deckTitle: "t",
    slides: [{
      template: "chart_insight", title: "累積キャッシュフローは3年目にプラスへ転換する",
      chart: { unit: "億円", series: [{ label: "1年目", value: -18 }, { label: "2年目", value: -6 }, { label: "3年目", value: 9 }, { label: "4年目", value: 24 }] },
      sections: [{ title: "So What", copy: "3年目にプラス転換する" }],
    }],
  };
  const specPath = path.join(tmpDir, "chart-insight-negative-spec.json");
  const htmlPath = path.join(tmpDir, "chart-insight-negative.html");
  await fs.writeFile(specPath, JSON.stringify(spec));
  await execFileAsync("node", [path.join(root, "scripts/render_spec_to_html.mjs"), specPath, htmlPath]);
  const html = await fs.readFile(htmlPath, "utf8");
  assert.doesNotMatch(html, /height:\s*-\d/, "no bar should carry a negative CSS height");
  assert.match(html, /bar-zero-line/, "a zero line should be drawn when the series has a value below zero");
});

// ---- Overlap / overflow detection (geometry) --- exercised via qa_html_deck.mjs on a
// synthetic HTML fixture that deliberately overflows its slide box.
test("render_spec_to_html: matrix_2x2 with `quadrants` renders 4 panels, emphasis, and axis labels (RP-MATRIX-HERO-01 shape)", async () => {
  // matrix_2x2 originally only supported a scatter-plot shape (`items`, points plotted by
  // x/y%). The Reference Pattern Library's RP-MATRIX-HERO-01/PLAIN-01 need a 2-axis
  // 4-quadrant PANEL composition instead (each quadrant is a labeled box, not a plotted
  // point) — this is a structurally different visual, so it's a second data shape on the
  // same template (`quadrants`), not a variant of the old one.
  const spec = {
    deckTitle: "t",
    slides: [{
      template: "matrix_2x2", title: "後任体制の早期確定が最優先課題である",
      matrix: { yAxis: "対応緊急度", xAxis: "事業影響度" },
      quadrants: [
        { position: "top-right", priorityLabel: "最優先", title: "後任体制の早期確定", body: "6か月以内に一部退任予定のため急務。", evidence: "6か月以内に一部退任予定", emphasis: true },
        { position: "top-left", priorityLabel: "優先", title: "主要顧客との関係維持", body: "経営陣交代の影響を早期にモニタリングする。" },
        { position: "bottom-right", priorityLabel: "中", title: "オペレーション体制の見直し", body: "中期的な体制強化を進める。" },
        { position: "bottom-left", priorityLabel: "低", title: "バックオフィス機能の統合", body: "他の施策が一巡した後で着手する。" },
      ],
    }],
  };
  const specPath = path.join(tmpDir, "matrix-quadrant-spec.json");
  const htmlPath = path.join(tmpDir, "matrix-quadrant.html");
  await fs.writeFile(specPath, JSON.stringify(spec));
  await execFileAsync("node", [path.join(root, "scripts/render_spec_to_html.mjs"), specPath, htmlPath]);
  const html = await fs.readFile(htmlPath, "utf8");
  assert.equal((html.match(/class="mq-cell/g) || []).length, 4, "exactly 4 quadrant cells");
  assert.match(html, /mq-cell emphasis/, "the emphasized quadrant carries the emphasis class");
  assert.match(html, /対応緊急度/);
  assert.match(html, /事業影響度/);

  const outPath = path.join(tmpDir, "matrix-quadrant-qa.json");
  await execFileAsync("node", [path.join(root, "scripts/qa_html_deck.mjs"), htmlPath, outPath]).catch(() => {});
  const report = JSON.parse(await fs.readFile(outPath, "utf8"));
  assert.equal(report.slideOverflow.length, 0, `expected no overflow, got: ${JSON.stringify(report.slideOverflow)}`);

  const pptxPath = path.join(tmpDir, "matrix-quadrant.pptx");
  await execFileAsync("node", [path.join(root, "scripts/export_spec_to_editable_pptx.mjs"), specPath, pptxPath]);
  const auditResult = await auditPptxStructure(await fs.readFile(pptxPath));
  assert.deepEqual(auditResult, { passed: true, errors: [] });
});

test("validate_spec: matrix_2x2 requires either `items` or `quadrants`", async () => {
  const spec = { deckTitle: "t", slides: [{ template: "matrix_2x2", title: "軸もitemsもquadrantsも無い行き先不明の資料である" }] };
  const specPath = path.join(tmpDir, "matrix-no-shape-spec.json");
  await fs.writeFile(specPath, JSON.stringify(spec));
  await assert.rejects(() => execFileAsync("node", [path.join(root, "scripts/validate_spec.mjs"), specPath]));
});

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
test("review_output_parser: valid storyline review parses cleanly (slide_number, per storyline-review-prompt.md's own contract)", () => {
  const json = { storylineReview: { overallVerdict: "needs_revision", findings: [
    { slide_number: 2, severity: "major", category: "logic_jump", issue: "x", suggested_fix: "y" },
  ] } };
  const result = parseStorylineReview(json);
  assert.equal(result.valid, true);
});

test("review_output_parser: storyline review finding using 'slide' instead of 'slide_number' is rejected", () => {
  // Regression test for a real bug found during the rigorous-mode E2E run: the parser
  // originally checked f.slide for every review type, silently rejecting a well-formed
  // storyline review finding that correctly used slide_number per its own prompt contract.
  const json = { storylineReview: { overallVerdict: "needs_revision", findings: [
    { slide: 2, severity: "major", category: "logic_jump", issue: "x" },
  ] } };
  const result = parseStorylineReview(json);
  assert.equal(result.valid, false);
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

// ---- Pipeline orchestrator resume behavior ------------------------------------
test("run_pipeline: resumes past an LLM stage once its output file already exists", async () => {
  // Regression test for a real bug found during the rigorous-mode E2E run: the
  // orchestrator stopped at the same LLM stage on every invocation, even after Claude had
  // already written a valid review result — because nothing checked for it first.
  const outDir = path.join(tmpDir, "resume-test");
  await fs.rm(outDir, { recursive: true, force: true });
  const specPath = path.join(root, "slide-spec/example_deck.json");
  const ghostDeckPath = path.join(root, "ghost-deck/example.json");

  const first = await runPipeline({ mode: "standard", ghostDeckPath, specPath, outDir });
  assert.equal(first.nextAction.type, "llm_review_required");
  assert.equal(first.nextAction.stage, "visual_qa_llm");

  // Simulate Claude having performed the review and written its result.
  await fs.writeFile(
    path.join(outDir, "visual-qa.json"),
    JSON.stringify({ visualQa: { findings: [] } }),
  );

  const second = await runPipeline({ mode: "standard", ghostDeckPath, specPath, outDir });
  assert.notEqual(second.nextAction.stage, "visual_qa_llm");
  assert.ok(second.completed.some((c) => c.stage === "visual_qa_llm" && c.passed === true));
});

test("run_pipeline: fresh_eye_review_llm's input file already exists when the orchestrator hands it off", async () => {
  // Regression test for a real bug found during the rigorous-mode E2E run: the hand-off
  // pointed to deck.pptx, but pptx_export is the LAST stage in rigorous mode — deck.pptx
  // does not exist yet when fresh_eye_review_llm is reached, only deck.html does.
  const outDir = path.join(tmpDir, "fresh-eye-input-exists-test");
  await fs.rm(outDir, { recursive: true, force: true });
  const specPath = path.join(root, "slide-spec/example_deck.json");
  const ghostDeckPath = path.join(root, "ghost-deck/example.json");

  let manifest = await runPipeline({ mode: "rigorous", ghostDeckPath, specPath, outDir });
  while (manifest.nextAction.stage && manifest.nextAction.stage !== "fresh_eye_review_llm") {
    const stage = manifest.nextAction.stage;
    if (stage === "storyline_review_llm") {
      await fs.writeFile(path.join(outDir, "storyline-review.json"), JSON.stringify({ storylineReview: { overallVerdict: "coherent", findings: [] } }));
    } else if (stage === "visual_qa_llm") {
      await fs.writeFile(path.join(outDir, "visual-qa.json"), JSON.stringify({ visualQa: { findings: [] } }));
    } else {
      break;
    }
    manifest = await runPipeline({ mode: "rigorous", ghostDeckPath, specPath, outDir });
  }
  assert.equal(manifest.nextAction.stage, "fresh_eye_review_llm");
  const inputExists = await fs.access(manifest.nextAction.input).then(() => true).catch(() => false);
  assert.ok(inputExists, `nextAction.input (${manifest.nextAction.input}) must already exist when this stage is reached`);
});

test("run_pipeline: does not resume past an LLM stage whose output file fails validation", async () => {
  const outDir = path.join(tmpDir, "resume-invalid-test");
  await fs.rm(outDir, { recursive: true, force: true });
  const specPath = path.join(root, "slide-spec/example_deck.json");
  const ghostDeckPath = path.join(root, "ghost-deck/example.json");

  await runPipeline({ mode: "standard", ghostDeckPath, specPath, outDir });
  // Malformed: severity is not in the allowed vocabulary.
  await fs.writeFile(
    path.join(outDir, "visual-qa.json"),
    JSON.stringify({ visualQa: { findings: [{ slide: 1, severity: "urgent", category: "whitespace", issue: "x" }] } }),
  );

  const result = await runPipeline({ mode: "standard", ghostDeckPath, specPath, outDir });
  assert.equal(result.nextAction.stage, "visual_qa_llm");
});

test("fix_pptx_shape_ids: renumbers a table's cNvPr id that collides with an earlier shape's id", () => {
  // Reproduces the real pptxgenjs@4.0.1 bug: a table's graphicFrame id is computed as
  // `intTableNum * slide._slideNum + 1`, unrelated to how many shapes already exist on the
  // slide, so it can collide with an already-used <p:cNvPr id>. This is invalid OOXML and is
  // what caused a real PowerPoint "repair" prompt on a generated deck.
  const xml = `<p:spTree><p:cNvPr id="1" name=""/><p:cNvPr id="2" name="Text 0"/><p:cNvPr id="3" name="Text 1"/><p:cNvPr id="4" name="Shape 2"/><p:cNvPr id="4" name="Table 0"/></p:spTree>`;
  const { xml: fixed, changed, renumbered } = dedupeSlideShapeIds(xml);
  assert.equal(changed, true);
  assert.deepEqual(renumbered, [{ from: 4, to: 5 }]);
  const ids = [...fixed.matchAll(/id="(\d+)"/g)].map((m) => m[1]);
  assert.deepEqual(ids, ["1", "2", "3", "4", "5"]);
  assert.equal(new Set(ids).size, ids.length, "every cNvPr id must be unique after the fix");
});

test("fix_pptx_shape_ids: leaves an already-unique slide untouched", () => {
  const xml = `<p:spTree><p:cNvPr id="1" name=""/><p:cNvPr id="2" name="Text 0"/><p:cNvPr id="3" name="Table 0"/></p:spTree>`;
  const { xml: fixed, changed } = dedupeSlideShapeIds(xml);
  assert.equal(changed, false);
  assert.equal(fixed, xml);
});

test("fix_pptx_shape_ids: repairs duplicate ids inside a real generated .pptx zip", async () => {
  const zip = new JSZip();
  const dupSlide = `<p:sld><p:cSld><p:spTree><p:cNvPr id="1" name=""/><p:cNvPr id="2" name="Text 0"/><p:cNvPr id="3" name="Text 1"/><p:cNvPr id="4" name="Shape 2"/><p:cNvPr id="4" name="Table 0"/></p:spTree></p:cSld></p:sld>`;
  zip.file("ppt/slides/slide1.xml", dupSlide);
  zip.file("ppt/slides/slide2.xml", `<p:sld><p:cSld><p:spTree><p:cNvPr id="1" name=""/><p:cNvPr id="2" name="Text 0"/></p:spTree></p:cSld></p:sld>`);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const { buffer: fixedBuffer, report } = await fixPptxShapeIds(buffer);
  assert.equal(report.length, 1, "only the slide with a real collision should be reported");
  assert.equal(report[0].slide, "ppt/slides/slide1.xml");

  const fixedZip = await JSZip.loadAsync(fixedBuffer);
  const fixedSlide1 = await fixedZip.file("ppt/slides/slide1.xml").async("string");
  const ids = [...fixedSlide1.matchAll(/id="(\d+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
  const fixedSlide2 = await fixedZip.file("ppt/slides/slide2.xml").async("string");
  assert.equal(fixedSlide2, `<p:sld><p:cSld><p:spTree><p:cNvPr id="1" name=""/><p:cNvPr id="2" name="Text 0"/></p:spTree></p:cSld></p:sld>`);
});

test("audit_pptx_structure: flags a duplicate cNvPr id (the class of defect that triggers PowerPoint repair)", async () => {
  const zip = new JSZip();
  const dupSlide = `<p:sld><p:cSld><p:spTree><p:cNvPr id="1" name=""/><p:cNvPr id="2" name="Text 0"/><p:cNvPr id="2" name="Table 0"/></p:spTree></p:cSld></p:sld>`;
  zip.file("[Content_Types].xml", `<Types><Default Extension="xml" ContentType="application/xml"/></Types>`);
  zip.file("ppt/slides/slide1.xml", dupSlide);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  const result = await auditPptxStructure(buffer);
  assert.equal(result.passed, false);
  assert.ok(result.errors.some((e) => e.includes('duplicate <p:cNvPr id="2">')));
});

test("audit_pptx_structure: a freshly exported deck (with a table slide) passes with zero findings", async () => {
  const outPath = path.join(tmpDir, "audit-fixture.pptx");
  await fs.mkdir(tmpDir, { recursive: true });
  await execFileAsync("node", [
    path.join(root, "scripts/export_spec_to_editable_pptx.mjs"),
    path.join(root, "test/integration/ma-investment-committee/spec.json"),
    outPath,
  ]);
  const buffer = await fs.readFile(outPath);
  const result = await auditPptxStructure(buffer);
  assert.deepEqual(result, { passed: true, errors: [] });
});
