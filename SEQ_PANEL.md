# Micromium — Sequence Panel Burndown (Phase S)

Phase S adds inspection and navigation depth to the sequence panel (SeqView).
Work is staged so each step is testable in isolation before the next begins.

**Out of scope for Phase S:** editing, undo, primers, restriction sites, six-frame
translation, ORF finder, keyboard shortcuts. Those are Phase S2.

---

## Group S1 — Selection HUD

A persistent status bar below the sequence panel that reflects the current selection.
This is the first deliverable because every subsequent feature (copy, stats, jump) reads
from selection state — it must be reliable before building on top of it.

### S1a — HUD scaffold ✅ DONE
Add a thin fixed bar at the bottom of the SeqView container. Reads `selection` from
`useSelection`. Shows placeholder text when nothing is selected.

- Component: `SelectionHUD` rendered inside `SeqView` below the `VariableSizeList`
- Height: ~28px, background `#f5f5f5`, top border `1px solid #d0d0d0`
- Default state: `"No selection"` in muted grey
- Selected state: shows `start–end  |  N bp  |  GC N%  |  Tm N°C`

**Acceptance:** open `pSB1C3.gb`, click any feature arc → HUD updates with correct
length and coordinates. Click empty space → HUD resets to "No selection."

### S1b — GC% calculation ✅ TODO
Compute GC% for `doc.bases.slice(selection.start, selection.end)`.

- Formula: `(G + C) / length * 100`, rounded to one decimal
- Pure function, no side effects — easy to unit test

**Acceptance:** select the full `pSB1C3.gb` sequence (2070 bp). GC% should match
the value reported by ApE or a known-good reference tool.

### S1c — Tm calculation ✅ TODO
Basic Wallace rule for short sequences (< 14 bp); salt-adjusted nearest-neighbour
approximation for longer ones is Phase S2. For now:

- `Tm = 2(A+T) + 4(G+C)` for sequences ≤ 13 bp
- `Tm = 64.9 + 41 * (G+C - 16.4) / length` for sequences > 13 bp (Bolton–McCarthy)
- Display `—` if selection length < 6 bp (Tm undefined at very short lengths)

**Acceptance:** select a known primer from `pSB1C3.gb` features, compare Tm to
a reference calculator (e.g., Thermo or NEB Tm tool).

---

## Group S2 — Copy Selection

Builds directly on the HUD selection state. No new state needed.

### S2a — Copy as FASTA ✅ TODO
Button in the HUD: `Copy FASTA`. Writes to clipboard:

```
>selection:START-END
ATCG...
```

- Uses `navigator.clipboard.writeText()`
- Button briefly shows `Copied ✓` (500 ms) then reverts
- Disabled (greyed) when nothing is selected

**Acceptance:** select a feature, click Copy FASTA, paste into a text editor —
verify header coordinates and sequence are correct.

### S2b — Copy reverse complement ✅ TODO
Second button in the HUD: `Copy RC`. Writes reverse complement of the selection
in FASTA format with header `>rc:START-END`.

- Complement map already exists in `SeqView.tsx` (`COMPLEMENT` const) — reuse it
- Reverse the complement string before writing

**Acceptance:** copy a known feature, paste RC into ApE or BLAST — should match
expected reverse complement.

---

## Group S3 — Feature Type Filter Chips

Independent of S1/S2. Can be built in parallel once S1a lands, but should be
tested after — the chips affect what annotation arrows are rendered, which must
not break selection or HUD state.

### S3a — Filter state ✅ TODO
Add `hiddenTypes: Set<string>` state to `SeqView`. Derive `visibleFeatures` from
`doc.features` by filtering out hidden types before passing to `buildLineLayouts`.

- State lives in `SeqView` (not global — filter is a view concern)
- Default: all types visible

**Acceptance:** toggling a type clears its arrows from the sequence view without
affecting other views (CircMap, FeatureTable, GenomeMap unaffected).

### S3b — Chip bar UI ✅ TODO
A compact row of toggleable chips above the sequence panel, below the search bar
in the layout hierarchy.

Pre-seeded chip set (in order):
1. CDS
2. AMR
3. IS element
4. oriT / oriV
5. misc\_feature

- Chip appearance: filled when visible, outlined when hidden
- Use feature colors from the document where possible (first feature of that type)
- Show feature count per type in parentheses: `CDS (12)`

**Acceptance:** open `Ecoli_NIST0056.gbk`. Toggle CDS off → all CDS arrows
disappear from SeqView. Toggle back on → arrows return. Other panels unchanged.

### S3c — Auto-populate chip set from document ✅ TODO
Rather than a hardcoded list, derive the chip set from the types actually present
in `doc.features`, with the pre-seeded types (S3b) appearing first if present.

- Compute `typeOrder`: pre-seeded types first, then remaining types alphabetically
- Cap display at 10 chips; show `+N more` button that expands if needed

**Acceptance:** open `pSB1C3.gb` (has: CDS, promoter, RBS, terminator, rep\_origin,
misc\_feature) — all 6 types appear as chips. None of the pre-seeded types that
are absent from the file appear.

---

## Group S4 — Jump & Navigation

Improves the existing scroll-to behavior. SeqView already scrolls to a feature
when selected via the table or map — these steps make that behavior more precise
and add manual navigation.

### S4a — Center-on-feature scroll ✅ TODO
Currently `scrollToItem(lineNum, 'center')` scrolls to the first line of a feature.
For multi-line features, the feature start is correct but the context is poor.

- Scroll to the line containing `selection.start`, aligned `'start'` with a small
  top offset so the line isn't flush against the panel edge
- If the feature spans more lines than fit in the viewport, scroll to start of feature

**Acceptance:** click a long feature (e.g., a CDS spanning 10+ lines) in the table
→ SeqView scrolls so the feature start is near the top of the visible area, not
off-screen or clipped at the bottom.

### S4b — Jump to coordinate input ✅ TODO
A small input in the chip bar row (right-aligned): `Go to bp:` with a number field.
On Enter, scrolls SeqView to that 1-based coordinate.

- Validate: clamp to `[1, doc.bases.length]`
- On valid input: convert to 0-based, compute line index, scroll to it

**Acceptance:** type `2500000` in `Ecoli_NIST0056.gbk` → SeqView scrolls to the
correct region. Out-of-range input is silently clamped, not an error.

---

## Recommended order

```
S1a → S1b → S1c    (HUD scaffold first, then stats)
S2a → S2b          (copy builds on HUD)
S3a → S3b → S3c    (filter chips — independent, do after S1 is stable)
S4a → S4b          (navigation polish — last, least risk)
```

---

## Test checklist (run before closing Phase S)

- [ ] `go test ./bio/... ./app/...` — all pass
- [ ] `go vet ./...` — clean
- [ ] `go build ./...` — clean
- [ ] HUD shows correct length, GC%, Tm for a known selection in `pSB1C3.gb`
- [ ] Copy FASTA pastes correctly into a text editor
- [ ] Copy RC matches expected reverse complement
- [ ] CDS chip toggle hides/shows CDS arrows without affecting other panels
- [ ] `Ecoli_NIST0056.gbk` chip set auto-populates from document types
- [ ] Jump to coordinate works at both ends and mid-genome
- [ ] No console errors during normal interaction
- [ ] `./build/dev.sh` succeeds from a clean working directory
