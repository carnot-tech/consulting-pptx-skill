// fix_pptx_shape_ids.mjs — post-export repair for a real pptxgenjs bug.
//
// pptxgenjs@4.0.1 assigns <p:cNvPr id="..."> for text/shape/image/chart objects from their
// position in the slide's object array (idx + 2), but for TABLES it instead computes
// `intTableNum * slide._slideNum + 1` (dist/pptxgen.cjs.js, the graphicFrame branch). That
// formula has no relationship to how many shapes are already on the slide, so on any slide
// with >= 3 shapes before a table, the table's id collides with an existing shape's id.
// Duplicate <p:cNvPr id> within one slide's shape tree is invalid OOXML and is exactly what
// makes PowerPoint show "we found a problem with some content" and offer to repair the file
// (confirmed against a real PowerPoint round-trip). This is a pptxgenjs bug, not something
// fixable by calling its public API differently — so we repair the ids mechanically after
// export, which is a fully deterministic, code-appropriate fix (no LLM judgment involved).
import JSZip from "jszip";

const CNVPR_ID_RE = /(<p:cNvPr\s+id=")(\d+)(")/g;

// Given one slideN.xml's text, renumber any <p:cNvPr id="N"> that repeats an id already seen
// earlier in document order. The first shape to use an id keeps it; any later shape reusing
// that id (in practice: always the table, since addTable is called after other shapes on the
// slide) gets bumped to a fresh id past the current max. Returns {xml, changed, renumbered}.
export function dedupeSlideShapeIds(xml) {
  const seen = new Set();
  let maxId = 0;
  for (const m of xml.matchAll(CNVPR_ID_RE)) {
    maxId = Math.max(maxId, Number(m[2]));
  }
  const renumbered = [];
  const out = xml.replace(CNVPR_ID_RE, (full, pre, idStr, post) => {
    const id = Number(idStr);
    if (!seen.has(id)) {
      seen.add(id);
      return full;
    }
    maxId += 1;
    seen.add(maxId);
    renumbered.push({ from: id, to: maxId });
    return `${pre}${maxId}${post}`;
  });
  return { xml: out, changed: renumbered.length > 0, renumbered };
}

// Loads a .pptx (as a Buffer), deduplicates cNvPr ids on every slide, and returns the fixed
// Buffer plus a report of what was changed (empty report = file was already clean).
export async function fixPptxShapeIds(pptxBuffer) {
  const zip = await JSZip.loadAsync(pptxBuffer);
  const report = [];
  const slideFiles = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  for (const name of slideFiles) {
    const xml = await zip.file(name).async("string");
    const { xml: fixedXml, changed, renumbered } = dedupeSlideShapeIds(xml);
    if (changed) {
      zip.file(name, fixedXml);
      report.push({ slide: name, renumbered });
    }
  }
  const fixedBuffer = await zip.generateAsync({ type: "nodebuffer" });
  return { buffer: fixedBuffer, report };
}
