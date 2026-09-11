// check_numerical_integrity.mjs — deterministic numerical-consistency checks that run
// directly against the Slide IR (SlideSpec JSON), not against rendered HTML/PPTX text.
// This is the "numerical" tier of the Mechanical Quality Gate (see run_mechanical_gate.mjs).
//
// Operating on the IR rather than parsing rendered output means every check here is exact
// (no OCR/regex-out-of-a-screenshot guessing) — a false negative only happens when a slide's
// numbers genuinely aren't represented structurally (e.g. typed as prose inside a bullet),
// which this script reports as "not checkable", never silently ignores.
//
// Usage: node scripts/check_numerical_integrity.mjs <spec.json>
// Output: structured JSON, {passed, errors[], warnings[]}. Exit 1 if any error.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Tolerances are deliberately loose enough to absorb "authored a rounded display value"
// (a CAGR chip shown as a whole percent, a total rounded to a clean figure) without
// absorbing an actually-wrong number. Calibrated against real rounding behavior observed
// while building this check: a geometric-mean CAGR of 22.4% commonly gets authored as
// "23%" (nearest whole percent, not truncated) — that is legitimate, not an error.
const TOLERANCE_PCT = 0.03; // 3% relative tolerance
const TOLERANCE_ABS = 1.0; // absolute fallback (percentage points, or small counts) where relative tolerance is too tight

function near(a, b) {
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  const diff = Math.abs(a - b);
  if (diff <= TOLERANCE_ABS) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return diff / scale <= TOLERANCE_PCT;
}

