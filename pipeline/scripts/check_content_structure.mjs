// check_content_structure.mjs — "did the deck actually get filled in" checks against the
// Slide IR: leftover template placeholders, TODO/lorem-ipsum markers, empty charts/tables,
// and unresolved template variables. Deterministic string/structure matching only — no
// judgment about whether the CONTENT is good, only whether it's actually there.
//
// This complements (does not replace) check_deck.py's existing placeholder regex, which
// runs against rendered HTML/PPTX text — that one catches rendering-stage leftovers (e.g. a
// hand-edited HTML deck that never went through Slide IR at all). This one catches the same
// class of problem one stage earlier, directly in the IR, before rendering even happens —
// cheaper to fix and covers PPTX-bound content the HTML regex never sees.
//
// Usage: node scripts/check_content_structure.mjs <spec.json>
// Output: structured JSON, {passed, errors[], warnings[]}. Exit 1 if any error.
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Same placeholder vocabulary as scripts/check_deck.py's check_title() — kept in sync
// deliberately (both files should ideally read one shared list, but check_deck.py's regex
// dialect (Python re) and this one differ enough syntactically that duplicating the
// vocabulary, not the regex, is the safer point of alignment).
const PLACEHOLDER_PATTERNS = [
  /Text\s*\d/, /ラベル\s*\d/, /タイトル\s*\d/, /Source\s*\d/, /YYYY/, /ダミー/,
  /^資料名$/, /^会社名$/, /[◯○]{2,}/,
];
const TODO_PATTERNS = [/\bTODO\b/i, /\bFIXME\b/i, /\bTBD\b/i, /要確認/, /【要出典】/, /仮置き/, /後で(埋める|直す|書く)/];
const LOREM_PATTERN = /lorem ipsum/i;
// {{variable}} / ${variable} / <variable> left unresolved by whatever authored this IR.
const UNRESOLVED_VAR_PATTERN = /\{\{[^}]+\}\}|\$\{[^}]+\}/;

function collectStrings(node, out, pathParts) {
  if (node == null) return;
  if (typeof node === "string") {
    if (node.trim()) out.push({ text: node, path: pathParts.join(".") });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => collectStrings(v, out, [...pathParts, i]));
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) collectStrings(v, out, [...pathParts, k]);
  }
}

function scanTextIssues(slide, at, errors, warnings) {
  const strings = [];
  collectStrings(slide, strings, []);
  for (const { text, path: p } of strings) {
    if (PLACEHOLDER_PATTERNS.some((re) => re.test(text))) {
      errors.push({ slide: at, type: "placeholder_residue", element: p, detail: text.slice(0, 80) });
    }
    if (TODO_PATTERNS.some((re) => re.test(text))) {
      errors.push({ slide: at, type: "todo_marker", element: p, detail: text.slice(0, 80) });
    }
    if (LOREM_PATTERN.test(text)) {
      errors.push({ slide: at, type: "lorem_ipsum", element: p, detail: text.slice(0, 80) });
    }
    if (UNRESOLVED_VAR_PATTERN.test(text)) {
      errors.push({ slide: at, type: "unresolved_template_variable", element: p, detail: text.slice(0, 80) });
    }
  }
}

// title / claims presence
function checkRequiredContent(slide, at, errors, warnings) {
  if (!slide.title || !String(slide.title).trim()) {
    // cover/section_divider/back_cover legitimately ship with no h1 (per slide-rules §2.8's
    // own carve-out) — but Slide IR always requires `title` per schema.json, so an empty
    // string here means it was authored empty, which schema validation (a separate, earlier
    // gate) should already have caught. Still worth a warning if it slips through.
    warnings.push({ slide: at, type: "empty_title" });
  }
  const claims = slide.claims;
  if (Array.isArray(claims)) {
    claims.forEach((c, i) => {
      if (!c.sourceId && !c.basis) {
        errors.push({
          slide: at, type: "unsourced_claim", element: `claims[${i}]`,
          detail: `"${String(c.text || "").slice(0, 60)}" has neither a sourceId nor a basis (assumption/illustrative/example)`,
        });
      }
    });
  }
}

