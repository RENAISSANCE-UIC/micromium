# Micromium — Feature Wishlist

Features under consideration. Not yet scheduled or prioritised.

---

## External Links — Gene/Protein IDs → NCBI / UniProt

Surface clickable links in the feature table (and tooltips) for qualifier values already present in the GenBank file.

**ID types to support:**
- `/db_xref="GeneID:XXXXXX"` → `https://www.ncbi.nlm.nih.gov/gene/{id}`
- `/protein_id="NP_XXXXXX"` → `https://www.ncbi.nlm.nih.gov/protein/{id}`
- `/db_xref="UniProtKB/Swiss-Prot:XXXXX"` → `https://www.uniprot.org/uniprot/{id}`

**Notes:**
- In Electron: `shell.openExternal(url)` via IPC/preload to open the system browser
- In plain browser mode: `window.open(url, '_blank')`
- Requires qualifier data in `FeatureDTO` (see prerequisite below)

---

## Regex / Motif Search

A search bar that accepts a DNA pattern — literal sequence, IUPAC ambiguity codes, or full regex — and highlights all matching positions in the sequence panel and circular map.

**Details:**
- IUPAC ambiguity expansion: `R=[AG]`, `Y=[CT]`, `W=[AT]`, `S=[GC]`, etc.
- Plasmid mode: pure frontend (bases already in memory)
- Genome mode: server-side `GET /api/document/search?pattern=...` returns hit positions without sending the full sequence to the client
- Results rendered as an ephemeral synthetic feature layer, reusing the existing selection and highlight pipeline
- Circular wraparound handled by searching `bases + bases.slice(0, patternLen-1)` and modding positions back
- Restriction cut-position marking (e.g. EcoRI cuts between G and AATTC) is a natural follow-on but out of scope for v1

---

## Functional Filtering — Quick Filter by Product / COG Category

Preset filter pills or a dropdown that narrows the feature table and sequence view to a functional category, complementing the existing type-chip filter.

**Proposed categories:**
- Hypothetical protein
- Transporter / ABC transporter
- Kinase / Phosphatase
- Transcription factor / Regulator
- Membrane protein
- Mobile element / Transposon / IS element

**Details:**
- Each category backed by a keyword list matched against `/product` and `/note` qualifiers (free-text)
- COG IDs (`COG####`) in `/note` enable more reliable categorisation when present
- All logic client-side — no backend change beyond the qualifier prerequisite
- Filtering at the feature-ID level, compatible with the existing `hiddenTypes` type-chip mechanism

---

## Common Prerequisite for External Links and Functional Filtering

`FeatureDTO` now carries `qualifiers: Record<string, string[]>` — added 2026-03-25.

**Known limitation:** `bio.Feature.Qualifiers` is `map[string]string`, so duplicate qualifier keys in the GenBank file (common with `/db_xref`, which often appears 2–3 times per CDS) only retain the last value. Each slice will have at most one entry per key until the GenBank parser is updated to accumulate duplicates. The parser fix should land before external links are built.
