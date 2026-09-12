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
  preFamilyIrToComparisonTable,
  preFamilyIrToDecisionGroups,
  preFamilyIrToKeyTakeaways,
  preFamilyIrToMatrixBadgeList,
  preFamilyIrToWorkstream100Day,
  preFamilyIrToOperatingModelCascade,
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

// --- RP-COMPARISON-TABLE-01 (Library v0.2, second pattern) ---

function cmpCandidateElements(gid, label, cells, opts = {}) {
  const els = [{ semanticRole: "title", groupId: gid, value: label, ...(opts.highlight ? { emphasis: true } : {}) }];
  cells.forEach((cell) => els.push({ semanticRole: "value", groupId: gid, value: cell }));
  if (opts.recommendationValue) els.push({ semanticRole: "recommendationValue", groupId: gid, value: opts.recommendationValue });
  return els;
}

test("reference_pattern_selector: 2-5 candidates x matching criteria/value counts select RP-COMPARISON-TABLE-01", async () => {
  const criteria = ["Fit", "Risk"];
  const irOf = (n) => ({
    elements: [
      ...criteria.map((c) => ({ semanticRole: "title", groupId: "criteria", value: c })),
      ...Array.from({ length: n }, (_, i) => cmpCandidateElements(`c${i}`, `Candidate ${i}`, ["○|ok", "○|ok"])).flat(),
    ],
    relationships: [],
  });
  const two = await selectPattern({ family: "comparison-table", variant: "standard" }, irOf(2));
  assert.equal(two.eligibility, "PASS");
  assert.equal(two.selectedPattern, "RP-COMPARISON-TABLE-01");

  const five = await selectPattern({ family: "comparison-table", variant: "standard" }, irOf(5));
  assert.equal(five.eligibility, "PASS");

  const one = await selectPattern({ family: "comparison-table", variant: "standard" }, irOf(1));
  assert.equal(one.eligibility, "FAIL", "1 candidate is nothing to compare");

  const six = await selectPattern({ family: "comparison-table", variant: "standard" }, irOf(6));
  assert.equal(six.eligibility, "FAIL", "6+ candidates should defer to a dense table");
});

test("reference_pattern_selector: a candidate with a mismatched cell count (missing/extra value) is rejected", async () => {
  const ir = {
    elements: [
      { semanticRole: "title", groupId: "criteria", value: "Fit" },
      { semanticRole: "title", groupId: "criteria", value: "Risk" },
      ...cmpCandidateElements("a", "A", ["○|ok", "○|ok"]),
      ...cmpCandidateElements("b", "B", ["○|ok"]), // missing 1 value cell
    ],
    relationships: [],
  };
  const result = await selectPattern({ family: "comparison-table", variant: "standard" }, ir);
  assert.equal(result.eligibility, "FAIL");
});

test("pre_family_ir_to_slide_spec: comparison_table adapter builds candidates/cells, highlight, recommendation row, and summary panel", () => {
  const ir = {
    elements: [
      { semanticRole: "title", groupId: "criteria", value: "Strategic Fit" },
      { semanticRole: "title", groupId: "criteria", value: "Synergy" },
      ...cmpCandidateElements("cand-a", "候補A", ["○|方向性は一致", "○|中程度"], { recommendationValue: "△|非推奨" }),
      ...cmpCandidateElements("cand-b", "候補B", ["◎|中核戦略に合致", "◎|大きい"], { highlight: true, recommendationValue: "◎|最有力" }),
      { semanticRole: "title", groupId: "recommendation", value: "Recommendation" },
      { semanticRole: "title", groupId: "comparisonSummary", value: "総括" },
      { semanticRole: "bullets", groupId: "comparisonSummary", value: "候補Bが最良" },
      { semanticRole: "body", groupId: "comparisonSummary", value: "候補Bを推奨する。" },
      { semanticRole: "chartCaption", groupId: "comparisonSummary", value: "結論" },
    ],
    relationships: [],
  };
  const result = preFamilyIrToComparisonTable(ir);
  assert.deepEqual(result.comparison.criteria, ["Strategic Fit", "Synergy"]);
  assert.equal(result.comparison.candidates.length, 2);
  assert.deepEqual(result.comparison.candidates[0].cells[0], { symbol: "○", caption: "方向性は一致" });
  assert.equal(result.comparison.candidates[0].highlight, undefined);
  assert.equal(result.comparison.candidates[1].highlight, true);
  assert.deepEqual(result.comparison.recommendation, {
    label: "Recommendation",
    cells: [{ symbol: "△", caption: "非推奨" }, { symbol: "◎", caption: "最有力" }],
  });
  assert.deepEqual(result.comparisonSummary, { points: ["候補Bが最良"], title: "総括", conclusion: "候補Bを推奨する。", conclusionLabel: "結論" });
});

test("pre_family_ir_to_slide_spec: comparison_table adapter rejects an unknown rating symbol", () => {
  const ir = {
    elements: [
      { semanticRole: "title", groupId: "criteria", value: "Fit" },
      { semanticRole: "title", groupId: "criteria", value: "Risk" },
      ...cmpCandidateElements("a", "A", ["★|ok", "○|ok"]), // ★ is not a valid rating symbol
      ...cmpCandidateElements("b", "B", ["○|ok", "○|ok"]),
    ],
    relationships: [],
  };
  assert.throws(() => preFamilyIrToComparisonTable(ir), /◎\/○\/△\/×/);
});

test("comparison_table end to end: the reference image's own 5-criteria x 3-candidate + recommendation + summary composition renders with 0 QA findings and exports to a clean PPTX", async () => {
  const criteria = ["Strategic Fit（戦略との整合性）", "Synergy Potential（シナジー創出の可能性）", "Execution Risk（実行リスク）", "Investment Size（投資規模）", "PMI Complexity（PMIの複雑性）"];
  const ir = {
    elements: [
      ...criteria.map((c) => ({ semanticRole: "title", groupId: "criteria", value: c })),
      ...cmpCandidateElements("cand-a", "候補A", ["○|方向性は一致", "○|中程度", "○|管理可能", "△|大きい", "△|高い"], { recommendationValue: "△|非推奨" }),
      ...cmpCandidateElements("cand-b", "候補B", ["◎|中核戦略に合致", "◎|大きい", "○|管理可能", "○|中程度", "○|中程度"], { highlight: true, recommendationValue: "◎|最有力" }),
      ...cmpCandidateElements("cand-c", "候補C", ["○|一部で整合", "△|限定的", "△|不確実性が高い", "○|小さい", "○|低い"], { recommendationValue: "△|慎重に検討" }),
      { semanticRole: "title", groupId: "recommendation", value: "Recommendation（総合評価）" },
      { semanticRole: "title", groupId: "comparisonSummary", value: "総括" },
      { semanticRole: "bullets", groupId: "comparisonSummary", value: "候補Bは戦略適合とシナジーのバランスが最良" },
      { semanticRole: "bullets", groupId: "comparisonSummary", value: "候補Aは投資負担が重い" },
      { semanticRole: "bullets", groupId: "comparisonSummary", value: "候補Cは実行リスクが相対的に高い" },
      { semanticRole: "body", groupId: "comparisonSummary", value: "中長期の成長に向けて、候補Bを優先的に検討することを推奨する。" },
    ],
    relationships: [],
  };
  const selection = await selectPattern({ family: "comparison-table", variant: "standard" }, ir);
  assert.equal(selection.eligibility, "PASS", JSON.stringify(selection.rejectedCandidates));
  const slide = preFamilyIrToSlideSpec(selection, ir, { title: "戦略オプションを主要評価軸で比較する", source: "Source: test" });

  const specPath = path.join(tmpDir, "cmp-e2e-spec.json");
  const htmlPath = path.join(tmpDir, "cmp-e2e.html");
  await fs.writeFile(specPath, JSON.stringify({ deckTitle: "t", slides: [slide] }));
  await execFileAsync("node", [path.join(root, "scripts/render_spec_to_html.mjs"), specPath, htmlPath]);

  const gateResult = await execFileAsync("node", [path.join(root, "scripts/run_mechanical_gate.mjs"), specPath, htmlPath]);
  const gateReport = JSON.parse(gateResult.stdout);
  assert.equal(gateReport.passed, true, JSON.stringify(gateReport.errors));

  const pptxPath = path.join(tmpDir, "cmp-e2e.pptx");
  await execFileAsync("node", [path.join(root, "scripts/export_spec_to_editable_pptx.mjs"), specPath, pptxPath]);
  const auditResult = await auditPptxStructure(await fs.readFile(pptxPath));
  assert.deepEqual(auditResult, { passed: true, errors: [] });
});

// --- RP-DECISION-ASK-01 (Library v0.2, third pattern) ---

function dqGroupElements(gid, number, title, actions, opts = {}) {
  const els = [
    { semanticRole: "number", groupId: gid, value: number },
    { semanticRole: "title", groupId: gid, value: title },
    ...actions.map((a) => ({ semanticRole: "bullets", groupId: gid, value: a })),
  ];
  if (opts.context) els.push({ semanticRole: "context", groupId: gid, value: opts.context });
  if (opts.icon) els.push({ semanticRole: "icon", groupId: gid, value: opts.icon });
  return els;
}

test("reference_pattern_selector: 2-4 decision groups select RP-DECISION-ASK-01; 1 and 5 are both rejected", async () => {
  const irOf = (n) => ({
    elements: Array.from({ length: n }, (_, i) => dqGroupElements(`dg${i}`, String(i + 1).padStart(2, "0"), `Decision ${i}`, ["do the thing"])).flat(),
    relationships: [],
  });
  const two = await selectPattern({ family: "decision-ask", variant: "standard" }, irOf(2));
  assert.equal(two.eligibility, "PASS");
  assert.equal(two.selectedPattern, "RP-DECISION-ASK-01");

  const four = await selectPattern({ family: "decision-ask", variant: "standard" }, irOf(4));
  assert.equal(four.eligibility, "PASS");

  const one = await selectPattern({ family: "decision-ask", variant: "standard" }, irOf(1));
  assert.equal(one.eligibility, "FAIL", "a single decision item has no need for a multi-column ask layout");

  const five = await selectPattern({ family: "decision-ask", variant: "standard" }, irOf(5));
  assert.equal(five.eligibility, "FAIL", "5+ decisions overload a single ask slide");
});

test("reference_pattern_selector: a decision group with no action (bullets) elements is rejected", async () => {
  const ir = {
    elements: [
      ...dqGroupElements("dg0", "01", "Decision A", ["do the thing"]),
      { semanticRole: "number", groupId: "dg1", value: "02" },
      { semanticRole: "title", groupId: "dg1", value: "Decision B" }, // no bullets at all
    ],
    relationships: [],
  };
  const result = await selectPattern({ family: "decision-ask", variant: "standard" }, ir);
  assert.equal(result.eligibility, "FAIL");
});

