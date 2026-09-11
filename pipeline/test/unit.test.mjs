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
import { selectPattern } from "../scripts/reference_pattern_selector.mjs";
import {
  preFamilyIrToMatrixQuadrants,
  preFamilyIrToIssueTree,
  preFamilyIrToRoadmapPhases,
  preFamilyIrToKpiDashboard,
  preFamilyIrToSlideSpec,
} from "../scripts/pre_family_ir_to_slide_spec.mjs";
import JSZip from "jszip";

// Shared fixtures for the Reference Pattern Selector / Pre-family Semantic IR tests below —
// origin="authored" throughout, matching how this pipeline actually produces this IR (an LLM
// authors it directly against a pattern's contract; nothing here is regex-inferred).
const MATRIX_HERO_IR = {
  elements: [
    { id: "axis-y", semanticRole: "chartTicks", groupId: null, value: "対応緊急度" },
    { id: "axis-x", semanticRole: "chartTicks", groupId: null, value: "事業影響度" },
    ...["top-left", "top-right", "bottom-left", "bottom-right"].flatMap((pos) => [
      { id: `${pos}-title`, semanticRole: "title", groupId: pos, value: `${pos} title` },
      { id: `${pos}-body`, semanticRole: "body", groupId: pos, value: `${pos} body`, emphasis: pos === "top-right" },
      { id: `${pos}-secondary`, semanticRole: "secondary", groupId: pos, value: `${pos} evidence` },
    ]),
  ],
  relationships: ["top-left", "top-right", "bottom-left", "bottom-right"].flatMap((pos) => [
    { type: "axis_membership", from: { kind: "group", id: pos }, to: { kind: "element", id: "axis-y" }, attributes: { axisRole: "urgency", position: "high" }, origin: "authored" },
    { type: "axis_membership", from: { kind: "group", id: pos }, to: { kind: "element", id: "axis-x" }, attributes: { axisRole: "impact", position: "high" }, origin: "authored" },
  ]),
};

test("reference_pattern_selector: matrix content with rich per-quadrant fields selects RP-MATRIX-HERO-01, not PLAIN", async () => {
  const result = await selectPattern({ family: "matrix", variant: "hero" }, MATRIX_HERO_IR);
  assert.equal(result.eligibility, "PASS");
  assert.equal(result.selectedPattern, "RP-MATRIX-HERO-01");
  assert.equal(result.rejectedCandidates[0]?.patternId, "RP-MATRIX-PLAIN-01");
});

test("reference_pattern_selector: matrix content with only 1 authored axis is rejected (MATRIX_SINGLE_AXIS)", async () => {
  const ir = {
    elements: MATRIX_HERO_IR.elements,
    relationships: MATRIX_HERO_IR.relationships.filter((r) => r.attributes.axisRole !== "impact"),
  };
  const result = await selectPattern({ family: "matrix", variant: "hero" }, ir);
  assert.equal(result.eligibility, "FAIL");
  assert.equal(result.selectedPattern, null);
});

test("reference_pattern_selector: hierarchy root with 2 children selects RP-HIERARCHY-WORKSTREAM-01", async () => {
  const ir = {
    elements: [
      { id: "root", semanticRole: "title", groupId: null, value: "root" },
      { id: "c1", semanticRole: "title", groupId: "c1", value: "child 1" },
      { id: "c2", semanticRole: "title", groupId: "c2", value: "child 2" },
    ],
    relationships: [
      { type: "contains", from: { kind: "element", id: "root" }, to: { kind: "group", id: "c1" }, attributes: {}, origin: "authored" },
      { type: "contains", from: { kind: "element", id: "root" }, to: { kind: "group", id: "c2" }, attributes: {}, origin: "authored" },
    ],
  };
  const result = await selectPattern({ family: "hierarchy", variant: "standard" }, ir);
  assert.equal(result.eligibility, "PASS");
  assert.equal(result.selectedPattern, "RP-HIERARCHY-WORKSTREAM-01");
});

