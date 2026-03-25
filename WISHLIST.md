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

---

## Electron Desktop-Class Features

Micromium runs in Electron, which means it has access to OS-level APIs that a browser-based viewer cannot touch. The current IPC bridge is minimal — two handlers (`getPort`, `dialog:openFile`) — so there is a clean foundation to build on without unpicking anything.

### Multi-Window / Detachable Panes

Allow users to pop out the circular map or the sequence panel into a separate `BrowserWindow` on a second monitor, while the feature table stays on the primary screen.

- Both windows connect to the same Go backend WebSocket hub, so selection sync is automatic — clicking a feature in the detached map highlights the row in the table window with no extra work
- `ipcMain` can also relay `SelectionDTO` messages directly between renderer processes for sub-millisecond sync without a network round-trip
- `BrowserWindow` state (position, size, open/closed) persists via `electron-store` or a simple JSON file

### File System Watch / Auto-Reload

Own the file rather than just opening it once.

- Use Node's `fs.watch` (or the Go backend's `fsnotify`) to detect when the loaded `.gbk` is modified by an external tool
- On change, push an IPC notification to the renderer: "File changed on disk. Refresh?" — a single `ipcMain` push event + `ipcRenderer.on` handler
- Drag-and-drop: listen for `dragover` / `drop` on the renderer's splash screen; file path comes through `event.dataTransfer.files[0].path` in Electron (real path, unlike a browser sandbox)
- `app.addRecentDocument(path)` adds the file to the OS recent-documents list (right-click Taskbar/Dock icon on Windows and macOS)

### Native Menus & Keyboard Shortcuts

Replace web-style buttons with OS-native controls.

- `Menu.buildFromTemplate` constructs the top menu bar (File, View, Edit) — replaces the plain "Open file…" button for a professional feel
- `globalShortcut.register` for cross-window shortcuts: `Cmd/Ctrl+F` → focus motif search, `Cmd/Ctrl+G` → Go to position, `+`/`-` → zoom the map, `Cmd/Ctrl+D` → toggle dark mode
- Context menu on right-click of a feature arc or table row via `Menu.buildFromTemplate` + `menu.popup()`: "Copy protein sequence", "Copy FASTA", "Open in NCBI", "Export gene SVG"

### High-Resolution Export (Publication Quality)

- Render the circular map in a hidden offscreen `BrowserWindow` at 4000 × 4000 px, capture with `webContents.capturePage()`, and write to disk via `dialog.showSaveDialog`
- Prevents the pixelated-screenshot problem in papers and posters
- SVG export is an alternative path: serialize the canvas draw commands to SVG (a separate render pass) for infinitely scalable vector output
- `dialog.showSaveDialog` gives a native "Save As…" sheet rather than a browser download prompt

### Local Workspace Persistence (SQLite)

- Use a local SQLite database (via the Go backend, which already has a process) to store per-file workspaces: custom feature colours, notes, highlighted regions, last scroll position
- Each workspace keyed by file path + content hash so a moved file can still be matched
- Eliminates the "re-configure every time you open a genome" friction for power users

### Quick-Win Electron APIs

| Feature | API | Value |
|---------|-----|-------|
| OS dark mode sync | `nativeTheme.shouldUseDarkColors` + `nativeTheme.on('updated')` | Auto-match the viewer theme to the OS setting instead of requiring a manual toggle |
| System notifications | `new Notification(…)` | Alert when a long search or export finishes in the background |
| Global shortcuts | `globalShortcut` | Navigate without the window needing focus |
| Native save dialog | `dialog.showSaveDialog` | Professional "Save As…" for FASTA / SVG / PNG exports |
| App badge (macOS) | `app.dock.setBadge` | Show a count of open files or a "●" when a file has changed on disk |

---

## Common Prerequisite for External Links and Functional Filtering

`FeatureDTO` now carries `qualifiers: Record<string, string[]>` — added 2026-03-25.

**Known limitation:** `bio.Feature.Qualifiers` is `map[string]string`, so duplicate qualifier keys in the GenBank file (common with `/db_xref`, which often appears 2–3 times per CDS) only retain the last value. Each slice will have at most one entry per key until the GenBank parser is updated to accumulate duplicates. The parser fix should land before external links are built.