test("pre_family_ir_to_slide_spec: decision_page adapter builds decisionGroups/recommendation/nextSteps and preserves action + step order", () => {
  const ir = {
    elements: [
      ...dqGroupElements("dg0", "01", "Day60組織案の承認", ["営業・調達・人事の責任体制を確定", "新組織への移行準備を開始"], { context: "組織を整える", icon: "org-chart" }),
      ...dqGroupElements("dg1", "02", "100日目標の承認", ["顧客離反ゼロ・購買30品目・KPI統合"], { context: "成果を出す", icon: "bar-chart" }),
      { semanticRole: "title", groupId: "recommendation", value: "推奨" },
      { semanticRole: "body", groupId: "recommendation", value: "2論点を一括承認する" },
      { semanticRole: "bullets", groupId: "nextSteps", value: "担当者通知" },
      { semanticRole: "bullets", groupId: "nextSteps", value: "詳細設計" },
      { semanticRole: "bullets", groupId: "nextSteps", value: "初回レビュー" },
    ],
    relationships: [],
  };
  const result = preFamilyIrToDecisionGroups(ir);
  assert.equal(result.decisionGroups.length, 2);
  assert.deepEqual(result.decisionGroups[0], { number: "01", title: "Day60組織案の承認", actions: ["営業・調達・人事の責任体制を確定", "新組織への移行準備を開始"], context: "組織を整える", icon: "org-chart" });
  assert.deepEqual(result.recommendation, { text: "2論点を一括承認する", label: "推奨" });
  assert.deepEqual(result.nextSteps, ["担当者通知", "詳細設計", "初回レビュー"]);
});

test("pre_family_ir_to_slide_spec: decision_page adapter rejects an icon outside the org-chart/bar-chart/people vocabulary", () => {
  const ir = { elements: [...dqGroupElements("dg0", "01", "A", ["x"], { icon: "coins" }), ...dqGroupElements("dg1", "02", "B", ["y"])], relationships: [] };
  assert.throws(() => preFamilyIrToDecisionGroups(ir), /org-chart\/bar-chart\/people/);
});

test("decision_page end to end: 3 fixtures (reference-faithful 3-decision+recommendation+3-steps, 2-decision adaptive width, 4-decision long-Japanese-text stress test) render with 0 QA findings and export to a clean PPTX", async () => {
  const fixtures = [
    {
      // A: the reference image's own composition — 3 decisions + recommendation + 3 next steps.
      elements: [
        ...dqGroupElements("dg0", "01", "Day60組織案の承認", ["営業・調達・人事の責任体制を確定", "新組織への移行準備を開始"], { context: "組織を整え、早期に実行力を立ち上げる", icon: "org-chart" }),
        ...dqGroupElements("dg1", "02", "100日目標の承認", ["顧客離反ゼロ・購買30品目・KPI統合", "成果指標のモニタリング方法を合意"], { context: "100日で成果を出し、統合の価値を可視化する", icon: "bar-chart" }),
        ...dqGroupElements("dg2", "03", "PMI会議体の承認", ["週次PMOと月次SteerCoを設置", "意思決定のエスカレーションルールを明確化"], { context: "適切なガバナンスで確実に実行を推進する", icon: "people" }),
        { semanticRole: "title", groupId: "recommendation", value: "推奨" },
        { semanticRole: "body", groupId: "recommendation", value: "3論点を一括承認し、Day60までに新体制へ移行" },
        { semanticRole: "bullets", groupId: "nextSteps", value: "担当者通知" },
        { semanticRole: "bullets", groupId: "nextSteps", value: "詳細設計" },
        { semanticRole: "bullets", groupId: "nextSteps", value: "初回レビュー" },
      ],
      relationships: [],
      title: "Day60組織・100日目標・PMI会議体の3論点についてご承認いただきたい",
      subtitle: "本日ご判断いただきたい主要論点",
    },
    {
      // B: 2 decisions, no recommendation/nextSteps — adaptive-width check.
      elements: [
        ...dqGroupElements("dg0", "01", "買収価格の上限承認", ["EV/EBITDA 7倍を上限として交渉する"], { context: "投資判断の前提となる財務影響を確認する", icon: "bar-chart" }),
        ...dqGroupElements("dg1", "02", "PMI推進体制の承認", ["統合PMOを設置する", "月次で取締役会に報告する"], { context: "統合後のガバナンス体制を確定する", icon: "people" }),
      ],
      relationships: [],
      title: "買収価格の上限とPMI推進体制についてご承認いただきたい",
      subtitle: "本日ご判断いただきたい2つの論点",
    },
    {
      // C: 4 decisions, long Japanese titles/actions/context — stress test.
      elements: [
        ...dqGroupElements("dg0", "01", "アジア3か国における現地法人設立方針の承認", ["現地法人設立に必要な初期投資予算（総額3.2億円）を承認する", "設立スケジュールを2026年度上期に確定する"], { context: "グローバル展開における現地法人設立の要否を判断する", icon: "org-chart" }),
        ...dqGroupElements("dg1", "02", "基幹システム刷新プロジェクトの投資承認とベンダー選定方針の確定", ["候補ベンダー3社の中から優先交渉先を1社選定する", "移行スケジュールと並行稼働期間を確定する"], { context: "既存基幹システムの刷新可否を判断する", icon: "bar-chart" }),
        ...dqGroupElements("dg2", "03", "グループ全体の人事評価制度・等級制度の統一方針承認", ["新等級制度の適用開始時期を来期首とする", "移行対象者への説明会実施計画を承認する"], { context: "人事制度統合の方向性を判断する", icon: "people" }),
        ...dqGroupElements("dg3", "04", "2030年までの温室効果ガス排出削減目標水準の承認", ["削減目標を2019年度比45%に設定する", "進捗モニタリング体制を四半期ごとに構築する"], { context: "サステナビリティ目標の水準を判断する", icon: "org-chart" }),
      ],
      relationships: [],
      title: "現地法人設立・基幹システム刷新・人事制度統合・GHG目標の4論点についてご承認いただきたい",
      subtitle: "本日ご判断いただきたい4つの主要論点",
    },
  ];

  for (const [i, fixture] of fixtures.entries()) {
    const selection = await selectPattern({ family: "decision-ask", variant: "standard" }, fixture);
    assert.equal(selection.eligibility, "PASS", `fixture ${i}: ${JSON.stringify(selection.rejectedCandidates)}`);
    const slide = preFamilyIrToSlideSpec(selection, fixture, { title: fixture.title, subtitle: fixture.subtitle, source: "Source: test" });

    const specPath = path.join(tmpDir, `dq-e2e-${i}-spec.json`);
    const htmlPath = path.join(tmpDir, `dq-e2e-${i}.html`);
    await fs.writeFile(specPath, JSON.stringify({ deckTitle: "t", slides: [slide] }));
    await execFileAsync("node", [path.join(root, "scripts/render_spec_to_html.mjs"), specPath, htmlPath]);

    const gateResult = await execFileAsync("node", [path.join(root, "scripts/run_mechanical_gate.mjs"), specPath, htmlPath]);
    const gateReport = JSON.parse(gateResult.stdout);
    assert.equal(gateReport.passed, true, `fixture ${i} mechanical gate: ${JSON.stringify(gateReport.errors)}`);

    const pptxPath = path.join(tmpDir, `dq-e2e-${i}.pptx`);
    await execFileAsync("node", [path.join(root, "scripts/export_spec_to_editable_pptx.mjs"), specPath, pptxPath]);
    const auditResult = await auditPptxStructure(await fs.readFile(pptxPath));
    assert.deepEqual(auditResult, { passed: true, errors: [] }, `fixture ${i} PPTX audit`);
  }
});

// --- RP-KEY-TAKEAWAYS-01 (Library v0.2, fourth pattern) ---

function twGroupElements(gid, number, category, headline, supportText, opts = {}) {
  const els = [
    { semanticRole: "number", groupId: gid, value: number },
    { semanticRole: "category", groupId: gid, value: category },
    { semanticRole: "headline", groupId: gid, value: headline },
    { semanticRole: "body", groupId: gid, value: supportText },
  ];
  if (opts.icon) els.push({ semanticRole: "icon", groupId: gid, value: opts.icon });
  if (opts.supportLabel) els.push({ semanticRole: "supportLabel", groupId: gid, value: opts.supportLabel });
  return els;
}
function insightItemElements(gid, number, title, body) {
  return [
    { semanticRole: "number", groupId: gid, value: number },
    { semanticRole: "title", groupId: gid, value: title },
    { semanticRole: "body", groupId: gid, value: body },
  ];
}
const SOWHAT_ELEMENTS = [
  { semanticRole: "title", groupId: "soWhat", value: "So What" },
  { semanticRole: "body", groupId: "soWhat", value: "So What text" },
];

test("reference_pattern_selector: 2-4 takeaways with an insightPanel and soWhat select RP-KEY-TAKEAWAYS-01; 1 and 5 takeaways are both rejected", async () => {
  const irOf = (n) => ({
    elements: [
      ...Array.from({ length: n }, (_, i) => twGroupElements(`tw${i}`, String(i + 1), `Cat${i}`, `Headline ${i}`, "support")).flat(),
      ...insightItemElements("insightPanel-i1", "1", "Insight", "body"),
      ...SOWHAT_ELEMENTS,
    ],
    relationships: [],
  });
  const two = await selectPattern({ family: "key-takeaways", variant: "standard" }, irOf(2));
  assert.equal(two.eligibility, "PASS");
  assert.equal(two.selectedPattern, "RP-KEY-TAKEAWAYS-01");

  const four = await selectPattern({ family: "key-takeaways", variant: "standard" }, irOf(4));
  assert.equal(four.eligibility, "PASS");

  const one = await selectPattern({ family: "key-takeaways", variant: "standard" }, irOf(1));
  assert.equal(one.eligibility, "FAIL");

  const five = await selectPattern({ family: "key-takeaways", variant: "standard" }, irOf(5));
  assert.equal(five.eligibility, "FAIL");
});

test("reference_pattern_selector: takeaways without an insightPanel are rejected even though the takeaway count itself is valid (insightPanel is mandatory, not optional)", async () => {
  const ir = {
    elements: [
      ...twGroupElements("tw0", "01", "A", "Headline A", "support A"),
      ...twGroupElements("tw1", "02", "B", "Headline B", "support B"),
      ...twGroupElements("tw2", "03", "C", "Headline C", "support C"),
      ...SOWHAT_ELEMENTS,
      // no insightPanel-* groups at all
    ],
    relationships: [],
  };
  const result = await selectPattern({ family: "key-takeaways", variant: "standard" }, ir);
  assert.equal(result.eligibility, "FAIL");
});