test("reference_pattern_selector: hierarchy with 2 ambiguous roots is rejected, not force-selected", async () => {
  const ir = {
    elements: [
      { id: "r1", semanticRole: "title", groupId: null, value: "r1" },
      { id: "r2", semanticRole: "title", groupId: null, value: "r2" },
      { id: "c1", semanticRole: "title", groupId: "c1", value: "child" },
    ],
    relationships: [
      { type: "contains", from: { kind: "element", id: "r1" }, to: { kind: "group", id: "c1" }, attributes: {}, origin: "authored" },
      { type: "contains", from: { kind: "element", id: "r2" }, to: { kind: "group", id: "c1" }, attributes: {}, origin: "authored" },
    ],
  };
  const result = await selectPattern({ family: "hierarchy", variant: "standard" }, ir);
  assert.equal(result.eligibility, "FAIL");
});

test("pre_family_ir_to_slide_spec: matrix adapter output is schema-valid and exports to a clean PPTX", async () => {
  const selection = await selectPattern({ family: "matrix", variant: "hero" }, MATRIX_HERO_IR);
  const slide = preFamilyIrToSlideSpec(selection, MATRIX_HERO_IR, { title: "後任体制の早期確定が最優先課題である" });
  assert.equal(slide.template, "matrix_2x2");
  assert.equal(slide.quadrants.length, 4);
  assert.ok(slide.quadrants.find((q) => q.position === "top-right").emphasis);

  const specPath = path.join(tmpDir, "adapter-matrix-spec.json");
  await fs.writeFile(specPath, JSON.stringify({ deckTitle: "t", slides: [slide] }));
  await execFileAsync("node", [path.join(root, "scripts/validate_spec.mjs"), specPath]);
  const pptxPath = path.join(tmpDir, "adapter-matrix.pptx");
  await execFileAsync("node", [path.join(root, "scripts/export_spec_to_editable_pptx.mjs"), specPath, pptxPath]);
  assert.deepEqual(await auditPptxStructure(await fs.readFile(pptxPath)), { passed: true, errors: [] });
});

test("pre_family_ir_to_slide_spec: hierarchy adapter drops body/bullets rather than authoring fields the renderer can't show", () => {
  const ir = {
    elements: [
      { id: "root", semanticRole: "title", groupId: null, value: "root" },
      { id: "c1", semanticRole: "title", groupId: "c1", value: "child 1" },
      { id: "c1-body", semanticRole: "body", groupId: "c1", value: "unrendered body text" },
      { id: "c2", semanticRole: "title", groupId: "c2", value: "child 2" },
    ],
    relationships: [
      { type: "contains", from: { kind: "element", id: "root" }, to: { kind: "group", id: "c1" }, attributes: {}, origin: "authored" },
      { type: "contains", from: { kind: "element", id: "root" }, to: { kind: "group", id: "c2" }, attributes: {}, origin: "authored" },
    ],
  };
  const result = preFamilyIrToIssueTree(ir);
  assert.deepEqual(result.tree.branches, [{ label: "child 1" }, { label: "child 2" }]);
});

test("pre_family_ir_to_slide_spec: roadmap adapter orders phases/milestones via `sequence` and carries the outcomes band", () => {
  const ir = {
    elements: [
      { id: "p1t", semanticRole: "title", groupId: "p1", value: "フェーズ1" },
      { id: "p2t", semanticRole: "title", groupId: "p2", value: "フェーズ2" },
      { id: "m1t", semanticRole: "title", groupId: "m1", value: "M1" },
      { id: "m1d", semanticRole: "date", groupId: "m1", value: "Day0" },
      { id: "m2t", semanticRole: "title", groupId: "m2", value: "M2", emphasis: true },
      { id: "oc", semanticRole: "bullets", groupId: "outcomes", value: "outcome 1" },
    ],
    relationships: [
      // phases authored out of order on purpose — `sequence` must be what determines order.
      { type: "sequence", from: { kind: "group", id: "p1" }, to: { kind: "group", id: "p2" }, attributes: {}, origin: "authored" },
      { type: "contains", from: { kind: "group", id: "p2" }, to: { kind: "group", id: "m2" }, attributes: {}, origin: "authored" },
      { type: "contains", from: { kind: "group", id: "p1" }, to: { kind: "group", id: "m1" }, attributes: {}, origin: "authored" },
    ],
  };
  const result = preFamilyIrToRoadmapPhases(ir);
  assert.deepEqual(result.phases.map((p) => p.title), ["フェーズ1", "フェーズ2"]);
  assert.equal(result.phases[1].milestones[0].emphasis, true);
  assert.deepEqual(result.outcomes, { bullets: ["outcome 1"] });
});

