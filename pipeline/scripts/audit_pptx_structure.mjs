// audit_pptx_structure.mjs — structural OOXML sanity check for a generated .pptx.
//
// This targets the specific defect classes that make PowerPoint show "we found a problem
// with some content in <file>. Would you like us to try to repair it?" — duplicate <p:cNvPr
// id> within a slide (the exact bug fix_pptx_shape_ids.mjs repairs), a relationship id
// referenced from slide/part XML that isn't defined in that part's .rels, and a file in the
// package whose extension has no Default/Override entry in [Content_Types].xml. It is
// intentionally narrower than a full OOXML schema validator: it checks the specific things
// that have actually caused a real PowerPoint repair prompt on this pipeline's output, not
// every rule in the spec. Zero findings is necessary but not sufficient for "PowerPoint opens
// it with 0 repairs" — it does not replace an actual PowerPoint open/edit/save/reopen test.
//
// Usage: node scripts/audit_pptx_structure.mjs <deck.pptx>
import JSZip from "jszip";
import fs from "node:fs/promises";
import { pathToFileURL } from "node:url";

const CNVPR_ID_RE = /<p:cNvPr\s+id="(\d+)"/g;
const REL_REF_RE = /r:(?:id|embed|link)="([^"]+)"/g;
const REL_DEF_RE = /<Relationship\s+[^>]*\bId="([^"]+)"[^>]*\/?>/g;
const CT_DEFAULT_RE = /<Default\s+Extension="([^"]+)"/g;
const CT_OVERRIDE_RE = /<Override\s+PartName="([^"]+)"/g;

export async function auditPptxStructure(pptxBuffer) {
  const zip = await JSZip.loadAsync(pptxBuffer);
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  const errors = [];

  // 1. duplicate cNvPr id per slide
  const slideFiles = names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
  for (const name of slideFiles) {
    const xml = await zip.file(name).async("string");
    const seen = new Set();
    for (const m of xml.matchAll(CNVPR_ID_RE)) {
      if (seen.has(m[1])) errors.push(`${name}: duplicate <p:cNvPr id="${m[1]}">`);
      seen.add(m[1]);
    }
  }

  // 2. every r:id/r:embed/r:link reference resolves in that part's own .rels
  for (const name of names) {
    if (!name.endsWith(".xml") || name.endsWith(".rels")) continue;
    const xml = await zip.file(name).async("string");
    const refs = new Set([...xml.matchAll(REL_REF_RE)].map((m) => m[1]));
    if (refs.size === 0) continue;
    const slashIdx = name.lastIndexOf("/");
    const dir = slashIdx >= 0 ? name.slice(0, slashIdx) : "";
    const base = slashIdx >= 0 ? name.slice(slashIdx + 1) : name;
    const relsPath = dir ? `${dir}/_rels/${base}.rels` : `_rels/${base}.rels`;
    const relsFile = zip.file(relsPath);
    const defined = new Set();
    if (relsFile) {
      const relsXml = await relsFile.async("string");
      for (const m of relsXml.matchAll(REL_DEF_RE)) defined.add(m[1]);
    }
    for (const rid of refs) {
      if (!defined.has(rid)) errors.push(`${name}: references r:id/embed/link="${rid}" not defined in ${relsPath}`);
    }
  }

  // 3. every part's extension is covered by [Content_Types].xml
  const ctFile = zip.file("[Content_Types].xml");
  const defaults = new Set();
  const overrides = new Set();
  if (ctFile) {
    const ctXml = await ctFile.async("string");
    for (const m of ctXml.matchAll(CT_DEFAULT_RE)) defaults.add(m[1].toLowerCase());
    for (const m of ctXml.matchAll(CT_OVERRIDE_RE)) overrides.add(m[1]);
  }
  for (const name of names) {
    if (name === "[Content_Types].xml") continue;
    const partName = `/${name}`;
    if (overrides.has(partName)) continue;
    const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
    if (!defaults.has(ext)) errors.push(`[Content_Types].xml: no Default/Override entry covers ${partName}`);
  }

  return { passed: errors.length === 0, errors };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("usage: node scripts/audit_pptx_structure.mjs <deck.pptx>");
    process.exit(2);
  }
  const buffer = await fs.readFile(filePath);
  const result = await auditPptxStructure(buffer);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exit(1);
}