test("reference_pattern_selector: takeaways without a soWhat body are rejected even at the canonical 3-takeaway count (soWhat is mandatory, not optional)", async () => {
  const ir = {
    elements: [
      ...twGroupElements("tw0", "01", "A", "Headline A", "support A"),
      ...twGroupElements("tw1", "02", "B", "Headline B", "support B"),
      ...twGroupElements("tw2", "03", "C", "Headline C", "support C"),
      ...insightItemElements("insightPanel-i1", "1", "Insight", "body"),
      // no soWhat group at all
    ],
    relationships: [],
  };
  const result = await selectPattern({ family: "key-takeaways", variant: "standard" }, ir);
  assert.equal(result.eligibility, "FAIL");
});

test("pre_family_ir_to_slide_spec: recommendation_pillars adapter builds takeaways/insightPanel/soWhat and preserves insight-item order", () => {
  const ir = {
    elements: [
      ...twGroupElements("tw0", "01", "市場", "高付加価値セグメントが成長を牽引", "上位顧客の需要が堅調", { icon: "bar-chart", supportLabel: "サポートする示唆" }),
      ...twGroupElements("tw1", "02", "収益", "粗利改善余地は調達統合に集中", "共同購買の即効性が高い", { icon: "coins" }),
      { semanticRole: "title", groupId: "insightPanel", value: "示唆" },
      ...insightItemElements("insightPanel-i2", "2", "調達統合の迅速な着手", "共同購買によるコスト削減を早期に実現する"),
      ...insightItemElements("insightPanel-i1", "1", "成長領域への集中", "高付加価値セグメントに経営資源を優先配分する"),
      { semanticRole: "title", groupId: "soWhat", value: "So What" },
      { semanticRole: "body", groupId: "soWhat", value: "したがって、買収後100日間は価格より統合実行力が価値創出を左右する" },
    ],
    relationships: [],
  };
  const result = preFamilyIrToKeyTakeaways(ir);
  assert.equal(result.takeaways.length, 2);
  assert.deepEqual(result.takeaways[0], { number: "01", category: "市場", headline: "高付加価値セグメントが成長を牽引", supportText: "上位顧客の需要が堅調", icon: "bar-chart", supportLabel: "サポートする示唆" });
  assert.equal(result.insightPanel.title, "示唆");
  // authoring order in elements[] (i2 before i1) must be preserved, not re-sorted by number.
  assert.deepEqual(result.insightPanel.items.map((it) => it.number), ["2", "1"]);
  assert.deepEqual(result.soWhat, { text: "したがって、買収後100日間は価格より統合実行力が価値創出を左右する", label: "So What" });
});

test("pre_family_ir_to_slide_spec: recommendation_pillars adapter rejects an icon outside the bar-chart/coins/gear vocabulary", () => {
  const ir = {
    elements: [
      ...twGroupElements("tw0", "01", "A", "H", "S", { icon: "people" }),
      ...twGroupElements("tw1", "02", "B", "H", "S"),
      ...insightItemElements("insightPanel-i1", "1", "T", "B"),
      ...SOWHAT_ELEMENTS,
    ],
    relationships: [],
  };
  assert.throws(() => preFamilyIrToKeyTakeaways(ir), /bar-chart\/coins\/gear/);
});

test("key_takeaways end to end: 3 fixtures (reference-faithful 3-takeaway canonical, 2-takeaway adaptive width, 4-takeaway long-Japanese-text stress test) render with 0 QA findings and export to a clean PPTX", async () => {
  const fixtures = [
    {
      // A: the reference image's own composition.
      elements: [
        ...twGroupElements("tw0", "01", "市場", "高付加価値セグメントが成長を牽引", "上位顧客の需要が堅調", { icon: "bar-chart", supportLabel: "サポートする示唆" }),
        ...twGroupElements("tw1", "02", "収益", "粗利改善余地は調達統合に集中", "共同購買の即効性が高い", { icon: "coins", supportLabel: "サポートする示唆" }),
        ...twGroupElements("tw2", "03", "実行", "早期PMIで100日成果の確度向上", "Day60意思決定が重要", { icon: "gear", supportLabel: "サポートする示唆" }),
        { semanticRole: "title", groupId: "insightPanel", value: "示唆" },
        ...insightItemElements("insightPanel-i1", "1", "成長領域への集中", "高付加価値セグメントに経営資源を優先配分する"),
        ...insightItemElements("insightPanel-i2", "2", "調達統合の迅速な着手", "共同購買によるコスト削減を早期に実現する"),
        ...insightItemElements("insightPanel-i3", "3", "100日計画の厳格な遂行", "Day60の意思決定を起点に統合効果の刈り取りを加速する"),
        { semanticRole: "title", groupId: "soWhat", value: "So What" },
        { semanticRole: "body", groupId: "soWhat", value: "したがって、買収後100日間は価格より統合実行力が価値創出を左右する" },
      ],
      relationships: [],
      title: "検討全体から導く3つの結論について報告する",
      subtitle: "検討全体から導く3つの結論",
    },
    {
      // B: 2 takeaways — adaptive-width check.
      elements: [
        ...twGroupElements("tw0", "01", "財務影響", "買収価格はEV/EBITDA倍率の観点で妥当な水準にある", "デューデリジェンスで確認された収益性は事業計画と整合している", { icon: "bar-chart" }),
        ...twGroupElements("tw1", "02", "統合実行", "PMI体制の早期確立が統合効果実現の鍵を握る", "週次PMOによるモニタリング体制の即時導入が推奨される", { icon: "gear" }),
        { semanticRole: "title", groupId: "insightPanel", value: "示唆" },
        ...insightItemElements("insightPanel-i1", "1", "価格妥当性の確認", "独立評価機関による再検証を交渉の前提とする"),
        ...insightItemElements("insightPanel-i2", "2", "PMO即時設置", "統合初日から週次モニタリングを開始する"),
        { semanticRole: "title", groupId: "soWhat", value: "So What" },
        { semanticRole: "body", groupId: "soWhat", value: "したがって、価格交渉と並行してPMI体制の即時設計に着手すべきである" },
      ],
      relationships: [],
      title: "財務影響とPMI体制の2論点から導く結論について報告する",
      subtitle: "検討全体から導く2つの結論",
    },
    {
      // C: 4 takeaways, long Japanese text — stress test.
      elements: [
        ...twGroupElements("tw0", "01", "市場浸透", "アジア新興国市場における高付加価値セグメントの獲得が全社成長を牽引している", "東南アジア主要3か国での上位顧客需要が想定を上回って堅調に推移している", { icon: "bar-chart" }),
        ...twGroupElements("tw1", "02", "収益性", "粗利改善の余地は調達統合とサプライヤー再編への集中投資に集約される", "共同購買プラットフォームの早期導入による即効性が財務モデルで確認された", { icon: "coins" }),
        ...twGroupElements("tw2", "03", "実行体制", "早期のPMI着手が100日プランの成果創出確度を大きく左右する", "Day60時点での組織・KPI・ガバナンスに関する意思決定が最重要変数となる", { icon: "gear" }),
        ...twGroupElements("tw3", "04", "リスク管理", "主要リスクは人材流出と統合コスト超過であり両面での対応策が既に整備済み", "リテンションボーナスと段階的統合範囲設定により定量的な緩和効果が見込まれる", { icon: "bar-chart" }),
        { semanticRole: "title", groupId: "insightPanel", value: "示唆" },
        ...insightItemElements("insightPanel-i1", "1", "成長領域への集中", "高付加価値セグメントに経営資源を優先配分し、投資対効果を最大化する"),
        ...insightItemElements("insightPanel-i2", "2", "調達統合の迅速な着手", "共同購買によるコスト削減効果を早期に実現し、粗利改善を加速する"),
        ...insightItemElements("insightPanel-i3", "3", "100日計画の厳格な遂行", "Day60の意思決定を起点に、統合効果の刈り取りサイクルを加速させる"),
        ...insightItemElements("insightPanel-i4", "4", "リスク対応策の前倒し実行", "人材流出・統合コスト双方について、着手時期を可能な限り前倒しする"),
        { semanticRole: "title", groupId: "soWhat", value: "So What" },
        { semanticRole: "body", groupId: "soWhat", value: "したがって、買収後100日間は市場機会の追求と同時にリスク対応策の早期実行が価値創出全体を左右する" },
      ],
      relationships: [],
      title: "市場・収益性・実行体制・リスク管理の4論点から導く結論について報告する",
      subtitle: "検討全体から導く4つの結論",
    },
  ];

  for (const [i, fixture] of fixtures.entries()) {
    const selection = await selectPattern({ family: "key-takeaways", variant: "standard" }, fixture);
    assert.equal(selection.eligibility, "PASS", `fixture ${i}: ${JSON.stringify(selection.rejectedCandidates)}`);
    const slide = preFamilyIrToSlideSpec(selection, fixture, { title: fixture.title, subtitle: fixture.subtitle, source: "Source: test" });

    const specPath = path.join(tmpDir, `kt-e2e-${i}-spec.json`);
    const htmlPath = path.join(tmpDir, `kt-e2e-${i}.html`);
    await fs.writeFile(specPath, JSON.stringify({ deckTitle: "t", slides: [slide] }));
    await execFileAsync("node", [path.join(root, "scripts/render_spec_to_html.mjs"), specPath, htmlPath]);

    const gateResult = await execFileAsync("node", [path.join(root, "scripts/run_mechanical_gate.mjs"), specPath, htmlPath]);
    const gateReport = JSON.parse(gateResult.stdout);
    assert.equal(gateReport.passed, true, `fixture ${i} mechanical gate: ${JSON.stringify(gateReport.errors)}`);

    const pptxPath = path.join(tmpDir, `kt-e2e-${i}.pptx`);
    await execFileAsync("node", [path.join(root, "scripts/export_spec_to_editable_pptx.mjs"), specPath, pptxPath]);
    const auditResult = await auditPptxStructure(await fs.readFile(pptxPath));
    assert.deepEqual(auditResult, { passed: true, errors: [] }, `fixture ${i} PPTX audit`);
  }
});

// --- RP-MATRIX-BADGELIST-01 (Library v0.2, fifth pattern) ---

