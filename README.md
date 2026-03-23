# Micromium

A plasmid and genome viewer for GenBank files. Micromium is a Go reimplementation of the core
[ApE (A Plasmid Editor)](https://jorgensen.biology.utah.edu/wayned/ape/) experience,
with a native desktop UI via Electron.

> **Alpha software.** Core viewing works. Editing, saving, and packaging are not yet complete.
> Linux only at this stage.

---

## What it does

- Opens GenBank (`.gb`, `.gbk`) and FASTA files via native file dialog
- **Plasmid mode** (< 50 kb): circular map with feature arcs, tooltips, tick marks
- **Genome mode** (≥ 50 kb): interactive CGView.js viewer with zoom, rotate, linear/circular toggle
- Sortable feature table with cross-highlighting between views
- Sequence panel (plasmid mode)

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Go | 1.22+ | `go version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |

---

## Quick start

```bash
git clone git@github.com:RENAISSANCE-UIC/micromium.git
cd micromium
./build/dev.sh
```

That's it. `dev.sh` installs Node deps, builds the frontend, compiles the Go server, and launches Electron.

> **Note:** On most Linux systems Electron requires `--no-sandbox`. This flag is already set in `dev.sh`.
> If you get a sandbox error, make sure you're running `./build/dev.sh` rather than invoking Electron directly.

---

## Test files

Two plasmid files and one genome file are included in `testdata/`:

| File | Size | Mode |
|------|------|------|
| `pSB1C3.gb` | 2,070 bp | Plasmid (circular map) |
| `pSB1C3_I0500_LasI.gb` | ~5 kb | Plasmid (circular map) |
| `Ecoli_NIST0056.gbk` | 5.3 Mbp, 4,560 features | Genome (CGView) |

Open any of them via **File → Open** in the app, or drag-and-drop (plasmid files only).

---

## What to try

- Open `pSB1C3.gb` and hover over feature arcs — tooltip shows label, coords, type
- Click a feature arc → the feature table highlights the same row
- Click a row in the feature table → the circular map highlights the arc
- Open `Ecoli_NIST0056.gbk` → genome mode loads with CGView; zoom and rotate work
- Click a CDS arc in genome mode → feature table cross-highlights

---

## Known limitations (alpha)

- **Read-only.** No saving, no feature editing, no copy/paste yet.
- **Linux only.** macOS and Windows builds are not configured yet.
- The packaged AppImage (Step C4) has not been smoke-tested — run from source for now.
- Sequence panel is blank in genome mode (bases are omitted for large files by design).

---

## Project layout

```
bio/            Pure domain logic (sequence, features, GenBank parser)
app/            Application state + event bus
server/         HTTP + WebSocket API
frontend/       Electron + React + TypeScript
cmd/micromium/  Go entry point
testdata/       Sample GenBank files
build/          dev.sh and build.sh scripts
```

---

## Feedback

File issues or ping the author directly. This is pre-release — rough edges are expected.