// Empty chart/table detection across every shape the schema defines a chart/table in.
function checkEmptyDataObjects(slide, at, errors, warnings) {
  if (slide.chart && (!Array.isArray(slide.chart.series) || !slide.chart.series.length)) {
    errors.push({ slide: at, type: "empty_chart", element: "chart.series" });
  }
  if ("table" in slide && (!Array.isArray(slide.table) || !slide.table.length)) {
    errors.push({ slide: at, type: "empty_table", element: "table" });
  }
  const rowArrayFields = [
    ["axis", "rows"], ["grid", "rows"], ["lanes", "rows"], ["heatmap", "rows"], ["gantt", "rows"],
  ];
  for (const [obj, field] of rowArrayFields) {
    if (slide[obj] && (!Array.isArray(slide[obj][field]) || !slide[obj][field].length)) {
      errors.push({ slide: at, type: "empty_table", element: `${obj}.${field}` });
    }
  }
  if (slide.stacks && (!Array.isArray(slide.stacks.categories) || !slide.stacks.categories.length)) {
    errors.push({ slide: at, type: "empty_chart", element: "stacks.categories" });
  }
  if (slide.kpis && (!Array.isArray(slide.kpis) || !slide.kpis.length)) {
    errors.push({ slide: at, type: "empty_data", element: "kpis" });
  }
}

// Two KPI tiles with the exact same label on one slide is never intentional — it either
// means a metric was authored twice or a copy-paste left a stale label. Kept as a dedicated
// check (rather than folded into checkEmptyDataObjects) since it's a cross-item comparison,
// not a presence check.
function checkDuplicateKpiLabels(slide, at, errors, warnings) {
  if (!Array.isArray(slide.kpis)) return;
  const seen = new Map();
  slide.kpis.forEach((k, i) => {
    const norm = String(k.label || "").trim();
    if (!norm) return;
    if (seen.has(norm)) {
      errors.push({ slide: at, type: "duplicate_kpi_label", element: `kpis[${i}]`, detail: `"${norm}" also appears at kpis[${seen.get(norm)}]` });
    } else {
      seen.set(norm, i);
    }
  });
}

// A ▲/▼ prefix on a KPI delta reads as self-contradictory in Japanese financial/management
// materials (▲ conventionally means NEGATIVE regardless of the sign that follows it — a
// slide authored "▲ +12%" mistake caught during RP-KPI-EXEC-DASHBOARD-01's own visual
// review), and an auto-picked ↑/↓ is worse: it silently asserts a direction is "good," which
// is backwards for a KPI like NWC回転日数 where a DECREASE is the improvement. The sign
// alone should carry the meaning.
const DIRECTION_GLYPH_PATTERN = /[▲▼△▽↑↓]/;
function checkKpiDeltaDirectionGlyphs(slide, at, errors, warnings) {
  if (!Array.isArray(slide.kpis)) return;
  slide.kpis.forEach((k, i) => {
    if (k.delta && DIRECTION_GLYPH_PATTERN.test(k.delta)) {
      errors.push({ slide: at, type: "kpi_delta_direction_glyph", element: `kpis[${i}].delta`, detail: `"${k.delta}" — use the +/- sign alone, not a ▲/▼/↑/↓ prefix (direction glyphs either contradict the sign or wrongly imply which direction is "good")` });
    }
  });
}

export function checkContentStructure(spec) {
  const errors = [];
  const warnings = [];
  (spec.slides || []).forEach((slide, i) => {
    const at = i + 1;
    scanTextIssues(slide, at, errors, warnings);
    checkRequiredContent(slide, at, errors, warnings);
    checkEmptyDataObjects(slide, at, errors, warnings);
    checkDuplicateKpiLabels(slide, at, errors, warnings);
    checkKpiDeltaDirectionGlyphs(slide, at, errors, warnings);
  });
  return { passed: errors.length === 0, errors, warnings };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const inputArg = process.argv[2];
  if (!inputArg) { console.error("usage: node scripts/check_content_structure.mjs <spec.json>"); process.exit(2); }
  const spec = JSON.parse(await fs.readFile(path.resolve(process.cwd(), inputArg), "utf8"));
  const result = checkContentStructure(spec);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
}