function mqQuadrantElements(position, number, label, summary, items, opts = {}) {
  const els = [
    { semanticRole: "number", groupId: position, value: number },
    { semanticRole: "title", groupId: position, value: label, ...(opts.emphasis ? { emphasis: true } : {}) },
  ];
  if (summary) els.push({ semanticRole: "body", groupId: position, value: summary });
  items.forEach((it, i) => {
    const gid = `${position}-item-${i + 1}`;
    els.push({ semanticRole: "title", groupId: gid, value: it.title, ...(it.emphasis ? { emphasis: true } : {}) });
    if (it.icon) els.push({ semanticRole: "icon", groupId: gid, value: it.icon });
  });
  return els;
}
function mqAxisElements(groupId, title, low, high) {
  return [
    { semanticRole: "title", groupId, value: title },
    { semanticRole: "label", groupId, value: low },
    { semanticRole: "label", groupId, value: high },
  ];
}
function mqInsightElements(title, items) {
  const els = [];
  if (title) els.push({ semanticRole: "title", groupId: "insights", value: title });
  items.forEach((t) => els.push({ semanticRole: "bullets", groupId: "insights", value: t }));
  return els;
}
function mqFullIr(overrides = {}) {
  return {
    elements: [
      ...mqQuadrantElements("top-left", "II", "早期対応", "影響度は限定的だが早期の対応が必要", [{ title: "営業KPI不統一", icon: "bar-chart" }, { title: "人事制度差異", icon: "people" }]),
      ...mqQuadrantElements("top-right", "I", "最優先", "緊急度・影響度ともに高く早急な意思決定が必要", [{ title: "経営陣退任", icon: "person" }, { title: "主要顧客離反", icon: "people" }, { title: "IT移行遅延", icon: "laptop" }], { emphasis: true }),
      ...mqQuadrantElements("bottom-left", "IV", "継続監視", "緊急度・影響度ともに低く中長期でのモニタリング", [{ title: "ブランド統合", icon: "tag" }]),
      ...mqQuadrantElements("bottom-right", "III", "計画対応", "影響度は高いが計画的な対応が可能", [{ title: "共同購買", icon: "cart" }, { title: "物流統合", icon: "truck" }]),
      ...mqAxisElements("axisX", "事業影響度", "低", "高"),
      ...mqAxisElements("axisY", "対応緊急度", "低", "高"),
      ...mqInsightElements("示唆", ["最優先論点はDay60までに意思決定", "低優先論点は担当PJで継続管理"]),
    ],
    relationships: [],
    ...overrides,
  };
}

test("reference_pattern_selector: a fully-authored 4-quadrant badge-list IR (all 4 positions, both axes, insights) selects RP-MATRIX-BADGELIST-01", async () => {
  const result = await selectPattern({ family: "matrix", variant: "badge-list" }, mqFullIr());
  assert.equal(result.eligibility, "PASS");
  assert.equal(result.selectedPattern, "RP-MATRIX-BADGELIST-01");
});

test("reference_pattern_selector: a badge-list IR missing one of the 4 canonical quadrant positions is rejected", async () => {
  const ir = mqFullIr();
  ir.elements = ir.elements.filter((e) => e.groupId !== "bottom-right" && !String(e.groupId).startsWith("bottom-right-item-"));
  const result = await selectPattern({ family: "matrix", variant: "badge-list" }, ir);
  assert.equal(result.eligibility, "FAIL");
});

test("reference_pattern_selector: a badge-list IR with all 4 quadrants and both axes but no insights bullets is rejected (insights panel is mandatory, not optional)", async () => {
  const ir = mqFullIr();
  ir.elements = ir.elements.filter((e) => e.groupId !== "insights");
  const result = await selectPattern({ family: "matrix", variant: "badge-list" }, ir);
  assert.equal(result.eligibility, "FAIL");
});

test("pre_family_ir_to_slide_spec: matrix_2x2 badge-list adapter builds all 4 quadrants in canonical position order, axis low/high labels, and the insights panel", () => {
  const result = preFamilyIrToMatrixBadgeList(mqFullIr());
  assert.deepEqual(result.quadrants.map((q) => q.position), ["top-left", "top-right", "bottom-left", "bottom-right"]);
  const topRight = result.quadrants.find((q) => q.position === "top-right");
  assert.deepEqual(topRight, {
    position: "top-right", number: "I", label: "最優先", summary: "緊急度・影響度ともに高く早急な意思決定が必要", emphasis: true,
    items: [
      { title: "経営陣退任", icon: "person" },
      { title: "主要顧客離反", icon: "people" },
      { title: "IT移行遅延", icon: "laptop" },
    ],
  });
  const topLeft = result.quadrants.find((q) => q.position === "top-left");
  assert.equal(topLeft.emphasis, undefined, "a quadrant with no emphasized element must not carry emphasis:true");
  assert.deepEqual(result.matrix, { xAxis: "事業影響度", yAxis: "対応緊急度", xAxisLow: "低", xAxisHigh: "高", yAxisLow: "低", yAxisHigh: "高" });
  assert.deepEqual(result.insights, { items: ["最優先論点はDay60までに意思決定", "低優先論点は担当PJで継続管理"], title: "示唆" });
});

test("pre_family_ir_to_slide_spec: matrix_2x2 badge-list adapter rejects an icon outside the person/people/bar-chart/laptop/tag/cart/truck vocabulary", () => {
  const ir = mqFullIr();
  const iconEl = ir.elements.find((e) => e.groupId === "bottom-left-item-1" && e.semanticRole === "icon");
  iconEl.value = "gear";
  assert.throws(() => preFamilyIrToMatrixBadgeList(ir), /person\/people\/bar-chart\/laptop\/tag\/cart\/truck/);
});

test("matrix_badgelist end to end: 3 fixtures (reference-faithful canonical, sparse 1-item-per-quadrant adaptive, 3-items-per-quadrant long-Japanese-text stress test) render with 0 QA findings and export to a clean PPTX", async () => {
  const fixtures = [
    {
      // A: the reference image's own composition (4 quadrants, 1 emphasized, 2 insights).
      ir: mqFullIr(),
      title: "統合課題を緊急度と事業影響度で整理する",
      subtitle: "Priority Matrix",
    },
    {
      // B: sparse — 1 item per quadrant, no summaries, no emphasis, 1 insight.
      ir: {
        elements: [
          ...mqQuadrantElements("top-left", "II", "拡大機会", null, [{ title: "海外チャネル開拓" }]),
          ...mqQuadrantElements("top-right", "I", "最優先", null, [{ title: "基幹システム統合" }]),
          ...mqQuadrantElements("bottom-left", "IV", "モニタリング", null, [{ title: "サプライヤー評価" }]),
          ...mqQuadrantElements("bottom-right", "III", "計画実行", null, [{ title: "在庫最適化" }]),
          ...mqAxisElements("axisX", "実現容易性", "低", "高"),
          ...mqAxisElements("axisY", "期待効果", "低", "高"),
          ...mqInsightElements(null, ["優先順位は四半期ごとに見直す"]),
        ],
        relationships: [],
      },
      title: "施策候補を効果と実現容易性で整理する",
    },
    {
      // C: stress test — 2-3 long-Japanese-text items per quadrant, long summaries/axis names,
      // 3 insights.
      ir: {
        elements: [
          ...mqQuadrantElements("top-left", "II", "早期対応が必要な課題", "事業への影響度は限定的だが対応の緊急性が高く早めの着手が望ましい領域", [
            { title: "営業部門のKPI定義が拠点ごとに不統一で連結管理が困難", icon: "bar-chart" },
            { title: "人事評価制度の差異により統合後のモチベーション低下リスクがある", icon: "people" },
            { title: "経費精算プロセスの二重運用によるバックオフィス負荷増大", icon: "person" },
          ]),
          ...mqQuadrantElements("top-right", "I", "最優先で意思決定すべき論点", "緊急度・事業影響度ともに高く経営レベルでの早急な意思決定が必要な領域", [
            { title: "経営陣の退任スケジュールと後任選定プロセスの遅延", icon: "person" },
            { title: "主要顧客の契約更新時期における離反リスクの顕在化", icon: "people" },
            { title: "基幹ITシステムの移行スケジュール遅延による業務停止リスク", icon: "laptop" },
          ], { emphasis: true }),
          ...mqQuadrantElements("bottom-left", "IV", "継続的にモニタリングする事項", "緊急度・事業影響度ともに低く中長期的な定点観測で足りる領域", [
            { title: "統合後のブランド名称・ロゴ統一に関する社内外調整", icon: "tag" },
            { title: "オフィスレイアウト統合に関する従業員意見の集約", icon: "person" },
          ]),
          ...mqQuadrantElements("bottom-right", "III", "計画的に対応する事項", "事業への影響度は高いが緊急性は低く計画的なロードマップ策定で対応可能な領域", [
            { title: "共同購買プラットフォーム導入によるコスト削減の実行", icon: "cart" },
            { title: "物流拠点統合による配送リードタイム短縮の実現", icon: "truck" },
            { title: "在庫管理システムの統合による欠品率低減の実現", icon: "bar-chart" },
          ]),
          ...mqAxisElements("axisX", "事業影響度（統合後の年間損益インパクト）", "低", "高"),
          ...mqAxisElements("axisY", "対応緊急度（意思決定までに許容される期間）", "低", "高"),
          ...mqInsightElements("示唆", [
            "最優先論点は経営会議にてDay60までに意思決定を完了させる必要がある",
            "低優先論点は各担当PJ側で四半期ごとに進捗をモニタリングし継続管理する",
            "早期対応課題は人事・IT部門合同のワーキンググループで並行して検討を進める",
          ]),
        ],
        relationships: [],
      },
      title: "統合課題を緊急度と事業影響度で整理する（詳細版）",
      subtitle: "Priority Matrix — Detailed",
    },
  ];

  for (const [i, fixture] of fixtures.entries()) {
    const selection = await selectPattern({ family: "matrix", variant: "badge-list" }, fixture.ir);
    assert.equal(selection.eligibility, "PASS", `fixture ${i}: ${JSON.stringify(selection.rejectedCandidates)}`);
    const slide = preFamilyIrToSlideSpec(selection, fixture.ir, { title: fixture.title, subtitle: fixture.subtitle, source: "Source: test" });

    const specPath = path.join(tmpDir, `mqb-e2e-${i}-spec.json`);
    const htmlPath = path.join(tmpDir, `mqb-e2e-${i}.html`);
    await fs.writeFile(specPath, JSON.stringify({ deckTitle: "t", slides: [slide] }));
    await execFileAsync("node", [path.join(root, "scripts/render_spec_to_html.mjs"), specPath, htmlPath]);

    const gateResult = await execFileAsync("node", [path.join(root, "scripts/run_mechanical_gate.mjs"), specPath, htmlPath]);
    const gateReport = JSON.parse(gateResult.stdout);
    assert.equal(gateReport.passed, true, `fixture ${i} mechanical gate: ${JSON.stringify(gateReport.errors)}`);

    const pptxPath = path.join(tmpDir, `mqb-e2e-${i}.pptx`);
    await execFileAsync("node", [path.join(root, "scripts/export_spec_to_editable_pptx.mjs"), specPath, pptxPath]);
    const auditResult = await auditPptxStructure(await fs.readFile(pptxPath));
    assert.deepEqual(auditResult, { passed: true, errors: [] }, `fixture ${i} PPTX audit`);
  }
});

// --- RP-100DAY-WORKSTREAM-01 (Library v0.2, sixth pattern, first under the mandatory Visual
// Contract process — see pipeline/reference-patterns/visual-contracts/RP-100DAY-WORKSTREAM-01.md) ---

