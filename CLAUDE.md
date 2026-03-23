# Micromium — Developer & AI Handoff Document

## What This Is

A Go reimplementation of the ApE plasmid editor (Wayne Davis, Utah).
See BLUEPRINT.md for the full design contract.

## Current Status

**Phase 0 (Electron Migration): Steps 1–6 COMPLETE.**
Fyne and CGO are gone. The binary is pure Go. Electron is the sole UI.
Steps 7 (native file dialog) and 8 (packaging) remain.

**Phase G (Genome Mode): Steps G1–G7 COMPLETE.**
Micromium now opens microbial-scale GenBank files (1–10 Mbp) in addition to plasmids.
Auto-detection by sequence length: < 50 kb → plasmid mode (CircMap), ≥ 50 kb → genome mode (GenomeMap/CGView.js).

The `bio/` and `app/` packages are untouched throughout this migration.

---

## Build

```bash
# One-time setup
cd frontend && npm install && cd ..

# Development — builds frontend then Go (go:embed requires dist/ first), launches Electron
./build/dev.sh

# Production build (electron-builder, Step 8)
./build/build.sh
```

**Important:** `go build` must be run *after* `npm run build` because
`frontend/embed.go` embeds `frontend/dist/` at compile time via `go:embed`.
`build/dev.sh` handles this in the correct order.

**Linux sandbox:** Electron requires `--no-sandbox` on systems where
`chrome-sandbox` is not SUID-configured. Already set in `dev.sh` and `package.json`.

---

## Architecture

### Dependency direction (enforced, nothing flows upstream)

```
bio  ←  app  ←  server  ←  (Electron renderer via HTTP/WS)
                    ↑
               frontend/embed.go (go:embed dist/)
```

### Package responsibilities

```
bio/        Pure domain logic. Zero UI imports. Standard library only.
app/        Application state + event bus. Zero UI imports.
server/     HTTP + WebSocket API. Imports app and bio only.
frontend/   Electron + React + TypeScript + embed.go (go:embed dist/).
cmd/micromium/  Entry point. Embeds frontend, starts server, prints PORT=, blocks.
```

---

## What Is Implemented

### bio/ (COMPLETE — do not change)
- `sequence.go` — Sequence type, Subsequence with circular wraparound
- `feature.go` — Feature, FeatureType, Span, Direction, color helpers
- `genbank.go` — Full GenBank/ApE parser (LOCUS, FEATURES, ORIGIN)
  - Handles: complement(), join(), multi-line locations, multi-line qualifiers
  - ApE qualifiers: /ApEinfo_fwdcolor, /ApEinfo_revcolor, /ApEinfo_label
  - Graceful recovery: raw sequence data without ORIGIN header
- `fasta.go` — ParseFASTA, WriteFASTA

### app/ (COMPLETE — do not change)
- `document.go` — Document struct, FeatureByID
- `events.go` — Bus (subscribe/publish), SelectionEvent, source constants

### server/ (COMPLETE)
- `json.go` — DocumentDTO, FeatureDTO, SpanDTO, SelectionDTO, helpers
  - `GenomeThreshold = 50_000` — sequences ≥ this get `mode:"genome"`, `bases:""` omitted
  - `DocumentDTO.Mode` — `"plasmid"` | `"genome"` (drives frontend renderer selection)
- `server.go` — HTTP mux, ServeFS (go:embed), ServeStatic (dev fallback), port binding
- `handlers.go` — REST handlers: GET /api/document, POST /api/document/open
- `ws.go` — WebSocket hub (broadcasts SelectionDTO to all clients except sender)

