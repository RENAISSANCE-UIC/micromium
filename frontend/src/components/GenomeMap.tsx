import { useRef, useEffect } from 'react'
import { buildCGViewJSON } from '../lib/cgviewJson'
import { useSelection } from '../hooks/useSelection'
import type { DocumentDTO, FeatureDTO } from '../types'

// Post-load thicknessRatio overrides (port of micromicon/inst/htmlwidgets/cgview.js)
const TRACK_RATIOS: Record<string, number> = {
  CDS:      2.0,
  ncRNA:    0.75,
  Variants: 2.0,
}

// Arrow-decoration backstop — CGView 1.8 drives decoration via legend item
const ARROW_LEGEND_NAMES = new Set(['CDS', 'gene'])

interface GenomeMapProps { doc: DocumentDTO }

export function GenomeMap({ doc }: GenomeMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef    = useRef<CGView.Viewer | null>(null)
  const { selection, publish } = useSelection('genomemap')

  // ---- Build / rebuild the viewer when doc changes -------------------------
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    // Tear down previous instance
    el.innerHTML = ''
    viewerRef.current = null

    // Ensure element has an id (CGView.Viewer requires a CSS selector)
    if (!el.id) {
      el.id = 'cgv_' + Math.random().toString(36).slice(2, 9)
    }

    const w = el.offsetWidth  || 600
    const h = el.offsetHeight || 600

    let viewer: CGView.Viewer
    try {
      viewer = new CGView.Viewer('#' + el.id, { width: w, height: h })
    } catch (err) {
      el.innerHTML =
        '<div style="font:12px/1.6 monospace;color:#c0392b;padding:14px;">' +
        '<strong>CGView init error:</strong><br>' + String(err) + '</div>'
      console.error('[GenomeMap] init error:', err)
      return
    }

    // Load the CGView-native JSON payload
    const payload = buildCGViewJSON(doc)
    viewer.io.loadJSON(payload)

    // ---- Post-loadJSON JS fixes (mirrors micromicon cgview.js Plane C) ----

    // 1. arrowHeadLength backstop
    try { viewer.settings.arrowHeadLength = 0.3 } catch (_) { /* silent */ }

    // 2. Ruler: rulerPadding prevents inner ruler ring from going off-canvas.
    //    Do NOT set ruler.spacing to a bp value — it's a pixel gap.
    try {
      viewer.ruler.rulerPadding = 1
      viewer.ruler.tickLength   = 10
      viewer.ruler.tickWidth    = 2
    } catch (_) { /* silent */ }

    // 3. Arrow decoration backstop on CDS/gene legend items
    try {
      const items = viewer.legend.items()
      for (const item of items) {
        if (ARROW_LEGEND_NAMES.has(item.name)) item.decoration = 'arrow'
      }
    } catch (_) { /* silent */ }

    // 4. Per-track thicknessRatio
    try {
      for (const track of viewer.tracks()) {
        const ratio = TRACK_RATIOS[track.name]
        if (typeof ratio === 'number') track.thicknessRatio = ratio
      }
    } catch (_) { /* silent */ }

    viewer.draw()

    // ---- id → FeatureDTO (used by selection receive effect) ----------------
    const idMap = new Map<string, FeatureDTO>(doc.features.map(f => [f.id, f]))

    // ---- cgvName → FeatureDTO (used by click handler + tooltip) -----------
    // cgvName = feat.label || feat.id  (matches what cgviewJson.ts writes as "name")
    // First occurrence wins for duplicate labels (rare, but possible).
    const cgvNameMap = new Map<string, FeatureDTO>()
    for (const f of doc.features) {
      const n = f.label || f.id
      if (!cgvNameMap.has(n)) cgvNameMap.set(n, f)
    }

    // ---- Tooltip + controls -----------------------------------------------
    const tt = setupTooltip(el, viewer, payload, cgvNameMap)
    setupControls(el, viewer)

    // ---- Click → publish SelectionDTO -------------------------------------
    // CGView _createEvent payload: { elementType, element, bp, canvasX, canvasY, ... }
    // element.name = feat.label || feat.id (set in cgviewJson.ts)
    try {
      viewer.on('click', (e) => {
        tt.style.opacity = '0'  // always hide tooltip on click

        const ev = e as unknown as {
          elementType?: string
          element?: { name?: string; feature?: { name?: string }; bp?: number }
          bp?: number
        }

        // Resolve cgvName + clickedBp for both feature-arc and label clicks.
        // Label element: { feature: { name }, bp } — feature.name is the CGView name.
        let cgvName: string | undefined
        let clickedBp: number | undefined
        if (ev.elementType === 'feature' && ev.element?.name) {
          cgvName   = ev.element.name
          clickedBp = ev.bp
        } else if (ev.elementType === 'label') {
          cgvName   = ev.element?.feature?.name ?? ev.element?.name
          clickedBp = ev.element?.bp ?? ev.bp
        }

        if (cgvName) {
          // Prefer bp-match to disambiguate duplicate labels
          let feat: FeatureDTO | undefined
          if (clickedBp !== undefined) {
            const bp0 = clickedBp - 1  // CGView 1-indexed → 0-indexed
            feat = doc.features.find(f =>
              (f.label || f.id) === cgvName &&
              f.spans.some(s => s.start <= bp0 && bp0 < s.end)
            )
          }
          feat ??= cgvNameMap.get(cgvName)
          if (feat) {
            publish({
              start:     feat.spans[0].start,
              end:       feat.spans[feat.spans.length - 1].end,
              featureId: feat.id,
            })
            return
          }
        }
        // Click on empty space — clear selection
        publish({ start: -1, end: -1, featureId: '' })
      })
    } catch (e) {
      console.warn('[GenomeMap] could not attach click handler:', e)
    }

    viewerRef.current = viewer
  }, [doc, publish])

  // ---- Receive selection → zoom to feature ---------------------------------
  useEffect(() => {
    const cgv = viewerRef.current
    if (!cgv || !selection) return
    try {
      if (!selection.featureId) {
        cgv.reset()
        return
      }
      const midBp = Math.round((selection.start + selection.end) / 2) + 1  // CGView is 1-indexed
      const featLen = Math.max(selection.end - selection.start, 1)
      const contextWindow = Math.max(featLen * 20, 10_000)
      const zoom = Math.max(5, Math.min(doc.length / contextWindow, 500))
      cgv.zoomTo(midBp, zoom, { duration: 600 })
    } catch (_) { /* silent */ }
  }, [selection, doc.length])

  // ---- Resize via ResizeObserver -------------------------------------------
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      const cgv = viewerRef.current
      if (!cgv || width < 10 || height < 10) return
      // cgv.canvas.resize() updates canvas element dimensions but NOT .cgv-wrapper.
      // The wrapper has overflow:hidden at its original size, clipping the resized
      // canvas. Update it manually before resizing the canvas.
      const wrapper = el.querySelector('.cgv-wrapper') as HTMLElement | null
      if (wrapper) {
        wrapper.style.width  = width  + 'px'
        wrapper.style.height = height + 'px'
      }
      try { cgv.canvas.resize(width, height) } catch (_) {
        try { cgv.draw() } catch (_2) { /* silent */ }
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', background: '#fff' }}
    />
  )
}