function w100WorkstreamElements(id, title, subtitle, icon) {
  const gid = `workstream-${id}`;
  const els = [
    { semanticRole: "title", groupId: gid, value: title },
    { semanticRole: "icon", groupId: gid, value: icon },
  ];
  if (subtitle) els.push({ semanticRole: "subtitle", groupId: gid, value: subtitle });
  return els;
}
function w100PhaseElements(id, title, subtitle, order) {
  const gid = `phase-${id}`;
  const els = [
    { semanticRole: "title", groupId: gid, value: title },
    { semanticRole: "order", groupId: gid, value: String(order) },
  ];
  if (subtitle) els.push({ semanticRole: "subtitle", groupId: gid, value: subtitle });
  return els;
}
function w100ActivityElements(workstreamId, phaseId, title, bullets, icon) {
  const gid = `activity-${workstreamId}-${phaseId}`;
  const els = [
    { semanticRole: "title", groupId: gid, value: title },
    { semanticRole: "icon", groupId: gid, value: icon },
    { semanticRole: "workstreamRef", groupId: gid, value: `workstream-${workstreamId}` },
    { semanticRole: "phaseRef", groupId: gid, value: `phase-${phaseId}` },
  ];
  bullets.forEach((b) => els.push({ semanticRole: "bullets", groupId: gid, value: b }));
  return els;
}
function w100MilestoneElements(id, phaseId, position, label, title, body) {
  const gid = `milestone-${id}`;
  const els = [
    { semanticRole: "label", groupId: gid, value: label },
    { semanticRole: "title", groupId: gid, value: title },
    { semanticRole: "position", groupId: gid, value: String(position) },
    { semanticRole: "phaseRef", groupId: gid, value: `phase-${phaseId}` },
  ];
  if (body) els.push({ semanticRole: "body", groupId: gid, value: body });
  return els;
}
function w100FullIr(overrides = {}) {
  return {
    elements: [
      ...w100WorkstreamElements("sales", "営業", "収益成長の加速", "people"),
      ...w100WorkstreamElements("procurement", "調達", "コスト競争力の強化", "coins"),
      ...w100WorkstreamElements("hr", "人事", "組織・人の最適化", "person"),
      ...w100WorkstreamElements("mgmt", "経営管理", "統合効果の可視化", "bar-chart"),
      ...w100PhaseElements("1", "Day0-30", "基盤整備・計画策定", 1),
      ...w100PhaseElements("2", "Day31-60", "実行準備・意思決定", 2),
      ...w100PhaseElements("3", "Day61-100", "本格実行・成果創出", 3),
      ...w100ActivityElements("sales", "1", "重点顧客150社の引継ぎ設計", ["顧客リストの精査・優先順位付け", "引継ぎ計画と担当体制の設計"], "target"),
      ...w100ActivityElements("sales", "2", "営業KPI指標を設計", ["売上・粗利・新規・継続・顧客満足の5指標を定義", "モニタリングの仕組みを構築"], "bar-chart"),
      ...w100ActivityElements("sales", "3", "新体制でモニタリング開始", ["新体制での営業活動を開始", "KPIの月次モニタリングと改善アクションの実行"], "trending-up"),
      ...w100ActivityElements("procurement", "1", "共通購買候補の洗い出し", ["両社の購買データを分析", "共通化可能な品目・サプライヤーをリスト化"], "search"),
      ...w100ActivityElements("procurement", "2", "対象30品目を選定", ["インパクト・実現性で優先順位付け", "対象30品目を確定"], "document"),
      ...w100ActivityElements("procurement", "3", "価格交渉を開始", ["サプライヤーとの価格交渉を開始", "早期のコスト削減効果の創出"], "handshake"),
      ...w100ActivityElements("hr", "1", "人員配置案を整理", ["現状の組織・人員を可視化", "重複・ギャップを分析し、配置案を作成"], "org-chart"),
      ...w100ActivityElements("hr", "2", "新組織案を確定", ["経営陣での協議・合意形成", "新組織の役割・体制を確定"], "org-chart"),
      ...w100ActivityElements("hr", "3", "制度統合の方針を通知", ["人事制度統合の方針を策定・通知", "従業員への説明とエンゲージメント強化"], "document"),
      ...w100ActivityElements("mgmt", "1", "PMI会議体を設計", ["ガバナンス体制・会議体を設計", "レポーティングラインと運営ルールを策定"], "gear"),
      ...w100ActivityElements("mgmt", "2", "Day60意思決定を実施", ["統合シナジーの詳細計画を承認", "主要施策の投資判断を実施"], "document"),
      ...w100ActivityElements("mgmt", "3", "進捗/KPIレビューを定着", ["月次での進捗レビューを実施", "課題の早期是正とPDCAの定着"], "bar-chart"),
      ...w100MilestoneElements("1", "1", 1, "Day30", "重点顧客対応方針", "引継ぎ方針を確定し、実行を開始"),
      ...w100MilestoneElements("2", "2", 2, "Day60", "新組織決定", "新組織案を確定し、主要施策を承認"),
      ...w100MilestoneElements("3", "3", 3, "Day100", "KPI運用開始", "KPIモニタリングを本格運用し、成果創出フェーズへ"),
    ],
    relationships: [],
    ...overrides,
  };
}

test("reference_pattern_selector: a fully-authored 4-workstream x 3-phase IR (100% activity coverage, 3 milestones) selects RP-100DAY-WORKSTREAM-01", async () => {
  const result = await selectPattern({ family: "100day-workstream", variant: "standard" }, w100FullIr());
  assert.equal(result.eligibility, "PASS");
  assert.equal(result.selectedPattern, "RP-100DAY-WORKSTREAM-01");
});

test("reference_pattern_selector: an activity grid missing one workstream x phase combination (incomplete coverage) is rejected", async () => {
  const ir = w100FullIr();
  ir.elements = ir.elements.filter((e) => e.groupId !== "activity-mgmt-3");
  const result = await selectPattern({ family: "100day-workstream", variant: "standard" }, ir);
  assert.equal(result.eligibility, "FAIL");
});

test("reference_pattern_selector: a valid 4x3 grid with only 2 milestones (instead of exactly 3) is rejected — milestones are fixed at 3 for v1, not >=1", async () => {
  const ir = w100FullIr();
  ir.elements = ir.elements.filter((e) => e.groupId !== "milestone-3");
  const result = await selectPattern({ family: "100day-workstream", variant: "standard" }, ir);
  assert.equal(result.eligibility, "FAIL");
});

test("reference_pattern_selector: 6 workstreams (above the 3-5 v1 supported range) is rejected", async () => {
  const ir = w100FullIr(); // already has 4 (sales/procurement/hr/mgmt) — add 2 more to reach 6
  for (const id of ["it", "legal"]) {
    ir.elements.push(...w100WorkstreamElements(id, id, undefined, "person"));
    for (const p of ["1", "2", "3"]) ir.elements.push(...w100ActivityElements(id, p, `${id} activity`, ["a", "b"], "gear"));
  }
  const result = await selectPattern({ family: "100day-workstream", variant: "standard" }, ir);
  assert.equal(result.eligibility, "FAIL");
});

test("pre_family_ir_to_slide_spec: workstream_100day adapter builds workstreams/phases (order-sorted)/activities/milestones with icon vocabularies enforced", () => {
  const result = preFamilyIrToWorkstream100Day(w100FullIr());
  assert.equal(result.workstreams.length, 4);
  assert.deepEqual(result.phases.map((p) => p.id), ["phase-1", "phase-2", "phase-3"]);
  const salesPhase1 = result.activities.find((a) => a.workstreamId === "workstream-sales" && a.phaseId === "phase-1");
  assert.deepEqual(salesPhase1, {
    workstreamId: "workstream-sales", phaseId: "phase-1", title: "重点顧客150社の引継ぎ設計",
    bullets: ["顧客リストの精査・優先順位付け", "引継ぎ計画と担当体制の設計"], icon: "target",
  });
  assert.equal(result.activities.length, 12);
  assert.deepEqual(result.milestones.map((m) => m.position), [1, 2, 3]);
});

test("pre_family_ir_to_slide_spec: workstream_100day adapter rejects a workstream icon outside people/coins/person/bar-chart", () => {
  const ir = w100FullIr();
  const iconEl = ir.elements.find((e) => e.groupId === "workstream-sales" && e.semanticRole === "icon");
  iconEl.value = "gear";
  assert.throws(() => preFamilyIrToWorkstream100Day(ir), /people\/coins\/person\/bar-chart/);
});

test("pre_family_ir_to_slide_spec: workstream_100day adapter rejects an activity icon outside its own closed vocabulary", () => {
  const ir = w100FullIr();
  const iconEl = ir.elements.find((e) => e.groupId === "activity-sales-1" && e.semanticRole === "icon");
  iconEl.value = "coins";
  assert.throws(() => preFamilyIrToWorkstream100Day(ir), /target\/search\/org-chart\/gear\/trending-up\/handshake\/document\/bar-chart/);
});