// --- RP-KPI-EXEC-DASHBOARD-01 (Library v0.2, first pattern) ---

function kpiGroupElements(n, label, value, extra = {}) {
  const els = [
    { id: `k${n}-title`, semanticRole: "title", groupId: `kpi-${n}`, value: label },
    { id: `k${n}-value`, semanticRole: "value", groupId: `kpi-${n}`, value },
  ];
  if (extra.unit) els.push({ id: `k${n}-unit`, semanticRole: "chartCaption", groupId: `kpi-${n}`, value: extra.unit });
  if (extra.delta) els.push({ id: `k${n}-delta`, semanticRole: "secondary", groupId: `kpi-${n}`, value: extra.delta });
  if (extra.icon) els.push({ id: `k${n}-icon`, semanticRole: "icon", groupId: `kpi-${n}`, value: extra.icon });
  if (extra.context) els.push({ id: `k${n}-context`, semanticRole: "context", groupId: `kpi-${n}`, value: extra.context });
  if (extra.spark) els.push({ id: `k${n}-spark`, semanticRole: "spark", groupId: `kpi-${n}`, value: extra.spark.join(",") });
  if (extra.note) els.push({ id: `k${n}-note`, semanticRole: "body", groupId: `kpi-${n}`, value: extra.note });
  return els;
}

test("reference_pattern_selector: 3-5 KPI groups select RP-KPI-EXEC-DASHBOARD-01; 2 and 6 are both rejected", async () => {
  const irOf = (count) => ({
    elements: Array.from({ length: count }, (_, i) => kpiGroupElements(i + 1, `KPI${i + 1}`, "10", { unit: "%" })).flat(),
    relationships: [],
  });
  const three = await selectPattern({ family: "kpi-dashboard", variant: "standard" }, irOf(3));
  assert.equal(three.eligibility, "PASS");
  assert.equal(three.selectedPattern, "RP-KPI-EXEC-DASHBOARD-01");

  const five = await selectPattern({ family: "kpi-dashboard", variant: "standard" }, irOf(5));
  assert.equal(five.eligibility, "PASS");

  const two = await selectPattern({ family: "kpi-dashboard", variant: "standard" }, irOf(2));
  assert.equal(two.eligibility, "FAIL", "1-2 KPIs should defer to a hero-KPI-shaped template, not force this pattern");

  const six = await selectPattern({ family: "kpi-dashboard", variant: "standard" }, irOf(6));
  assert.equal(six.eligibility, "FAIL", "6+ KPIs should defer to a dense-dashboard shape, not force this pattern");
});

test("reference_pattern_selector: a KPI group missing its value element doesn't count toward KPI_COUNT_IN_RANGE", async () => {
  const ir = {
    elements: [
      ...kpiGroupElements(1, "KPI1", "10"),
      ...kpiGroupElements(2, "KPI2", "20"),
      { id: "k3-title", semanticRole: "title", groupId: "kpi-3", value: "KPI3" }, // no value element
    ],
    relationships: [],
  };
  const result = await selectPattern({ family: "kpi-dashboard", variant: "standard" }, ir);
  assert.equal(result.eligibility, "FAIL");
});