// ============================================================================
// Hover tooltip — port of _setupTooltip() in micromicon/inst/htmlwidgets/cgview.js
// Returns the tooltip element so the click handler can hide it.
// ============================================================================

function setupTooltip(
  el: HTMLDivElement,
  viewer: CGView.Viewer,
  payload: object,
  cgvNameMap: Map<string, FeatureDTO>,
): HTMLDivElement {
  // Build CGView name → raw feature spec lookup (name = feat.label || feat.id)
  const rawLookup: Record<string, CGView.CGViewFeature> = {}
  const cgvData = (payload as Record<string, unknown>).cgview as Record<string, unknown> | undefined
  const rawFeats = cgvData?.features
  if (Array.isArray(rawFeats)) {
    for (const f of rawFeats as CGView.CGViewFeature[]) {
      if (f.name) rawLookup[f.name] = f
    }
  }

  const tt = document.createElement('div')
  tt.style.cssText = [
    'position:absolute',
    'background:rgba(18,18,38,0.92)',
    'color:#f0f0f0',
    'padding:5px 10px',
    'border-radius:4px',
    'font:14px/1.6 monospace',
    'pointer-events:none',
    'opacity:0',
    'transition:opacity 0.1s',
    'z-index:200',
    'max-width:280px',
    'white-space:pre',
  ].join(';')
  el.style.position = 'relative'
  el.appendChild(tt)

  const canvas = el.querySelector('canvas')

  function tooltipPos(e: CGView.EventData & { clientX?: number; clientY?: number }) {
    const er = el.getBoundingClientRect()
    const cr = canvas ? canvas.getBoundingClientRect() : er
    const cx = (e.canvasX !== undefined ? cr.left + e.canvasX : (e.clientX ?? 0)) - er.left + 14
    const cy = (e.canvasY !== undefined ? cr.top  + e.canvasY : (e.clientY ?? 0)) - er.top  - 10
    return { x: cx, y: cy }
  }

  try {
    viewer.on('mousemove', (e, data) => {
      const info = data ?? e
      const hovered: CGView.CGViewFeature[] | undefined =
        info?.features ??
        (info?.feature ? [info.feature] : undefined) ??
        (info?.nearestFeature ? [info.nearestFeature] : undefined)

      if (!hovered?.length) { tt.style.opacity = '0'; return }

      const f    = hovered[0]
      const spec = rawLookup[f.name] ?? {}

      // f.name is feat.label || feat.id — look up FeatureDTO for type/span info
      const dto  = cgvNameMap.get(f.name)
      const displayName = dto?.label || f.name

      const type = f.type  ?? (spec as CGView.CGViewFeature).type  ?? ''
      const s    = f.start ?? (spec as CGView.CGViewFeature).start ?? ''
      const e2   = f.stop  ?? (spec as CGView.CGViewFeature).stop  ?? ''
      const str  = (f.strand === -1 || f.strand === '-1' || f.strand === '-') ? '−' : '+'

      tt.innerHTML =
        '<strong>' + esc(displayName) + '</strong>' +
        (type ? '  <span style="color:#aaa">[' + esc(type) + ']</span>' : '') +
        '\n' + s + '..' + e2 + '  (' + str + ')'

      const p = tooltipPos(e as CGView.EventData & { clientX?: number; clientY?: number })
      tt.style.left    = p.x + 'px'
      tt.style.top     = p.y + 'px'
      tt.style.opacity = '1'
    })
  } catch (e) {
    console.warn('[GenomeMap] could not attach hover events:', e)
  }

  el.addEventListener('mouseleave', () => { tt.style.opacity = '0' })
  return tt
}