test("workstream_100day end to end: 3 fixtures (reference-faithful 4-workstream canonical, 3-workstream adaptive minimum, 5-workstream adaptive maximum with longer text) render with 0 QA findings and export to a clean PPTX", async () => {
  const fixtures = [
    { ir: w100FullIr(), title: "100日プランは4つのワークストリームで推進する", subtitle: "統合後のシナジーを早期に実現するため、4つのワークストリームで計画から実行・定着までを一気通貫で推進する" },
    {
      ir: {
        elements: [
          ...w100WorkstreamElements("sales", "営業", "収益成長の加速", "people"),
          ...w100WorkstreamElements("hr", "人事", "組織・人の最適化", "person"),
          ...w100WorkstreamElements("mgmt", "経営管理", "統合効果の可視化", "bar-chart"),
          ...w100PhaseElements("1", "Day0-30", "基盤整備・計画策定", 1),
          ...w100PhaseElements("2", "Day31-60", "実行準備・意思決定", 2),
          ...w100PhaseElements("3", "Day61-100", "本格実行・成果創出", 3),
          ...w100ActivityElements("sales", "1", "重点顧客の引継ぎ設計", ["顧客リストの精査・優先順位付け", "引継ぎ計画の設計"], "target"),
          ...w100ActivityElements("sales", "2", "営業KPIを設計", ["主要指標を定義", "モニタリング体制を構築"], "bar-chart"),
          ...w100ActivityElements("sales", "3", "新体制で運用開始", ["新体制での活動を開始", "月次モニタリングを実行"], "trending-up"),
          ...w100ActivityElements("hr", "1", "人員配置案を整理", ["現状を可視化", "配置案を作成"], "org-chart"),
          ...w100ActivityElements("hr", "2", "新組織案を確定", ["協議・合意形成", "役割・体制を確定"], "org-chart"),
          ...w100ActivityElements("hr", "3", "制度統合の方針を通知", ["方針を策定・通知", "説明会を実施"], "document"),
          ...w100ActivityElements("mgmt", "1", "PMI会議体を設計", ["体制を設計", "運営ルールを策定"], "gear"),
          ...w100ActivityElements("mgmt", "2", "Day60意思決定を実施", ["詳細計画を承認", "投資判断を実施"], "document"),
          ...w100ActivityElements("mgmt", "3", "進捗レビューを定着", ["月次レビューを実施", "PDCAを定着"], "bar-chart"),
          ...w100MilestoneElements("1", "1", 1, "Day30", "重点顧客対応方針", "引継ぎ方針を確定"),
          ...w100MilestoneElements("2", "2", 2, "Day60", "新組織決定", "新組織案を確定"),
          ...w100MilestoneElements("3", "3", 3, "Day100", "KPI運用開始", "本格運用へ移行"),
        ],
        relationships: [],
      },
      title: "100日プランは3つのワークストリームで推進する",
    },
    {
      // 5 workstreams (the v1 max) with longer Japanese titles/bullets — stress test.
      ir: {
        elements: [
          ...w100WorkstreamElements("sales", "営業", "収益成長の加速", "people"),
          ...w100WorkstreamElements("procurement", "調達", "コスト競争力の強化", "coins"),
          ...w100WorkstreamElements("hr", "人事", "組織・人の最適化", "person"),
          ...w100WorkstreamElements("mgmt", "経営管理", "統合効果の可視化", "bar-chart"),
          ...w100WorkstreamElements("it", "IT", "システム統合の推進", "person"),
          ...w100PhaseElements("1", "Day0-30", "基盤整備・計画策定", 1),
          ...w100PhaseElements("2", "Day31-60", "実行準備・意思決定", 2),
          ...w100PhaseElements("3", "Day61-100", "本格実行・成果創出", 3),
          ...w100ActivityElements("sales", "1", "重点顧客150社の引継ぎ設計を完了する", ["顧客リストの精査・優先順位付けを実施", "引継ぎ計画と担当体制の設計を完了"], "target"),
          ...w100ActivityElements("sales", "2", "営業KPI指標を設計し合意形成する", ["売上・粗利・新規・継続・満足度の5指標を定義", "モニタリングの仕組みを構築"], "bar-chart"),
          ...w100ActivityElements("sales", "3", "新体制でモニタリングを開始する", ["新体制での営業活動を開始", "KPIの月次モニタリングと改善アクションを実行"], "trending-up"),
          ...w100ActivityElements("procurement", "1", "共通購買候補の洗い出しを実施する", ["両社の購買データを分析", "共通化可能な品目・サプライヤーをリスト化"], "search"),
          ...w100ActivityElements("procurement", "2", "対象品目30点を選定し合意する", ["インパクト・実現性で優先順位付け", "対象品目を確定"], "document"),
          ...w100ActivityElements("procurement", "3", "価格交渉を開始し早期効果を刈り取る", ["サプライヤーとの価格交渉を開始", "早期のコスト削減効果を創出"], "handshake"),
          ...w100ActivityElements("hr", "1", "人員配置案を整理し可視化する", ["現状の組織・人員を可視化", "重複・ギャップを分析し配置案を作成"], "org-chart"),
          ...w100ActivityElements("hr", "2", "新組織案を確定し合意形成する", ["経営陣での協議・合意形成", "新組織の役割・体制を確定"], "org-chart"),
          ...w100ActivityElements("hr", "3", "制度統合の方針を通知し浸透させる", ["人事制度統合の方針を策定・通知", "従業員への説明とエンゲージメント強化"], "document"),
          ...w100ActivityElements("mgmt", "1", "PMI会議体を設計し運用開始する", ["ガバナンス体制・会議体を設計", "レポーティングラインと運営ルールを策定"], "gear"),
          ...w100ActivityElements("mgmt", "2", "Day60意思決定を実施し前進する", ["統合シナジーの詳細計画を承認", "主要施策の投資判断を実施"], "document"),
          ...w100ActivityElements("mgmt", "3", "進捗/KPIレビューを定着させる", ["月次での進捗レビューを実施", "課題の早期是正とPDCAの定着"], "bar-chart"),
          ...w100ActivityElements("it", "1", "システム統合方針を策定し合意する", ["現行システムの棚卸しを実施", "統合方式の選定基準を策定"], "gear"),
          ...w100ActivityElements("it", "2", "移行計画を確定し体制を整える", ["データ移行計画を策定", "移行体制・スケジュールを確定"], "document"),
          ...w100ActivityElements("it", "3", "本番移行を完了し安定運用に入る", ["本番移行を実施", "安定運用に向けた監視体制を構築"], "trending-up"),
          ...w100MilestoneElements("1", "1", 1, "Day30", "重点顧客対応方針の確定", "引継ぎ方針を確定し、実行を開始する"),
          ...w100MilestoneElements("2", "2", 2, "Day60", "新組織・システム方針の決定", "新組織案と統合方式を確定し、主要施策を承認する"),
          ...w100MilestoneElements("3", "3", 3, "Day100", "KPI運用と本番移行の完了", "KPIモニタリングと本番移行を完了し、成果創出フェーズへ移行する"),
        ],
        relationships: [],
      },
      title: "100日プランは5つのワークストリームで推進する（詳細版）",
      subtitle: "統合後のシナジーを早期に実現するため、5つのワークストリームで計画から実行・定着までを一気通貫で推進する",
    },
  ];

  for (const [i, fixture] of fixtures.entries()) {
    const selection = await selectPattern({ family: "100day-workstream", variant: "standard" }, fixture.ir);
    assert.equal(selection.eligibility, "PASS", `fixture ${i}: ${JSON.stringify(selection.rejectedCandidates)}`);
    const slide = preFamilyIrToSlideSpec(selection, fixture.ir, { title: fixture.title, subtitle: fixture.subtitle, source: "Source: test" });

    const specPath = path.join(tmpDir, `w100-e2e-${i}-spec.json`);
    const htmlPath = path.join(tmpDir, `w100-e2e-${i}.html`);
    await fs.writeFile(specPath, JSON.stringify({ deckTitle: "t", slides: [slide] }));
    await execFileAsync("node", [path.join(root, "scripts/render_spec_to_html.mjs"), specPath, htmlPath]);

    const gateResult = await execFileAsync("node", [path.join(root, "scripts/run_mechanical_gate.mjs"), specPath, htmlPath]);
    const gateReport = JSON.parse(gateResult.stdout);
    assert.equal(gateReport.passed, true, `fixture ${i} mechanical gate: ${JSON.stringify(gateReport.errors)}`);

    const pptxPath = path.join(tmpDir, `w100-e2e-${i}.pptx`);
    await execFileAsync("node", [path.join(root, "scripts/export_spec_to_editable_pptx.mjs"), specPath, pptxPath]);
    const auditResult = await auditPptxStructure(await fs.readFile(pptxPath));
    assert.deepEqual(auditResult, { passed: true, errors: [] }, `fixture ${i} PPTX audit`);
  }
});

// --- RP-OPERATING-MODEL-01 (Library v0.2, seventh pattern, second under the mandatory Visual
// Contract process — see pipeline/reference-patterns/visual-contracts/RP-OPERATING-MODEL-01.md) ---

function omStageElements(id, number, title, question, cards) {
  const gid = `stage-${id}`;
  const els = [
    { semanticRole: "number", groupId: gid, value: number },
    { semanticRole: "title", groupId: gid, value: title },
    { semanticRole: "question", groupId: gid, value: question },
  ];
  cards.forEach((c, i) => {
    const cardGid = `${gid}-card-${i + 1}`;
    els.push({ semanticRole: "title", groupId: cardGid, value: c.title });
    els.push({ semanticRole: "body", groupId: cardGid, value: c.body });
    els.push({ semanticRole: "icon", groupId: cardGid, value: c.icon });
  });
  return els;
}
function omKeyMessageElements(label, headline, checklist) {
  const els = [];
  if (label) els.push({ semanticRole: "label", groupId: "keyMessage", value: label });
  els.push({ semanticRole: "headline", groupId: "keyMessage", value: headline });
  checklist.forEach((c) => els.push({ semanticRole: "bullets", groupId: "keyMessage", value: c }));
  return els;
}
function omFullIr(overrides = {}) {
  return {
    elements: [
      ...omStageElements("segment", "01", "顧客セグメント", "誰に価値を届けるか", [
        { title: "大口顧客", body: "戦略的パートナーとして深耕", icon: "building" },
        { title: "地域顧客", body: "地域特性に合わせたきめ細かな対応", icon: "pin" },
        { title: "新規開拓", body: "新たな市場・業界への積極的なアプローチ", icon: "people" },
      ]),
      ...omStageElements("value", "02", "提供価値", "どのような価値を提供するか", [
        { title: "専門提案", body: "業界知見に基づく課題解決型の提案", icon: "diamond" },
        { title: "迅速供給", body: "最適なサプライチェーンで安定・迅速に供給", icon: "truck" },
        { title: "コスト最適化", body: "スケールメリットを活かした競争力のある価格・コスト", icon: "bar-chart" },
      ]),
      ...omStageElements("capability", "03", "実行ケイパビリティ", "どのように実行するか", [
        { title: "重点顧客担当制", body: "大口顧客に専任チームを配置", icon: "person" },
        { title: "共同購買", body: "統合による調達力の最大化", icon: "org-chart" },
        { title: "拠点再編", body: "最適な拠点配置で営業・物流を効率化", icon: "gear" },
        { title: "標準KPI", body: "共通の指標で実行を管理", icon: "bar-chart" },
      ]),
      ...omStageElements("governance", "04", "ガバナンス", "どのように統制・推進するか", [
        { title: "営業本部長", body: "全体戦略の策定・意思決定", icon: "person" },
        { title: "PMI会議", body: "部門横断での進捗管理・課題解決", icon: "people" },
        { title: "月次レビュー", body: "KPIの達成状況をモニタリングし、継続的に改善", icon: "document" },
      ]),
      ...omKeyMessageElements("KEY MESSAGE", "顧客起点で拠点・調達・KPIを一体運営", [
        "顧客ニーズに基づく一気通貫の運営体制",
        "統合シナジーを実行力に変える仕組み",
        "持続的な成長を支えるガバナンス",
      ]),
    ],
    relationships: [],
    ...overrides,
  };
}

test("reference_pattern_selector: a fully-authored 4-stage cascade (asymmetric 3/3/4/3 card counts, keyMessage with 3 checklist items) selects RP-OPERATING-MODEL-01", async () => {
  const result = await selectPattern({ family: "operating-model", variant: "standard" }, omFullIr());
  assert.equal(result.eligibility, "PASS");
  assert.equal(result.selectedPattern, "RP-OPERATING-MODEL-01");
});