test("pre_family_ir_to_slide_spec: kpi_dashboard adapter builds kpis[] (incl. icon/context/spark) in authoring order, plus a keyMessage", () => {
  const ir = {
    elements: [
      { id: "km", semanticRole: "headline", groupId: null, value: "収益性は改善基調である" },
      ...kpiGroupElements(1, "売上高", "128", { unit: "億円", delta: "+12%", icon: "bar-chart", context: "トップライン", spark: [85, 92, 100] }),
      ...kpiGroupElements(2, "EBITDA", "18.4", { unit: "億円", delta: "+2.1億円" }),
      ...kpiGroupElements(3, "粗利率", "32.5", { unit: "%", delta: "+1.8pt" }),
    ],
    relationships: [],
  };
  const result = preFamilyIrToKpiDashboard(ir);
  assert.equal(result.keyMessage, "収益性は改善基調である");
  assert.deepEqual(result.kpis.map((k) => k.label), ["売上高", "EBITDA", "粗利率"]);
  assert.equal(result.kpis[0].icon, "bar-chart");
  assert.equal(result.kpis[0].context, "トップライン");
  assert.deepEqual(result.kpis[0].spark, [85, 92, 100]);
  assert.equal(result.kpis[1].icon, undefined, "a KPI that authored no icon should not get a fabricated one");
});

test("pre_family_ir_to_slide_spec: kpi_dashboard adapter wires a sequence-ordered 2-bar + line trend chart", () => {
  const ir = {
    elements: [
      ...kpiGroupElements(1, "売上高", "128"),
      ...kpiGroupElements(2, "EBITDA", "18.4"),
      ...kpiGroupElements(3, "粗利率", "32.5"),
      { semanticRole: "chartCaption", groupId: "trendChart", value: "億円 ／ ％" },
      { semanticRole: "title", groupId: "trendChart", value: "売上高（億円）" },
      { semanticRole: "secondary", groupId: "trendChart", value: "EBITDA（億円）" },
      { semanticRole: "lineLabel", groupId: "trendChart", value: "粗利率（%）" },
      // authored out of order — `sequence` must be what determines order, same as roadmap.
      { semanticRole: "title", groupId: "trendChart-p2", value: "Q2" },
      { semanticRole: "value", groupId: "trendChart-p2", value: "92" },
      { semanticRole: "value2", groupId: "trendChart-p2", value: "12" },
      { semanticRole: "lineValue", groupId: "trendChart-p2", value: "28" },
      { semanticRole: "title", groupId: "trendChart-p1", value: "Q1" },
      { semanticRole: "value", groupId: "trendChart-p1", value: "85" },
      { semanticRole: "value2", groupId: "trendChart-p1", value: "11" },
      { semanticRole: "lineValue", groupId: "trendChart-p1", value: "27" },
    ],
    relationships: [
      { type: "contains", from: { kind: "group", id: "trendChart" }, to: { kind: "group", id: "trendChart-p2" }, attributes: {}, origin: "authored" },
      { type: "contains", from: { kind: "group", id: "trendChart" }, to: { kind: "group", id: "trendChart-p1" }, attributes: {}, origin: "authored" },
      { type: "sequence", from: { kind: "group", id: "trendChart-p1" }, to: { kind: "group", id: "trendChart-p2" }, attributes: {}, origin: "authored" },
    ],
  };
  const result = preFamilyIrToKpiDashboard(ir);
  assert.deepEqual(result.trendChart, {
    unit: "億円 ／ ％",
    periods: ["Q1", "Q2"],
    bars: [{ label: "売上高（億円）", values: [85, 92] }, { label: "EBITDA（億円）", values: [11, 12] }],
    line: { label: "粗利率（%）", values: [27, 28] },
  });
});