### frontend/ (COMPLETE — Steps 2–5, G1–G6)
- `embed.go` — `//go:embed dist` → exports `FS() (fs.FS, error)`
- `electron/main.ts` — Spawns Go server, reads PORT=, opens BrowserWindow
- `electron/preload.ts` — contextBridge: openFile() for native file dialog
- `src/types.ts` — TypeScript interfaces mirroring server/json.go
- `src/api.ts` — fetch() wrappers for REST
- `src/ws.ts` — WebSocket client + reconnect (exponential backoff)
- `src/hooks/useSelection.ts` — Selection state via WebSocket, source-filtered
- `src/components/CircMap.tsx` — Canvas2D pixel-loop, responsive (ResizeObserver). Plasmid mode only.
- `src/components/SeqView.tsx` — react-window v1 FixedSizeList, 60bp/line. Blank in genome mode (bases omitted).
- `src/components/FeatureTable.tsx` — Sortable feature list, cross-highlight
- `src/components/GenomeMap.tsx` — CGView.js viewer for genome-mode files. Genome mode only.
  - Post-loadJSON fixes: arrowHeadLength, ruler padding, legend arrow decoration, track thicknessRatio
  - Hover tooltip (label, type, position, strand)
  - Controls toolbar: zoom, rotate, reset, circular↔linear toggle, PNG download
  - Cross-highlight: click → `publish(SelectionDTO)`; receive → `viewer.zoomTo(midBp)`
- `src/lib/cgviewJson.ts` — Converts DocumentDTO → CGView JSON payload (port of micromicon R builder)
- `src/vendor/cgview.d.ts` — Ambient TypeScript declarations for CGView global
- `public/vendor/cgview.min.js` — CGView.js v1.8.0 (Jason R. Grant). NOT on npm — vendored from micromicon.
- `public/vendor/cgview.css` — CGView stylesheet
- `public/vendor/d3.min.js` — D3 v7.9.0 (CGView dependency)

### cmd/micromium/
- `main.go` — Pure Go entry point. No Fyne, no CGO.
  Embeds frontend via `frontend.FS()`, binds `localhost:0`, prints `PORT=<n>`.

### testdata/
- `pSB1C3.gb` — iGEM BioBrick backbone, 2070 bp, 9 features, primary test case
- `pSB1C3_I0500_LasI.gb` — secondary test case
- `Ecoli_NIST0056.gbk` — *E. coli* NIST 0056, 5,325,970 bp, 4,560 features, genome mode test case

---

## Wire Protocol Summary

Go backend binds to `localhost:0` (OS picks port), prints `PORT=<n>` to stdout.
Electron reads it, opens `BrowserWindow → http://localhost:PORT`.
`window.__MICROMIUM_PORT__` is injected into index.html for browser-only testing.

**REST:** All under `/api/`
- `GET /api/document` → DocumentDTO (or 204 if no document loaded)
- `POST /api/document/open` body `{"path":"..."}` → DocumentDTO
- `POST /api/document/save`, `POST/PUT/DELETE /api/features/*` → 501 (Phase 2)

**WebSocket `/ws`:**
- SelectionDTO: `{start, end, featureId, source}`
- Hub broadcasts to all clients except sender (mirrors app.Bus logic)
- Source values: `"circmap"` | `"seqview"` | `"featuretable"` | `"genomemap"`

---

## Testing

```bash
# Pure unit tests — always green, no display needed
go test ./bio/... ./app/...
go vet ./...

# Build check
go build ./...

# API smoke test (while Go server is running)
curl http://localhost:PORT/api/document | jq .name

# Genome mode: open Ecoli_NIST0056.gbk, verify mode=genome, bases empty, 4560 features
curl -X POST http://localhost:PORT/api/document/open \
  -H 'Content-Type: application/json' \
  -d '{"path":"testdata/Ecoli_NIST0056.gbk"}' | jq '{mode,length,feature_count: (.features|length)}'

# Integration: open pSB1C3.gb, click a feature, verify all three views highlight
# Integration: open Ecoli_NIST0056.gbk, click a CDS arc, verify FeatureTable highlights
```

Round-trip test (parse → WriteGenBank → parse → compare) is the
correctness gold standard for GenBank fidelity. Not yet written.