// Regression test for a real bug this pattern's implementation hit: a card group's own
// groupId shares the "stage-" prefix with its parent stage group (cards are named
// `${stageGroupId}-card-N`), so a naive `groupId.startsWith("stage-")` check double-counts
// every card as an additional stage. This fixture's card count (13 cards total across 4
// stages) would inflate a naive stage count to 17 if the "-card-" exclusion regressed.
test("reference_pattern_selector: cascade stage groups are never miscounted as capability card groups (or vice versa) — a card's groupId sharing the 'stage-' prefix with its parent must not inflate the stage count", async () => {
  const ir = omFullIr();
  const stageGroupIds = new Set(ir.elements.filter((e) => e.groupId?.startsWith("stage-") && !e.groupId.includes("-card-")).map((e) => e.groupId));
  const cardGroupIds = new Set(ir.elements.filter((e) => e.groupId?.includes("-card-")).map((e) => e.groupId));
  assert.equal(stageGroupIds.size, 4, "sanity check: 4 stage groups authored");
  assert.equal(cardGroupIds.size, 13, "sanity check: 13 card groups authored (3+3+4+3)");
  const result = await selectPattern({ family: "operating-model", variant: "standard" }, ir);
  assert.equal(result.eligibility, "PASS");
  const adapted = preFamilyIrToOperatingModelCascade(ir);
  assert.equal(adapted.cascadeStages.length, 4, "adapter must see exactly 4 stages, not 17 (4 stages + 13 cards)");
});

test("reference_pattern_selector: 6 stages (above the 3-5 v1 supported range) is rejected", async () => {
  const ir = omFullIr();
  ir.elements.push(...omStageElements("extra1", "05", "追加層1", "追加の問い", [{ title: "a", body: "b", icon: "gear" }, { title: "c", body: "d", icon: "document" }]));
  ir.elements.push(...omStageElements("extra2", "06", "追加層2", "追加の問い", [{ title: "a", body: "b", icon: "gear" }, { title: "c", body: "d", icon: "document" }]));
  const result = await selectPattern({ family: "operating-model", variant: "standard" }, ir);
  assert.equal(result.eligibility, "FAIL");
});

test("reference_pattern_selector: a stage with only 1 card (below the 2-4 per-stage range) is rejected", async () => {
  const ir = omFullIr();
  ir.elements = ir.elements.filter((e) => !(e.groupId === "stage-segment-card-2" || e.groupId === "stage-segment-card-3"));
  const result = await selectPattern({ family: "operating-model", variant: "standard" }, ir);
  assert.equal(result.eligibility, "FAIL");
});

test("pre_family_ir_to_slide_spec: operating_model_cascade adapter builds cascadeStages (with independent per-stage card counts) and keyMessageBand", () => {
  const result = preFamilyIrToOperatingModelCascade(omFullIr());
  assert.deepEqual(result.cascadeStages.map((s) => s.cards.length), [3, 3, 4, 3]);
  const segment = result.cascadeStages[0];
  assert.deepEqual(segment.cards[0], { title: "大口顧客", body: "戦略的パートナーとして深耕", icon: "building" });
  assert.deepEqual(result.keyMessageBand, {
    label: "KEY MESSAGE",
    headline: "顧客起点で拠点・調達・KPIを一体運営",
    checklist: ["顧客ニーズに基づく一気通貫の運営体制", "統合シナジーを実行力に変える仕組み", "持続的な成長を支えるガバナンス"],
  });
});

test("pre_family_ir_to_slide_spec: operating_model_cascade adapter rejects a card icon outside its own closed vocabulary", () => {
  const ir = omFullIr();
  const iconEl = ir.elements.find((e) => e.groupId === "stage-segment-card-1" && e.semanticRole === "icon");
  iconEl.value = "coins";
  assert.throws(() => preFamilyIrToOperatingModelCascade(ir), /building\/pin\/people\/diamond\/truck\/bar-chart\/person\/org-chart\/gear\/document/);
});

test("operating_model_cascade end to end: 3 fixtures (reference-faithful 4-stage canonical with asymmetric 3/3/4/3 cards, 3-stage adaptive minimum, 5-stage adaptive maximum with longer text) render with 0 QA findings and export to a clean PPTX", async () => {
  const fixtures = [
    { ir: omFullIr(), title: "統合後の営業オペレーティングモデルを4層で再設計する", subtitle: "顧客起点で提供価値・実行ケイパビリティ・ガバナンスを連動させ、統合シナジーを最大化する" },
    {
      ir: {
        elements: [
          ...omStageElements("segment", "01", "顧客セグメント", "誰に価値を届けるか", [
            { title: "大口顧客", body: "戦略的パートナーとして深耕", icon: "building" },
            { title: "地域顧客", body: "地域特性に合わせたきめ細かな対応", icon: "pin" },
          ]),
          ...omStageElements("value", "02", "提供価値", "どのような価値を提供するか", [
            { title: "専門提案", body: "業界知見に基づく課題解決型の提案", icon: "diamond" },
            { title: "コスト最適化", body: "スケールメリットを活かした価格競争力", icon: "bar-chart" },
            { title: "迅速供給", body: "最適なサプライチェーンで安定供給", icon: "truck" },
          ]),
          ...omStageElements("governance", "03", "ガバナンス", "どのように統制・推進するか", [
            { title: "営業本部長", body: "全体戦略の策定・意思決定", icon: "person" },
            { title: "月次レビュー", body: "KPIの達成状況をモニタリング", icon: "document" },
          ]),
          ...omKeyMessageElements(null, "顧客起点で意思決定を一体運営", ["顧客ニーズに基づく運営体制", "持続的な成長を支えるガバナンス"]),
        ],
        relationships: [],
      },
      title: "統合後の営業オペレーティングモデルを3層で再設計する",
    },
    {
      // 5 stages (the v1 max) with longer Japanese titles/bodies — stress test.
      ir: {
        elements: [
          ...omStageElements("segment", "01", "顧客セグメント", "誰に価値を届けるか判断する", [
            { title: "大口戦略顧客", body: "戦略的パートナーとして深耕し関係を強化する", icon: "building" },
            { title: "地域密着顧客", body: "地域特性に合わせたきめ細かな対応を徹底する", icon: "pin" },
            { title: "新規市場開拓", body: "新たな市場・業界への積極的なアプローチを行う", icon: "people" },
          ]),
          ...omStageElements("value", "02", "提供価値", "どのような価値を提供するか明確化する", [
            { title: "専門性の高い提案", body: "業界知見に基づく課題解決型の提案を徹底する", icon: "diamond" },
            { title: "迅速な供給体制", body: "最適なサプライチェーンで安定・迅速に供給する", icon: "truck" },
            { title: "コスト最適化戦略", body: "スケールメリットを活かした価格競争力を実現する", icon: "bar-chart" },
          ]),
          ...omStageElements("capability", "03", "実行ケイパビリティ", "どのように実行するか具体化する", [
            { title: "重点顧客担当制の導入", body: "大口顧客に専任チームを配置し関係を深化させる", icon: "person" },
            { title: "共同購買体制の構築", body: "統合による調達力の最大化を図る", icon: "org-chart" },
            { title: "拠点再編の実行", body: "最適な拠点配置で営業・物流を効率化する", icon: "gear" },
          ]),
          ...omStageElements("technology", "04", "テクノロジー", "どのように技術を活用するか定める", [
            { title: "データ統合基盤の整備", body: "顧客データを一元管理し意思決定を高度化する", icon: "gear" },
            { title: "営業支援システムの導入", body: "商談プロセスをデジタル化し生産性を向上させる", icon: "document" },
          ]),
          ...omStageElements("governance", "05", "ガバナンス", "どのように統制・推進するか設計する", [
            { title: "営業本部長主導の体制", body: "全体戦略の策定・意思決定を一元化する", icon: "person" },
            { title: "部門横断PMI会議の設置", body: "部門横断での進捗管理・課題解決を推進する", icon: "people" },
            { title: "月次KPIレビューの定着", body: "KPIの達成状況をモニタリングし継続的に改善する", icon: "document" },
          ]),
          ...omKeyMessageElements("KEY MESSAGE", "顧客起点で拠点・調達・技術・KPIを一体運営する", [
            "顧客ニーズに基づく一気通貫の運営体制を構築する",
            "統合シナジーを実行力に変える仕組みを整備する",
            "テクノロジー活用で意思決定の質を高める",
            "持続的な成長を支えるガバナンスを確立する",
          ]),
        ],
        relationships: [],
      },
      title: "統合後の営業オペレーティングモデルを5層で再設計する（詳細版）",
      subtitle: "顧客起点で提供価値・実行ケイパビリティ・テクノロジー・ガバナンスを連動させ、統合シナジーを最大化する",
    },
  ];

  for (const [i, fixture] of fixtures.entries()) {
    const selection = await selectPattern({ family: "operating-model", variant: "standard" }, fixture.ir);
    assert.equal(selection.eligibility, "PASS", `fixture ${i}: ${JSON.stringify(selection.rejectedCandidates)}`);
    const slide = preFamilyIrToSlideSpec(selection, fixture.ir, { title: fixture.title, subtitle: fixture.subtitle, source: "Source: test" });

    const specPath = path.join(tmpDir, `om-e2e-${i}-spec.json`);
    const htmlPath = path.join(tmpDir, `om-e2e-${i}.html`);
    await fs.writeFile(specPath, JSON.stringify({ deckTitle: "t", slides: [slide] }));
    await execFileAsync("node", [path.join(root, "scripts/render_spec_to_html.mjs"), specPath, htmlPath]);

    const gateResult = await execFileAsync("node", [path.join(root, "scripts/run_mechanical_gate.mjs"), specPath, htmlPath]);
    const gateReport = JSON.parse(gateResult.stdout);
    assert.equal(gateReport.passed, true, `fixture ${i} mechanical gate: ${JSON.stringify(gateReport.errors)}`);

    const pptxPath = path.join(tmpDir, `om-e2e-${i}.pptx`);
    await execFileAsync("node", [path.join(root, "scripts/export_spec_to_editable_pptx.mjs"), specPath, pptxPath]);
    const auditResult = await auditPptxStructure(await fs.readFile(pptxPath));
    assert.deepEqual(auditResult, { passed: true, errors: [] }, `fixture ${i} PPTX audit`);
  }
});

// ============================================================================================
// Library v0.2 Integration Gate
// ============================================================================================
// With all 7 Library v0.2 patterns (RP-KPI-EXEC-DASHBOARD-01, RP-COMPARISON-TABLE-01,
// RP-DECISION-ASK-01, RP-KEY-TAKEAWAYS-01, RP-MATRIX-BADGELIST-01, RP-100DAY-WORKSTREAM-01,
// RP-OPERATING-MODEL-01) individually verified above, the remaining risk is not "does pattern
// X work in isolation" but "do the 7 correctly reject each other's own content when explicitly
// asked" — a full 7x7 Selector Collision Matrix — plus a single mixed deck (1 slide per
// pattern) exercised through the complete pipeline to catch deck-level issues no single-slide
// test can see (page numbering, footer/margin consistency, cross-pattern visual rhythm).