test("pre_family_ir_to_slide_spec: kpi_dashboard adapter requires value2 on every point once trendChart declares a bar2 label", () => {
  const ir = {
    elements: [
      ...kpiGroupElements(1, "売上高", "128"),
      ...kpiGroupElements(2, "EBITDA", "18.4"),
      ...kpiGroupElements(3, "粗利率", "32.5"),
      { semanticRole: "title", groupId: "trendChart", value: "売上高" },
      { semanticRole: "secondary", groupId: "trendChart", value: "EBITDA" }, // declares a bar2 label
      { semanticRole: "title", groupId: "trendChart-p1", value: "Q1" },
      { semanticRole: "value", groupId: "trendChart-p1", value: "85" }, // no value2 authored
    ],
    relationships: [
      { type: "contains", from: { kind: "group", id: "trendChart" }, to: { kind: "group", id: "trendChart-p1" }, attributes: {}, origin: "authored" },
    ],
  };
  assert.throws(() => preFamilyIrToKpiDashboard(ir), /value2/);
});

test("pre_family_ir_to_slide_spec: kpi_dashboard adapter rejects a KPI count outside 3-5 (not the Selector's job to have caught it if called directly)", () => {
  const ir = { elements: kpiGroupElements(1, "KPI1", "10"), relationships: [] };
  assert.throws(() => preFamilyIrToKpiDashboard(ir), /3-5/);
});

test("check_content_structure: flags 2 KPI tiles sharing the same label", () => {
  const spec = { deckTitle: "t", slides: [{ template: "kpi_dashboard", title: "t", kpis: [{ label: "売上高", value: "1" }, { label: "EBITDA", value: "2" }, { label: "売上高", value: "3" }] }] };
  const result = checkContentStructure(spec);
  assert.equal(result.passed, false);
  assert.ok(result.errors.some((e) => e.type === "duplicate_kpi_label"));
});

test("check_content_structure: flags a ▲/▼/↑/↓ prefix on a KPI delta (self-contradictory or wrongly implies which direction is good)", () => {
  const spec = { deckTitle: "t", slides: [{ template: "kpi_dashboard", title: "t", kpis: [{ label: "売上高", value: "128", delta: "▲ +12%（前年同期比）" }, { label: "NWC回転日数", value: "41", delta: "-6日（前年同期比）" }] }] };
  const result = checkContentStructure(spec);
  assert.equal(result.passed, false);
  const finding = result.errors.find((e) => e.type === "kpi_delta_direction_glyph");
  assert.ok(finding);
  assert.equal(finding.element, "kpis[0].delta");
});

