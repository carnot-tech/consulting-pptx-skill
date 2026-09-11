// 型プラグイン（archetypes/*.mjs）の example を slide-spec/super_template.json に流し込む。
//   node scripts/build_parts_template.mjs            … 36型の既存スライドは保持し、プラグイン型を id 単位で追加／置換
//   node scripts/build_parts_template.mjs --only     … プラグイン型だけの slide-spec/parts_template.json も書く（個別QA用）
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const dir = path.join(root, "scripts/archetypes");
const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".mjs") && !f.startsWith("_")).sort();
const mods = [];
for (const f of files) {
  const m = await import(pathToFileURL(path.join(dir, f)).href);
  if (m.id && m.example) mods.push(m);
}
mods.sort((a, b) => (a.part || 99) - (b.part || 99));
const specPath = path.join(root, "slide-spec/super_template.json");
const spec = JSON.parse(await fs.readFile(specPath, "utf8"));
const pluginIds = new Set(mods.map((m) => m.id));
const kept = spec.slides.filter((s) => !pluginIds.has(s.template));
spec.slides = [...kept, ...mods.map((m) => m.example)];
await fs.writeFile(specPath, JSON.stringify(spec, null, 2) + "\n");
console.log(`super_template.json: ${kept.length} built-in + ${mods.length} plugin = ${spec.slides.length} slides`);
if (process.argv.includes("--only")) {
  const only = { deckTitle: spec.deckTitle, palette: spec.palette, slides: mods.map((m) => m.example) };
  await fs.writeFile(path.join(root, "slide-spec/parts_template.json"), JSON.stringify(only, null, 2) + "\n");
  console.log(`parts_template.json: ${mods.length} slides`);
}