// ============================================================================
// Controls toolbar — port of _setupControls() in micromicon/inst/htmlwidgets/cgview.js
// ============================================================================

function setupControls(el: HTMLDivElement, viewer: CGView.Viewer) {
  const bar = document.createElement('div')
  bar.style.cssText = [
    'position:absolute',
    'top:10px',
    'left:10px',
    'display:flex',
    'flex-direction:column',
    'gap:3px',
    'z-index:100',
  ].join(';')

  const BTN_CSS = [
    'display:block',
    'width:34px',
    'height:34px',
    'border:none',
    'border-radius:5px',
    'background:rgba(30,30,50,0.78)',
    'color:#e8e8f0',
    'font:bold 16px/34px sans-serif',
    'text-align:center',
    'cursor:pointer',
    'padding:0',
    'user-select:none',
    'transition:background 0.12s',
  ].join(';')

  function makeBtn(label: string, tip: string, fn: () => void) {
    const b = document.createElement('button')
    b.textContent = label
    b.setAttribute('title', tip)
    b.style.cssText = BTN_CSS
    b.addEventListener('mouseenter', () => { b.style.background = 'rgba(30,30,50,0.97)' })
    b.addEventListener('mouseleave', () => { b.style.background = 'rgba(30,30,50,0.78)' })
    b.addEventListener('click', fn)
    return b
  }

  function spacer() {
    const d = document.createElement('div')
    d.style.height = '4px'
    return d
  }

  bar.appendChild(makeBtn('+',  'Zoom in',       () => { try { viewer.zoomIn()    } catch (_) {} }))
  bar.appendChild(makeBtn('−',  'Zoom out',      () => { try { viewer.zoomOut()   } catch (_) {} }))
  bar.appendChild(spacer())
  bar.appendChild(makeBtn('◄',  'Rotate left',   () => { try { viewer.moveLeft()  } catch (_) {} }))
  bar.appendChild(makeBtn('►',  'Rotate right',  () => { try { viewer.moveRight() } catch (_) {} }))
  bar.appendChild(spacer())
  bar.appendChild(makeBtn('↺',  'Reset view',    () => { try { viewer.reset()     } catch (_) {} }))

  // Format toggle (circular ↔ linear)
  let isCircular = viewer.format !== 'linear'
  const fmtBtn = makeBtn(
    isCircular ? '▬' : '◯',
    isCircular ? 'Switch to linear' : 'Switch to circular',
    () => {}
  )
  fmtBtn.addEventListener('click', () => {
    try {
      isCircular = viewer.format !== 'linear'
      viewer.settings.update({ format: isCircular ? 'linear' : 'circular' })
      viewer.draw()
      fmtBtn.textContent  = isCircular ? '◯' : '▬'
      fmtBtn.title        = isCircular ? 'Switch to circular' : 'Switch to linear'
      isCircular          = !isCircular
    } catch (_) {}
  })
  bar.appendChild(spacer())
  bar.appendChild(fmtBtn)
  bar.appendChild(spacer())

  // Download PNG
  bar.appendChild(makeBtn('⬇', 'Download PNG (3000 px)', () => {
    try {
      const outH = 3000
      const outW = Math.round(viewer.width / viewer.height * outH)
      viewer.io.downloadImage(outW, outH, 'cgview_map.png')
    } catch (e) {
      console.warn('[GenomeMap] download failed:', e)
    }
  }))

  el.appendChild(bar)
}

function esc(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