test("kpi_dashboard end to end: 3/4/5-KPI fixtures (incl. the full standard variant: keyMessage + icon/context/spark + 2-bar+line trend chart + insights) render with 0 QA findings and export to a clean PPTX", async () => {
  const period = (n, label, v1, v2, lv) => ({
    id: `p${n}`, group: `trendChart-p${n}`, els: [
      { semanticRole: "title", groupId: `trendChart-p${n}`, value: label },
      { semanticRole: "value", groupId: `trendChart-p${n}`, value: String(v1) },
      { semanticRole: "value2", groupId: `trendChart-p${n}`, value: String(v2) },
      { semanticRole: "lineValue", groupId: `trendChart-p${n}`, value: String(lv) },
    ],
  });
  const periods = [
    period(1, "FY2023 Q1", 85, 11, 27), period(2, "FY2023 Q2", 83, 12, 28),
    period(3, "FY2023 Q3", 88, 13, 29), period(4, "FY2023 Q4", 95, 14, 30),
  ];
  const fixtures = [
    {
      // A: 3 KPI + insights, no trend chart, no keyMessage/icons — the minimal end of the range.
      elements: [
        ...kpiGroupElements(1, "売上高", "128", { unit: "億円", delta: "+12%" }),
        ...kpiGroupElements(2, "EBITDA", "18.4", { unit: "億円", delta: "+2.1億円" }),
        ...kpiGroupElements(3, "粗利率", "32.5", { unit: "%", delta: "+1.8pt" }),
        { id: "ins-1", semanticRole: "bullets", groupId: "insights", value: "売上成長は継続している" },
        { id: "ins-2", semanticRole: "bullets", groupId: "insights", value: "収益性改善は調達統合が寄与" },
      ],
      relationships: [],
    },
    {
      // B: the full "standard" variant matching RP-KPI-EXEC-DASHBOARD-01's reference image —
      // keyMessage band, 4 KPI with icon/context/spark, 2-bar+line trend chart, insights.
      elements: [
        { semanticRole: "headline", groupId: null, value: "収益性は改善基調、次の論点は運転資本の圧縮" },
        ...kpiGroupElements(1, "売上高", "128", { icon: "bar-chart", context: "トップラインの持続的な成長", unit: "億円", delta: "+12%", spark: [85, 88, 95, 99], note: "新規顧客獲得と既存単価上昇" }),
        ...kpiGroupElements(2, "EBITDA", "18.4", { icon: "coins", context: "収益力の強化とキャッシュ創出", unit: "億円", delta: "+2.1億円", spark: [11, 12, 13, 14] }),
        ...kpiGroupElements(3, "粗利率", "32.5", { icon: "pie", context: "高付加価値化による収益性向上", unit: "%", delta: "+1.8pt", spark: [27, 28, 29, 30] }),
        ...kpiGroupElements(4, "NWC回転日数", "41", { icon: "cycle", context: "運転資本の効率化", unit: "日", delta: "-6日" }),
        { semanticRole: "chartCaption", groupId: "trendChart", value: "億円 ／ ％" },
        { semanticRole: "title", groupId: "trendChart", value: "売上高（億円）" },
        { semanticRole: "secondary", groupId: "trendChart", value: "EBITDA（億円）" },
        { semanticRole: "lineLabel", groupId: "trendChart", value: "粗利率（%・右軸）" },
        ...periods.flatMap((p) => p.els),
        { semanticRole: "title", groupId: "insights", value: "示唆" },
        { semanticRole: "bullets", groupId: "insights", value: "売上成長は継続している" },
        { semanticRole: "bullets", groupId: "insights", value: "収益性改善は調達統合が寄与" },
      ],
      relationships: [
        ...periods.map((p) => ({ type: "contains", from: { kind: "group", id: "trendChart" }, to: { kind: "group", id: p.group }, attributes: {}, origin: "authored" })),
        ...periods.slice(1).map((p, i) => ({ type: "sequence", from: { kind: "group", id: periods[i].group }, to: { kind: "group", id: p.group }, attributes: {}, origin: "authored" })),
      ],
    },
    {
      // C: 5 KPI (3+2 layout) with long labels/notes and mixed units, both insights + no chart
      elements: [
        ...kpiGroupElements(1, "海外売上比率（アジア・北米・欧州合算）", "38.6", { unit: "%", delta: "+4.2pt" }),
        ...kpiGroupElements(2, "重点顧客あたり平均取引額", "4,820", { unit: "万円", delta: "+320万円" }),
        ...kpiGroupElements(3, "従業員エンゲージメントスコア", "71", { unit: "pt", delta: "+3pt" }),
        ...kpiGroupElements(4, "フリーキャッシュフロー", "9.6", { unit: "億円", delta: "-1.2億円" }),
        ...kpiGroupElements(5, "主要プロジェクト進捗率", "82", { unit: "%", delta: "+15pt" }),
        { id: "ins-1", semanticRole: "bullets", groupId: "insights", value: "海外比率の拡大が全体成長を牽引" },
      ],
      relationships: [],
    },
  ];

  const titles = [
    "収益性は改善基調、次の論点は運転資本の圧縮",
    "顧客基盤は拡大し、収益性も改善している",
    "海外展開とエンゲージメント向上が成長を牽引する",
  ];
  for (const [i, ir] of fixtures.entries()) {
    const selection = await selectPattern({ family: "kpi-dashboard", variant: "standard" }, ir);
    assert.equal(selection.eligibility, "PASS", `fixture ${i}: ${JSON.stringify(selection.rejectedCandidates)}`);
    const slide = preFamilyIrToSlideSpec(selection, ir, { title: titles[i], source: "Source: test" });

    const specPath = path.join(tmpDir, `kpi-e2e-${i}-spec.json`);
    const htmlPath = path.join(tmpDir, `kpi-e2e-${i}.html`);
    await fs.writeFile(specPath, JSON.stringify({ deckTitle: "t", slides: [slide] }));
    await execFileAsync("node", [path.join(root, "scripts/render_spec_to_html.mjs"), specPath, htmlPath]);

    const gateResult = await execFileAsync("node", [path.join(root, "scripts/run_mechanical_gate.mjs"), specPath, htmlPath]);
    const gateReport = JSON.parse(gateResult.stdout);
    assert.equal(gateReport.passed, true, `fixture ${i} mechanical gate: ${JSON.stringify(gateReport.errors)}`);

    const pptxPath = path.join(tmpDir, `kpi-e2e-${i}.pptx`);
    await execFileAsync("node", [path.join(root, "scripts/export_spec_to_editable_pptx.mjs"), specPath, pptxPath]);
    const auditResult = await auditPptxStructure(await fs.readFile(pptxPath));
    assert.deepEqual(auditResult, { passed: true, errors: [] }, `fixture ${i} PPTX audit`);
  }
});

