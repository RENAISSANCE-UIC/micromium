import { useRef, useEffect, useMemo, useCallback, useState } from 'react'
import { useSelection } from '../hooks/useSelection'
import { featureExternalLinks, openExternalLink } from '../externalLinks'
import type { DocumentDTO, FeatureDTO } from '../types'

function useContainerSize(ref: React.RefObject<HTMLDivElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 })
  useEffect(() => {
    if (!ref.current) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setSize({ width, height })
    })
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [ref])
  return size
}

// Rendering constants
const BACKBONE_HALF_W = 2.5
const ARC_HALF_W      = 7.0
const RING_SEP        = 10    // px — fwd/rev rings are ±RING_SEP from backbone
const LABEL_GAP       = 12    // px — space between fwd arc outer edge and label
const CLICK_TOLERANCE = 22    // px — click zone around each ring
const MIN_LABEL_BP    = 30    // skip labels on features narrower than this
const TICK_LEN        = 6     // px — inward tick length from backbone
const TICK_LABEL_R    = 18    // px — tick label distance inside backbone
const LABEL_PAD       = 6     // px — minimum gap between adjacent labels

function tickInterval(total: number): number {
  if (total <  1000) return  100
  if (total <  2000) return  200
  if (total <  5000) return  500
  if (total < 10000) return 1000
  if (total < 50000) return 5000
  return 10000
}

// 0 bp = 12 o'clock, clockwise
function bpToAngle(bp: number, total: number): number {
  return (90.0 - 360.0 * bp / total) * Math.PI / 180.0
}

function parseHex(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]
}

interface TooltipState { x: number; y: number; feat: FeatureDTO }

interface CircMapProps { doc: DocumentDTO; dark?: boolean }

