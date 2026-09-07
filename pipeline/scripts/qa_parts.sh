#!/bin/bash
# 型プラグインの目視QA: archetypes の example → PPTX → PDF → PNG
# 使い方: bash scripts/qa_parts.sh [template_id ...]     （id 省略時は全プラグイン型）
#   出力先は $QA_OUT（既定 generated/parts_qa）。並列作業時は QA_OUT を分ける。
#   super_template.json には触らない（正本への反映は build_parts_template.mjs）。
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="${QA_OUT:-generated/parts_qa}"; export OUT; mkdir -p "$OUT"
node -e '
  const fs=require("fs"), path=require("path");
  (async()=>{
    const dir=path.resolve("scripts/archetypes"); const ids=new Set(process.argv.slice(1));
    const mods=[]; for (const f of fs.readdirSync(dir).filter(f=>f.endsWith(".mjs")&&!f.startsWith("_")).sort()){ const m=await import(path.join(dir,f)); if(m.id&&m.example&&(ids.size===0||ids.has(m.id))) mods.push(m); }
    mods.sort((a,b)=>(a.part||99)-(b.part||99));
    const base=JSON.parse(fs.readFileSync("slide-spec/super_template.json","utf8"));
    fs.writeFileSync(process.env.OUT+"/_spec.json", JSON.stringify({deckTitle:"資料名", palette: base.palette, slides: mods.map(m=>m.example)},null,2));
    console.log("spec:", mods.map(m=>m.id).join(", "));
  })();' "$@"
SPEC="$OUT/_spec.json"
node scripts/validate_spec.mjs "$SPEC"
node scripts/export_spec_to_editable_pptx.mjs "$SPEC" "$OUT/parts.pptx" >/dev/null
TMP=$(mktemp -d); mkdir -p "$TMP/fc"
cat > "$TMP/fonts.conf" <<CONF
<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig>
<dir>/Library/Fonts</dir><dir>/System/Library/Fonts</dir><dir>/System/Library/Fonts/Supplemental</dir><dir>~/Library/Fonts</dir><dir>/System/Library/AssetsV2</dir><cachedir>$TMP/fc</cachedir>
<alias binding="strong"><family>Yu Gothic</family><prefer><family>Yu Gothic</family><family>YuGothic</family><family>Hiragino Sans</family></prefer></alias>
<alias binding="strong"><family>Yu Mincho</family><prefer><family>Yu Mincho</family><family>YuMincho</family><family>Hiragino Mincho ProN</family></prefer></alias>
<alias binding="strong"><family>Yu Mincho Demibold</family><prefer><family>Yu Mincho Demibold</family><family>YuMincho</family><family>Yu Mincho</family><family>Hiragino Mincho ProN</family></prefer></alias>
</fontconfig>
CONF
FONTCONFIG_FILE="$TMP/fonts.conf" soffice "-env:UserInstallation=file://$TMP/lo" --headless --convert-to pdf --outdir "$OUT" "$OUT/parts.pptx" >/dev/null 2>&1
rm -f "$OUT"/p*.png "$OUT"/ref_*.png
python3 - "$OUT/parts.pdf" "$OUT" "$SPEC" <<'PY'
import sys, json, fitz, os
pdf, out, spec = sys.argv[1:4]
slides=json.load(open(spec))["slides"]
d=fitz.open(pdf)
ref=fitz.open("generated/FreeformParts_16x9.pdf") if os.path.exists("generated/FreeformParts_16x9.pdf") else None
for i,p in enumerate(d):
    sid=slides[i]["template"] if i<len(slides) else "x"
    name=f"{out}/p{i+1:02d}_{sid}.png"; p.get_pixmap(dpi=80).save(name); print(name)
    # 参照（HTMLパーツ集の同じパーツ）: kicker「パーツNN｜…」の NN ページ目
    k=slides[i].get("kicker","") if i<len(slides) else ""
    if ref and k.startswith("パーツ"):
        n=int(k[3:5]); ref[n-1].get_pixmap(dpi=80).save(f"{out}/ref_{i+1:02d}_{sid}.png")
PY
python3 ../scripts/check_deck.py "$OUT/parts.pptx" --template | tail -3