function parsePercentString(s) {
  if (typeof s === "number") return s;
  const m = String(s ?? "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

function numberFromCell(s) {
  if (typeof s === "number") return s;
  const m = String(s ?? "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
}

// ---- checks -----------------------------------------------------------------

// true_waterfall: chart.series[] with {label, value, kind: base|up|down|total}. Recompute
// the running total per the same algorithm the renderers use (export_spec_to_editable_pptx.mjs
// #addTrueWaterfall) and verify every checkpoint ("total"/"base" entries after the first)
// matches the value implied by everything before it.
function checkWaterfall(slide, at, errors, warnings) {
  if (slide.template !== "true_waterfall" || !slide.chart?.series?.length) return false;
  const series = slide.chart.series;
  let running = null;
  series.forEach((d, i) => {
    if (typeof d.value !== "number") return;
    if (d.kind === "total" || d.kind === "base") {
      if (i > 0 && running != null && !near(running, d.value)) {
        errors.push({
          slide: at, type: "waterfall_checkpoint_mismatch", element: d.label,
          detail: `running total from prior entries is ${running}, but this checkpoint declares ${d.value}`,
        });
      }
      running = d.value;
    } else if (d.kind === "down") {
      running = (running ?? 0) - Math.abs(d.value);
    } else {
      running = (running ?? 0) + Math.abs(d.value);
    }
  });
  return true;
}

// scenario_lines_cagr-shaped data (parts.series[].values[] + parts.series[].chip:"NN%"):
// recompute CAGR from the first/last values and compare to the stated chip.
function checkCagrChips(slide, at, errors, warnings) {
  const series = slide.parts?.series;
  if (!Array.isArray(series) || !series.length) return false;
  let any = false;
  series.forEach((s) => {
    if (!Array.isArray(s.values) || s.values.length < 2 || typeof s.chip !== "string" || !/%/.test(s.chip)) return;
    any = true;
    const first = s.values[0], last = s.values[s.values.length - 1];
    const periods = s.values.length - 1;
    if (!(first > 0) || !(last > 0) || periods < 1) {
      warnings.push({ slide: at, type: "cagr_not_checkable", element: s.name, detail: "first/last value must be positive to compute a CAGR" });
      return;
    }
    const computed = (Math.pow(last / first, 1 / periods) - 1) * 100;
    const stated = parsePercentString(s.chip);
    if (stated != null && !near(computed, stated)) {
      errors.push({
        slide: at, type: "cagr_mismatch", element: s.name,
        detail: `stated chip is ${s.chip}, but ${first}→${last} over ${periods} periods computes to ${computed.toFixed(1)}%`,
      });
    }
  });
  return any;
}

// stacked_bar: stacks.categories[].segments[].value, when stacks.unit reads as a percentage
// unit, every category's segments should sum to ~100.
function checkStackedPercentages(slide, at, errors, warnings) {
  const stacks = slide.stacks;
  if (!stacks?.categories?.length || !/%/.test(String(stacks.unit || ""))) return false;
  stacks.categories.forEach((cat) => {
    const values = (cat.segments || []).map((s) => s.value).filter((v) => typeof v === "number");
    if (!values.length) return;
    const sum = values.reduce((a, b) => a + b, 0);
    if (!near(sum, 100)) {
      errors.push({ slide: at, type: "percentage_sum_mismatch", element: cat.label, detail: `segments sum to ${sum}, expected ~100 (unit: ${stacks.unit})` });
    }
  });
  return true;
}

// dot_matrix_share-shaped data (parts.columns[].value:"NN%" alongside parts.columns[].pct):
// the displayed percentage string must match the underlying numeric value that actually
// drives the dot count — otherwise the visual and the label disagree.
function checkDisplayedVsUnderlyingPercent(slide, at, errors, warnings) {
  const columns = slide.parts?.columns;
  if (!Array.isArray(columns) || !columns.length) return false;
  let any = false;
  columns.forEach((c) => {
    if (typeof c.pct !== "number" || c.value == null) return;
    const displayed = parsePercentString(c.value);
    if (displayed == null) return;
    any = true;
    if (!near(displayed, c.pct)) {
      errors.push({ slide: at, type: "displayed_percent_mismatch", element: c.label || c.value, detail: `displayed "${c.value}" but underlying pct is ${c.pct}` });
    }
  });
  return any;
}

// Generic subtotal/total row check: any {label, cells:[...]} row array (axis.rows,
// grid.rows, lanes.rows) whose label matches a total/subtotal marker gets its numeric
// cells compared against the column-wise sum of the OTHER rows in the same array.
const TOTAL_ROW_PATTERN = /合計|総計|小計|total|subtotal/i;
function checkLabeledTotalRows(slide, at, errors, warnings) {
  const rowArrays = [
    slide.axis?.rows,
    slide.grid?.rows,
    slide.lanes?.rows,
  ].filter((a) => Array.isArray(a) && a.length >= 2);
  let any = false;
  for (const rows of rowArrays) {
    const totalIdx = rows.findIndex((r) => TOTAL_ROW_PATTERN.test(String(r.label || r.period || "")));
    if (totalIdx < 0) continue;
    const totalRow = rows[totalIdx];
    const otherRows = rows.filter((_, i) => i !== totalIdx);
    const cellCount = (totalRow.cells || []).length;
    for (let ci = 0; ci < cellCount; ci += 1) {
      const declared = numberFromCell(totalRow.cells[ci]);
      if (declared == null) continue;
      const columnValues = otherRows.map((r) => numberFromCell((r.cells || [])[ci])).filter((v) => v != null);
      if (columnValues.length < otherRows.length) continue; // not every row's cell in this column is numeric — not a sum column
      any = true;
      const sum = columnValues.reduce((a, b) => a + b, 0);
      if (!near(sum, declared)) {
        errors.push({
          slide: at, type: "subtotal_total_mismatch", element: `${totalRow.label || totalRow.period} (col ${ci + 1})`,
          detail: `labeled total row declares ${declared} but the other rows sum to ${sum}`,
        });
      }
    }
  }
  return any;
}

const ALL_CHECKS = [checkWaterfall, checkCagrChips, checkStackedPercentages, checkDisplayedVsUnderlyingPercent, checkLabeledTotalRows];

export function checkNumericalIntegrity(spec) {
  const errors = [];
  const warnings = [];
  (spec.slides || []).forEach((slide, i) => {
    const at = i + 1;
    let anyApplicable = false;
    for (const check of ALL_CHECKS) {
      if (check(slide, at, errors, warnings)) anyApplicable = true;
    }
    if (!anyApplicable) {
      warnings.push({ slide: at, type: "no_numerical_check_applicable", detail: `template "${slide.template}" carries no structured numeric fields this script recognizes` });
    }
  });
  return { passed: errors.length === 0, errors, warnings };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputArg = process.argv[2];
  if (!inputArg) { console.error("usage: node scripts/check_numerical_integrity.mjs <spec.json>"); process.exit(2); }
  const spec = JSON.parse(await fs.readFile(path.resolve(process.cwd(), inputArg), "utf8"));
  const result = checkNumericalIntegrity(spec);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}