export function CircMap({ doc, dark = false }: CircMapProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const { selection, publish } = useSelection('circmap')
  const { width: cw, height: ch } = useContainerSize(containerRef)
  const canvasSize = Math.max(100, Math.min(cw, ch))
  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // D3: separate coverage arrays for forward and reverse strands
  const { fwdCov, revCov } = useMemo(() => {
    const fwdCov = new Int32Array(doc.length).fill(-1)
    const revCov = new Int32Array(doc.length).fill(-1)
    doc.features.forEach((feat, fi) => {
      if (feat.type === 'source') return
      const isForward = feat.direction !== 'reverse'
      feat.spans.forEach(span => {
        const s = Math.max(0, span.start)
        const e = Math.min(doc.length, span.end)
        for (let i = s; i < e; i++) {
          if (isForward) fwdCov[i] = fi
          else           revCov[i] = fi
        }
      })
    })
    return { fwdCov, revCov }
  }, [doc])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || canvasSize === 0) return
    const ctx = canvas.getContext('2d')!
    const cv = dark
      ? { bg: '#222222', text: '#e0e0e0', text2: '#888888', tick: '#555555', lbl: '#666666', lead: '#444444' }
      : { bg: '#f5f5f5', text: '#1a1a1a', text2: '#888888', tick: '#bbbbbb', lbl: '#aaaaaa', lead: '#cccccc' }
    const w = canvas.width
    const h = canvas.height

    ctx.clearRect(0, 0, w, h)
    if (doc.length === 0) return

    const total  = doc.length
    const cx     = w / 2
    const cy     = h / 2
    const radius = Math.min(cx, cy) * 0.62
    const fwdR   = radius + RING_SEP   // outer ring — forward features
    const revR   = radius - RING_SEP   // inner ring — reverse features
    const labelR = fwdR + ARC_HALF_W + LABEL_GAP  // where labels are placed

    // --- Pixel loop (D3: dual ring) ---
    const imageData = ctx.createImageData(w, h)
    const pix = imageData.data

    for (let py = 0; py < h; py++) {
      for (let px = 0; px < w; px++) {
        const dx = px - cx
        const dy = py - cy
        const r  = Math.sqrt(dx * dx + dy * dy)

        const onFwdArc  = Math.abs(r - fwdR)   <= ARC_HALF_W
        const onRevArc  = Math.abs(r - revR)   <= ARC_HALF_W
        const onBackbone = Math.abs(r - radius) <= BACKBONE_HALF_W
        if (!onFwdArc && !onRevArc && !onBackbone) continue

        let angle = Math.atan2(-dy, dx)
        if (angle < 0) angle += 2 * Math.PI
        let bp = Math.floor(((Math.PI / 2 - angle) * total) / (2 * Math.PI))
        bp = ((bp % total) + total) % total

        const idx = (py * w + px) * 4
        const inSel = selection && selection.start >= 0 && bp >= selection.start && bp < selection.end

        if (inSel) {
          pix[idx] = 0xFF; pix[idx+1] = 0xCC; pix[idx+2] = 0x00; pix[idx+3] = 0xFF
        } else if (onFwdArc && fwdCov[bp] >= 0) {
          const [r2,g2,b2] = parseHex(doc.features[fwdCov[bp]].fwdColor)
          pix[idx] = r2; pix[idx+1] = g2; pix[idx+2] = b2; pix[idx+3] = 0xFF
        } else if (onRevArc && revCov[bp] >= 0) {
          const [r2,g2,b2] = parseHex(doc.features[revCov[bp]].revColor)
          pix[idx] = r2; pix[idx+1] = g2; pix[idx+2] = b2; pix[idx+3] = 0xFF
        } else if (onBackbone) {
          pix[idx] = 0x88; pix[idx+1] = 0x88; pix[idx+2] = 0x88; pix[idx+3] = 0xFF
        }
      }
    }
    ctx.putImageData(imageData, 0, 0)

    // --- Tick marks ---
    const interval = tickInterval(total)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let bp = interval; bp < total; bp += interval) {
      const a   = bpToAngle(bp, total)
      const cos = Math.cos(a), sin = Math.sin(a)
      ctx.strokeStyle = cv.tick
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx + (radius - TICK_LEN) * cos, cy - (radius - TICK_LEN) * sin)
      ctx.lineTo(cx + radius * cos,               cy - radius * sin)
      ctx.stroke()
      ctx.font = '9px system-ui, sans-serif'
      ctx.fillStyle = cv.lbl
      ctx.fillText(String(bp), cx + (radius - TICK_LABEL_R) * cos, cy - (radius - TICK_LABEL_R) * sin)
    }

    // --- Build label list ---
    ctx.font = 'bold 11px system-ui, sans-serif'

    interface LabelItem {
      feat:          FeatureDTO
      isForward:     boolean
      origAngle:     number  // angle of feature midpoint
      angle:         number  // adjusted by collision avoidance
      text:          string
      halfW:         number  // half rendered pixel width
    }

    const items: LabelItem[] = []
    doc.features.forEach(feat => {
      if (feat.type === 'source' || feat.spans.length === 0) return
      const start = feat.spans[0].start
      const end   = feat.spans[feat.spans.length - 1].end
      if (end - start < MIN_LABEL_BP) return
      const mid  = Math.floor((start + end) / 2)
      const a    = bpToAngle(mid, total)
      const text = feat.label.length > 14 ? feat.label.slice(0, 13) + '…' : feat.label
      const halfW = ctx.measureText(text).width / 2 + 2
      items.push({ feat, isForward: feat.direction !== 'reverse', origAngle: a, angle: a, text, halfW })
    })

    // D2: iterative angular push-apart
    const norm = (a: number) => { while (a < 0) a += 2*Math.PI; while (a >= 2*Math.PI) a -= 2*Math.PI; return a }
    for (let iter = 0; iter < 6; iter++) {
      items.sort((a, b) => norm(a.angle) - norm(b.angle))
      for (let i = 0; i < items.length; i++) {
        const a = items[i]
        const b = items[(i + 1) % items.length]
        const minArc = (a.halfW + b.halfW + LABEL_PAD) / labelR  // min angular gap
        let diff = norm(b.angle) - norm(a.angle)
        if (diff > Math.PI) diff -= 2 * Math.PI  // take shorter arc
        if (diff < 0) diff += 2 * Math.PI
        if (diff < minArc) {
          const push = (minArc - diff) / 2
          a.angle = norm(a.angle - push)
          b.angle = norm(b.angle + push)
        }
      }
    }

    // D1 + draw labels
    items.forEach(item => {
      const { feat, isForward, origAngle, angle, text } = item

      // Leader line: from arc edge → label
      const arcEdgeR = isForward ? fwdR + ARC_HALF_W : revR - ARC_HALF_W
      const arcX = cx + arcEdgeR * Math.cos(origAngle)
      const arcY = cy - arcEdgeR * Math.sin(origAngle)
      const lx   = cx + labelR * Math.cos(angle)
      const ly   = cy - labelR * Math.sin(angle)

      ctx.strokeStyle = cv.lead
      ctx.lineWidth   = 0.8
      ctx.beginPath()
      ctx.moveTo(arcX, arcY)
      // Elbow: go radially to labelR, then angularly to final position
      const elbowX = cx + (labelR - 4) * Math.cos(origAngle)
      const elbowY = cy - (labelR - 4) * Math.sin(origAngle)
      ctx.lineTo(elbowX, elbowY)
      ctx.lineTo(lx, ly)
      ctx.stroke()

      // Label
      ctx.font = 'bold 11px system-ui, sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.strokeStyle = cv.bg
      ctx.lineWidth = 3
      ctx.strokeText(text, lx, ly)
      ctx.fillStyle = cv.text
      ctx.fillText(text, lx, ly)
    })

    // --- Center label (A1) ---
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const nameLabel = doc.name.length > 18 ? doc.name.slice(0, 17) + '…' : doc.name
    ctx.font = 'bold 13px system-ui, sans-serif'
    ctx.fillStyle = cv.text
    ctx.fillText(nameLabel, cx, cy - 9)
    ctx.font = '11px system-ui, sans-serif'
    ctx.fillStyle = cv.text2
    ctx.fillText(`${doc.length.toLocaleString()} bp · ${doc.topology}`, cx, cy + 9)

  }, [doc, fwdCov, revCov, selection, canvasSize, dark])

  // D3: hover checks both rings
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const px = (e.clientX - rect.left) * scaleX
    const py = (e.clientY - rect.top) * scaleY
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const dx = px - cx, dy = py - cy
    const r  = Math.sqrt(dx * dx + dy * dy)
    const radius = Math.min(cx, cy) * 0.62
    const fwdR   = radius + RING_SEP
    const revR   = radius - RING_SEP

    const onFwd = Math.abs(r - fwdR) <= CLICK_TOLERANCE
    const onRev = Math.abs(r - revR) <= CLICK_TOLERANCE
    if (!onFwd && !onRev) { setTooltip(null); return }

    let angle = Math.atan2(-dy, dx)
    if (angle < 0) angle += 2 * Math.PI
    let bp = Math.floor(((Math.PI / 2 - angle) * doc.length) / (2 * Math.PI))
    bp = ((bp % doc.length) + doc.length) % doc.length

    const fi = onFwd ? fwdCov[bp] : revCov[bp]
    if (fi >= 0) {
      setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top, feat: doc.features[fi] })
    } else {
      setTooltip(null)
    }
  }, [doc, fwdCov, revCov])

  const handleMouseLeave = useCallback(() => {
    hideTimerRef.current = setTimeout(() => setTooltip(null), 200)
  }, [])

  const handleTooltipEnter = useCallback(() => {
    if (hideTimerRef.current) { clearTimeout(hideTimerRef.current); hideTimerRef.current = null }
  }, [])

  const handleTooltipLeave = useCallback(() => { setTooltip(null) }, [])

  // D3: click checks both rings
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const px = (e.clientX - rect.left) * scaleX
    const py = (e.clientY - rect.top) * scaleY
    const cx = canvas.width / 2
    const cy = canvas.height / 2
    const dx = px - cx, dy = py - cy
    const r  = Math.sqrt(dx * dx + dy * dy)
    const radius = Math.min(cx, cy) * 0.62
    const fwdR   = radius + RING_SEP
    const revR   = radius - RING_SEP

    const onFwd = Math.abs(r - fwdR) <= CLICK_TOLERANCE
    const onRev = Math.abs(r - revR) <= CLICK_TOLERANCE
    if (!onFwd && !onRev && Math.abs(r - radius) > CLICK_TOLERANCE) return

    let angle = Math.atan2(-dy, dx)
    if (angle < 0) angle += 2 * Math.PI
    let bp = Math.floor(((Math.PI / 2 - angle) * doc.length) / (2 * Math.PI))
    bp = ((bp % doc.length) + doc.length) % doc.length

    const fi = onFwd ? fwdCov[bp] : (onRev ? revCov[bp] : -1)
    if (fi >= 0) {
      const feat  = doc.features[fi]
      const start = feat.spans[0].start
      const end   = feat.spans[feat.spans.length - 1].end
      publish({ start, end, featureId: feat.id })
    } else {
      publish({ start: -1, end: -1, featureId: '' })
    }
  }, [doc, fwdCov, revCov, publish])

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', display: 'flex',
                                     alignItems: 'center', justifyContent: 'center',
                                     position: 'relative' }}>
      {canvasSize > 0 && (
        <canvas
          ref={canvasRef}
          width={canvasSize}
          height={canvasSize}
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          style={{ cursor: 'crosshair', background: 'var(--cv-bg)' }}
        />
      )}
      {tooltip && (
        <div
          onMouseEnter={handleTooltipEnter}
          onMouseLeave={handleTooltipLeave}
          style={{
            position: 'absolute',
            left: tooltip.x + 14,
            top:  tooltip.y - 10,
            background: 'var(--bg-hud)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: 12,
            fontFamily: 'system-ui, sans-serif',
            boxShadow: '0 2px 8px rgba(0,0,0,0.10)',
            color: 'var(--text)',
            whiteSpace: 'nowrap',
            zIndex: 10,
          }}
        >
          <div style={{ fontWeight: 600 }}>{tooltip.feat.label}</div>
          <div style={{ color: 'var(--text-2)', fontSize: 11 }}>
            {tooltip.feat.type} · {tooltip.feat.spans[0].start + 1}–{tooltip.feat.spans[tooltip.feat.spans.length - 1].end}
          </div>
          <TooltipLinks qualifiers={tooltip.feat.qualifiers} />
        </div>
      )}
    </div>
  )
}

function TooltipLinks({ qualifiers }: { qualifiers: FeatureDTO['qualifiers'] }) {
  const links = featureExternalLinks(qualifiers)
  if (links.length === 0) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, marginTop: 4 }}>
      {links.map(link => (
        <button
          key={link.url}
          title={link.url}
          onClick={() => openExternalLink(link.url)}
          style={{
            fontSize: 10, padding: '1px 5px', borderRadius: 3, cursor: 'pointer',
            border: '1px solid var(--btn-bd)', background: 'var(--btn-bg)',
            color: 'var(--text-2)', whiteSpace: 'nowrap', lineHeight: '16px',
          }}
        >
          {link.label}
        </button>
      ))}
    </div>
  )
}