test("render_html_screenshots: an issue_tree root box does not false-positive as overflow (matches qa_html_deck.mjs's own .ltree exclusion)", async () => {
  // Regression for a real drift found while wiring up the Hierarchy Reference Pattern: a
  // hierarchy slide with a normal-length root label (経営改善タスクフォース) reported an
  // overflow via render_html_screenshots.mjs's OWN overflow check, even though the identical
  // HTML passes qa_html_deck.mjs (the actual Mechanical QA gate) cleanly — that script already
  // excludes .ltree boxes for the documented reason (elbow-connector pseudo-elements overshoot
  // the box by a few px, confirmed not a real visual defect). render_html_screenshots.mjs had
  // its own separate, older overflow-detection copy that never got the same exclusion. Fixed
  // by mirroring qa_html_deck.mjs's exact exclusion there — this test locks both scripts to
  // agree on the same real hierarchy content, not just a synthetic .ltree fixture.
  const slide = { template: "issue_tree", title: "経営改善タスクフォースは4ワークストリームで推進する", tree: { root: "経営改善タスクフォース", branches: [{ label: "営業ワークストリーム" }, { label: "調達ワークストリーム" }, { label: "人事ワークストリーム" }, { label: "経営管理ワークストリーム" }] } };
  const specPath = path.join(tmpDir, "ltree-overflow-regression-spec.json");
  const htmlPath = path.join(tmpDir, "ltree-overflow-regression.html");
  await fs.writeFile(specPath, JSON.stringify({ deckTitle: "t", slides: [slide] }));
  await execFileAsync("node", [path.join(root, "scripts/render_spec_to_html.mjs"), specPath, htmlPath]);

  const { stdout: screenshotsStdout } = await execFileAsync("node", [
    path.join(root, "scripts/render_html_screenshots.mjs"), htmlPath, path.join(tmpDir, "ltree-overflow-regression-screenshots"),
  ]);
  const screenshotsReport = JSON.parse(screenshotsStdout);
  assert.equal(screenshotsReport.overflowCount, 0, `render_html_screenshots.mjs still false-positives: ${JSON.stringify(screenshotsReport.overflow)}`);

  const gateResult = await execFileAsync("node", [path.join(root, "scripts/run_mechanical_gate.mjs"), specPath, htmlPath]);
  const gateReport = JSON.parse(gateResult.stdout);
  assert.equal(gateReport.passed, true);
  assert.equal(gateReport.tiers.geometry.passed, true);
});

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
