# Visual Contracts

One file per pattern, `<patternId>.md`, written **before** implementation begins — see
`references/reference-pattern-implementation-policy.md` for the mandatory process this
directory exists to support (Reference image → Visual Pattern Analysis → Visual Contract →
Semantic Contract → Renderer implementation) and the exact 10-category analysis + file
structure each contract file follows.

This is the Visual Contract half of each pattern's specification — the Semantic Contract half
already lives in `../library.json` (machine-read) and `references/pre-family-ir-authoring.md`
(the `elements[]`/`relationships[]` authoring shape, in depth). Nothing else in this pipeline
writes down what a reference image's own composition — region layout, visual hierarchy,
component anatomy, color roles, emphasis logic — actually requires; that gap is what let
RP-KPI-EXEC-DASHBOARD-01 and RP-MATRIX-BADGELIST-01 both pass their Semantic Contract on the
first attempt while visually simplifying the reference image, needing a second pass to fix.

Not retroactively required for patterns already frozen before this convention existed — applies
to every pattern implemented from here forward.
