# Micromium — Burndown Plan (Post-Migration)

Steps 1–6 of the Electron migration are complete.
This document tracks everything remaining.

---

## Group A — CircMap Quick Wins

Small, independent improvements. Do these first — high visual impact, low risk.

### A1 — Center label ✅ DONE
Display plasmid name + bp + topology in the center of the circle.
- `ctx.fillText(doc.name, cx, cy - 10)`
- `ctx.fillText(`${doc.length.toLocaleString()} bp · ${doc.topology}`, cx, cy + 10)`
- Font: system-ui, two sizes (name bold ~13px, stats ~11px gray)

### A2 — Backbone tick marks ✅ DONE
Radial tick marks around the ring at every N bp, with position labels.
- Tick interval: auto-scale (e.g. every 500 bp for <5 kb, every 1000 bp for larger)
- Short inward tick line + label just outside
- Matches the ApE clock-face convention

### A3 — Hover tooltip ✅ DONE
Show feature name + coords on mouseover (no click required).
- `onMouseMove` handler — same angle math as click handler
- Overlay `<div>` positioned near cursor with feature label, start–end, type
- Disappears when cursor leaves the arc ring

---

## Group B — Step 7 Cleanup

Step 7 IPC wiring is done. One task remains:

### B1 — No-document splash screen ✅ DONE
When no file is loaded on launch, show a centered prompt instead of "No document open."
- Large "Open a plasmid file to begin" message
- Prominent "Open file…" button wired to `handleOpen`
- Replaces the three separate "No document open." placeholders in App.tsx

---

## Group C — Step 8 Packaging

### C1 — Add electron-builder ✅ DONE
- `npm install --save-dev electron-builder`
- `package.json` build config:
  - `appId`: `io.github.weackerm.micromium`
  - `productName`: `Micromium`
  - `extraResources`: bundles `../micromiumserver` binary
  - Linux target: `AppImage`

### C2 — Create `build/build.sh` ✅ DONE
```bash
go build -o micromiumserver ./cmd/micromium/
cd frontend && npm ci && npm run build && npm run electron:build
```
Output: `frontend/dist-electron/`

### C3 — Update `electron/main.ts` production path ✅ DONE (was already correct)
- `app.isPackaged` → `path.join(process.resourcesPath, 'micromiumserver')`
- Already stubbed: `getBinaryPath()` has the right logic, just needs smoke test

### C4 — Smoke test AppImage ✅ TODO
- `./build/build.sh`
- Run AppImage, open `pSB1C3.gb`, verify all three views
- Cold start with no args: splash appears
- Cold start with `--file`: loads immediately

---

## Group D — CircMap Polish (post-packaging)

These are more involved. Do after the AppImage milestone.

### D1 — Label leader lines ✅ DONE
Thin line from arc midpoint → label. Prevents floating ambiguity.
- Draw after `putImageData`, before `fillText`
- Elbow line: arc edge → radial point → label

### D2 — Label collision avoidance ✅ DONE
Labels can overlap on crowded maps (e.g. pSB1C3 has 9 features).
- 6-iteration angular push-apart with `norm()` angle normalization
- Minimum arc gap computed from rendered pixel widths

### D3 — Dual-ring rendering ✅ DONE
Forward features on outer ring, reverse features on inner ring.
Matches ApE/SnapGene convention more closely.
- `fwdR = radius + RING_SEP`, `revR = radius - RING_SEP`
- Separate `fwdCov`/`revCov` coverage arrays
- Backbone stays at center radius

---

## Recommended Order

```
A1 → A2 → A3   (CircMap quick wins — do these now)
B1              (splash screen — 30 min)
C1 → C2 → C3 → C4   (packaging milestone)
D1 → D2 → D3   (CircMap polish — after AppImage works)
```

---

## Migration Complete Checklist (from MIGRATION.md)

- [ ] `go test ./bio/... ./app/...` — all pass
- [ ] `go vet ./...` — clean
- [ ] `go build ./...` — no CGO, no Fyne
- [ ] `go mod tidy` — no unused dependencies
- [ ] Three-way cross-highlight works: circmap ↔ seqview ↔ featuretable
- [ ] Feature labels visible on circle map
- [ ] Position ruler visible in seqview, correctly aligned
- [ ] Native file dialog works on Linux
- [ ] Cold start with no `--file` arg: open prompt appears
- [ ] Cold start with `--file testdata/pSB1C3.gb`: loads immediately
- [ ] `./build/build.sh` produces a distributable AppImage
- [ ] AppImage cold start works