function libraryCollisionFixtures() {
  const kpiFixture = {
    elements: [
      { semanticRole: "headline", groupId: null, value: "収益性は改善基調、次の論点は運転資本の圧縮" },
      ...kpiGroupElements(1, "売上高", "128", { icon: "bar-chart", context: "トップラインの持続的な成長", unit: "億円", delta: "+12%" }),
      ...kpiGroupElements(2, "EBITDA", "18.4", { icon: "coins", context: "収益力の強化とキャッシュ創出", unit: "億円", delta: "+2.1億円" }),
      ...kpiGroupElements(3, "粗利率", "32.5", { icon: "pie", context: "高付加価値化による収益性向上", unit: "%", delta: "+1.8pt" }),
      { semanticRole: "title", groupId: "insights", value: "示唆" },
      { semanticRole: "bullets", groupId: "insights", value: "売上成長は継続している" },
    ],
    relationships: [],
  };
  const cmpFixture = {
    elements: [
      ...["Strategic Fit", "Synergy Potential", "Execution Risk"].map((c) => ({ semanticRole: "title", groupId: "criteria", value: c })),
      ...cmpCandidateElements("cand-a", "候補A", ["○|方向性は一致", "○|中程度", "○|管理可能"]),
      ...cmpCandidateElements("cand-b", "候補B", ["◎|中核戦略に合致", "◎|大きい", "○|管理可能"], { highlight: true }),
    ],
    relationships: [],
  };
  const dqFixture = {
    elements: [
      ...dqGroupElements("dg0", "01", "Day60組織案の承認", ["営業・調達・人事の責任体制を確定"], { context: "組織を整える", icon: "org-chart" }),
      ...dqGroupElements("dg1", "02", "100日目標の承認", ["顧客離反ゼロ"], { context: "成果を出す", icon: "bar-chart" }),
    ],
    relationships: [],
  };
  const twFixture = {
    elements: [
      ...twGroupElements("tw0", "01", "市場", "高付加価値セグメントが成長を牽引", "上位顧客の需要が堅調", { icon: "bar-chart" }),
      ...twGroupElements("tw1", "02", "収益", "粗利改善余地は調達統合に集中", "共同購買の即効性が高い", { icon: "coins" }),
      { semanticRole: "title", groupId: "insightPanel", value: "示唆" },
      ...insightItemElements("insightPanel-i1", "1", "成長領域への集中", "高付加価値セグメントに経営資源を優先配分する"),
      { semanticRole: "title", groupId: "soWhat", value: "So What" },
      { semanticRole: "body", groupId: "soWhat", value: "したがって、買収後100日間は価格より統合実行力が価値創出を左右する" },
    ],
    relationships: [],
  };
  return {
    kpi: { name: "KPI Dashboard", fixture: kpiFixture, intent: { family: "kpi-dashboard", variant: "standard" }, expected: "RP-KPI-EXEC-DASHBOARD-01", title: "収益性は改善基調、次の論点は運転資本の圧縮" },
    comparison: { name: "Comparison Table", fixture: cmpFixture, intent: { family: "comparison-table", variant: "standard" }, expected: "RP-COMPARISON-TABLE-01", title: "戦略オプションを主要評価軸で比較する" },
    decision: { name: "Decision Ask", fixture: dqFixture, intent: { family: "decision-ask", variant: "standard" }, expected: "RP-DECISION-ASK-01", title: "Day60組織案・100日目標の2論点についてご承認いただきたい" },
    takeaways: { name: "Key Takeaways", fixture: twFixture, intent: { family: "key-takeaways", variant: "standard" }, expected: "RP-KEY-TAKEAWAYS-01", title: "検討全体から導く2つの結論について報告する" },
    matrix: { name: "Matrix Badge List", fixture: mqFullIr(), intent: { family: "matrix", variant: "badge-list" }, expected: "RP-MATRIX-BADGELIST-01", title: "統合課題を緊急度と事業影響度で整理する" },
    workstream100day: { name: "100-Day Workstream", fixture: w100FullIr(), intent: { family: "100day-workstream", variant: "standard" }, expected: "RP-100DAY-WORKSTREAM-01", title: "100日プランは4つのワークストリームで推進する" },
    operatingModel: { name: "Operating Model", fixture: omFullIr(), intent: { family: "operating-model", variant: "standard" }, expected: "RP-OPERATING-MODEL-01", title: "統合後の営業オペレーティングモデルを4層で再設計する" },
  };
}

test("Library v0.2 Integration Gate: Selector Collision Matrix — each of the 7 patterns' own canonical fixture PASSes only its own (family, variant) intent and FAILs the other 6", async () => {
  const patterns = Object.values(libraryCollisionFixtures());
  for (const row of patterns) {
    for (const col of patterns) {
      const result = await selectPattern(col.intent, row.fixture);
      if (row.name === col.name) {
        assert.equal(result.eligibility, "PASS", `${row.name} fixture x its own (${col.intent.family}|${col.intent.variant}) intent (diagonal) should PASS`);
        assert.equal(result.selectedPattern, col.expected, `${row.name} fixture x its own intent should select ${col.expected}`);
      } else {
        assert.equal(
          result.eligibility, "FAIL",
          `${row.name}'s own fixture x ${col.name}'s (${col.intent.family}|${col.intent.variant}) intent should FAIL, not be mistakenly accepted as ${col.name} (off-diagonal false positive)`,
        );
      }
    }
  }
});

test("Library v0.2 Integration Gate: RP-MATRIX-BADGELIST-01's own fixture is rejected by the pre-existing matrix|hero and matrix|plain intents, and a Hero-shaped fixture is rejected by matrix|badge-list", async () => {
  const badgeListFixture = mqFullIr();
  const heroResult = await selectPattern({ family: "matrix", variant: "hero" }, badgeListFixture);
  assert.equal(heroResult.eligibility, "FAIL");
  const plainResult = await selectPattern({ family: "matrix", variant: "plain" }, badgeListFixture);
  assert.equal(plainResult.eligibility, "FAIL");
  const badgeListResult = await selectPattern({ family: "matrix", variant: "badge-list" }, MATRIX_HERO_IR);
  assert.equal(badgeListResult.eligibility, "FAIL");
});

test("Library v0.2 Integration Gate: Mixed Deck E2E — a 7-slide showcase deck (one slide per Library v0.2 pattern) validates, renders with 0 QA findings across every slide, and exports to a clean, fully-audited PPTX", async () => {
  const fixtures = libraryCollisionFixtures();
  const slides = [];
  for (const key of ["kpi", "comparison", "decision", "takeaways", "matrix", "workstream100day", "operatingModel"]) {
    const p = fixtures[key];
    const selection = await selectPattern(p.intent, p.fixture);
    assert.equal(selection.eligibility, "PASS", `${p.name}: ${JSON.stringify(selection.rejectedCandidates)}`);
    const slide = preFamilyIrToSlideSpec(selection, p.fixture, { title: p.title, source: "Source: test" });
    slides.push(slide);
  }

  const specPath = path.join(tmpDir, "library-v02-showcase-spec.json");
  const htmlPath = path.join(tmpDir, "library-v02-showcase.html");
  const pptxPath = path.join(tmpDir, "library-v02-showcase.pptx");
  await fs.writeFile(specPath, JSON.stringify({ deckTitle: "Library v0.2 Showcase", slides }));

  await execFileAsync("node", [path.join(root, "scripts/validate_spec.mjs"), specPath]);
  await execFileAsync("node", [path.join(root, "scripts/render_spec_to_html.mjs"), specPath, htmlPath]);

  const gateResult = await execFileAsync("node", [path.join(root, "scripts/run_mechanical_gate.mjs"), specPath, htmlPath]);
  const gateReport = JSON.parse(gateResult.stdout);
  assert.equal(gateReport.passed, true, `deck-level mechanical gate: ${JSON.stringify(gateReport.errors)}`);

  await execFileAsync("node", [path.join(root, "scripts/export_spec_to_editable_pptx.mjs"), specPath, pptxPath]);
  const auditResult = await auditPptxStructure(await fs.readFile(pptxPath));
  assert.deepEqual(auditResult, { passed: true, errors: [] }, "deck-level PPTX OOXML audit");

  // Deck-level content fidelity: every pattern's own title made it into the deck unmutated,
  // in the same order the slides were authored (page-to-page order is itself a content
  // property this deck cares about, since the showcase's own narrative is "one pattern per
  // page, in a stable order").
  const savedSpec = JSON.parse(await fs.readFile(specPath, "utf8"));
  assert.equal(savedSpec.slides.length, 7);
  const expectedTemplates = ["kpi_dashboard", "comparison_table", "decision_page", "recommendation_pillars", "matrix_2x2", "workstream_100day", "operating_model_cascade"];
  assert.deepEqual(savedSpec.slides.map((s) => s.template), expectedTemplates);
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

test("check_content_structure: flags a 4-column key_takeaways headline/supportText denser than the accepted maximum-density fixture, as a warning not an error", () => {
  const dense = {
    deckTitle: "t",
    slides: [{
      template: "recommendation_pillars", title: "t", subtitle: "s",
      takeaways: [
        { number: "01", category: "A", headline: "あ".repeat(45), supportText: "い".repeat(50) },
        { number: "02", category: "B", headline: "短い", supportText: "短い" },
        { number: "03", category: "C", headline: "短い", supportText: "短い" },
        { number: "04", category: "D", headline: "短い", supportText: "短い" },
      ],
      insightPanel: { items: [{ number: "1", title: "t", body: "b" }] },
      soWhat: { text: "t" },
    }],
  };
  const denseResult = checkContentStructure(dense);
  assert.equal(denseResult.passed, true, "density issues are a soft warning, not a blocking error");
  const denseWarnings = denseResult.warnings.filter((w) => w.type === "key_takeaway_4col_density");
  assert.equal(denseWarnings.length, 2);
  assert.ok(denseWarnings.some((w) => w.element === "takeaways[0].headline"));
  assert.ok(denseWarnings.some((w) => w.element === "takeaways[0].supportText"));

  // A 3-column slide with the same long headline is NOT flagged — the soft cap is specific to
  // the 4-column layout's narrower columns.
  const threeCol = { ...dense, slides: [{ ...dense.slides[0], takeaways: dense.slides[0].takeaways.slice(0, 3) }] };
  const threeColResult = checkContentStructure(threeCol);
  assert.equal(threeColResult.warnings.filter((w) => w.type === "key_takeaway_4col_density").length, 0);
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
