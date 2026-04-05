import { useRef, useEffect, useState, useCallback } from 'react'
import * as d3 from 'd3'
import { fetchTopology, fetchProtterSVG, type TopologyResult, type TopologySegment } from '../api'
import { featureExternalLinks, openExternalLink } from '../externalLinks'

// ── Node / link types for D3 simulation ──────────────────────────────────────

interface NodeDatum extends d3.SimulationNodeDatum {
  id: string
  label: string
  region: 'tm' | 'peri' | 'cyto'
  super: boolean
  idx: number
  aa?: string
  span?: string
  len?: number
  tmSegIdx?: number
  tmAnchorX?: number
  targetY?: number
}

interface LinkDatum extends d3.SimulationLinkDatum<NodeDatum> {}

// ── Residue color ─────────────────────────────────────────────────────────────

function beadColor(aa: string | undefined, region: string): string {
  if (aa === 'H') return '#f38ba8'
  if (aa === 'M') return '#a6e3a1'
  if (aa === 'C') return '#fab387'
  if (aa === 'R' || aa === 'K') return '#cba6f7'
  if (region === 'tm') return '#7c6fa0'
  return region === 'peri' ? '#4c9be8' : '#585b70'
}

// ── Graph construction ────────────────────────────────────────────────────────

function buildGraph(topo: TopologyResult, expanded: boolean): { nodes: NodeDatum[]; links: LinkDatum[] } {
  const nodes: NodeDatum[] = []
  let tmSegIdx = 0

  for (const seg of topo.segments) {
    if (seg.type === 'TM') {
      if (!expanded) {
        nodes.push({
          id: `TM_${seg.start}`,
          label: 'TM',
          span: `${seg.start}–${seg.end}`,
          region: 'tm',
          super: true,
          len: seg.end - seg.start + 1,
          idx: seg.start - 1,
          tmSegIdx,
        })
      } else {
        for (let i = seg.start - 1; i <= seg.end - 1; i++) {
          nodes.push({
            id: `aa_${i}`,
            label: topo.sequence[i] ?? '?',
            aa: topo.sequence[i],
            region: 'tm',
            super: false,
            idx: i,
            tmSegIdx,
          })
        }
      }
      tmSegIdx++
    } else {
      const region = seg.type as 'peri' | 'cyto'
      for (let i = seg.start - 1; i <= seg.end - 1; i++) {
        nodes.push({
          id: `aa_${i}`,
          label: topo.sequence[i] ?? '?',
          aa: topo.sequence[i],
          region,
          super: false,
          idx: i,
        })
      }
    }
  }

  nodes.sort((a, b) => a.idx - b.idx)
  const links: LinkDatum[] = []
  for (let i = 0; i < nodes.length - 1; i++) {
    links.push({ source: nodes[i].id, target: nodes[i + 1].id })
  }
  return { nodes, links }
}

// ── Seed positions (same serpentine layout as betaversium) ────────────────────

function seedPositions(
  nodes: NodeDatum[],
  topo: TopologyResult,
  W: number,
  H: number,
  MEM_TOP: number,
  MEM_BOT: number,
) {
  const MEM_MID = (MEM_TOP + MEM_BOT) / 2
  const MARGIN = 40
  const usableW = W - MARGIN * 2

  const tmSegs: TopologySegment[] = topo.segments.filter(s => s.type === 'TM')

  const gapLengths: number[] = []
  let gapAcc = 0
  for (const seg of topo.segments) {
    if (seg.type === 'TM') { gapLengths.push(gapAcc); gapAcc = 0 }
    else gapAcc += seg.end - seg.start + 1
  }
  gapLengths.push(gapAcc)
  const totalGap = gapLengths.reduce((a, b) => a + b, 0) || 1
  let cumGap = 0
  const tmAnchorX = tmSegs.map((_, k) => {
    cumGap += gapLengths[k]
    return MARGIN + (cumGap / totalGap) * usableW
  })

  // Pin TM nodes
  nodes.forEach(nd => {
    if (nd.region !== 'tm') return
    const ax = tmAnchorX[nd.tmSegIdx ?? 0] ?? W / 2
    nd.tmAnchorX = ax
    if (nd.super) {
      nd.x = ax; nd.y = MEM_MID; nd.fx = ax; nd.fy = MEM_MID
    } else {
      nd.x = ax + (Math.random() - 0.5) * 20
      nd.y = MEM_MID + (Math.random() - 0.5) * (MEM_BOT - MEM_TOP) * 0.7
    }
  })

  // Serpentine column layout for loop regions
  const ROW = 11
  for (let i = 0; i < nodes.length;) {
    if (nodes[i].region === 'tm') { i++; continue }
    let j = i
    while (j < nodes.length && nodes[j].region !== 'tm') j++

    const prevTM = [...nodes].slice(0, i).reverse().find(n => n.region === 'tm')
    const nextTM = nodes.slice(j).find(n => n.region === 'tm')
    const xL = prevTM ? (prevTM.tmAnchorX ?? MARGIN) : MARGIN
    const xR = nextTM ? (nextTM.tmAnchorX ?? MARGIN + usableW) : MARGIN + usableW
    const run = j - i
    const reg = nodes[i].region

    const availH = reg === 'peri' ? MEM_TOP - 16 : H - MEM_BOT - 16
    const rowsPerCol = Math.max(1, Math.floor(availH / ROW))
    const numCols = Math.max(1, Math.ceil(run / rowsPerCol))
    const COL = Math.max(9, (xR - xL) / (numCols + 1))
    const x0 = xL + COL

    for (let k = 0; k < run; k++) {
      const nd = nodes[i + k]
      const col = Math.floor(k / rowsPerCol)
      const posInCol = k % rowsPerCol
      const rowIdx = col % 2 === 0 ? posInCol : rowsPerCol - 1 - posInCol
      nd.x = x0 + col * COL
      nd.fx = nd.x
      nd.y = reg === 'peri' ? MEM_TOP - (rowIdx + 1) * ROW : MEM_BOT + (rowIdx + 1) * ROW
      nd.fy = nd.y
      nd.targetY = nd.y
    }
    i = j
  }
}

// ── Container size hook ───────────────────────────────────────────────────────


// ── TopologyViewer component ──────────────────────────────────────────────────

interface TopologyViewerProps {
  protein: string
  label?: string
  qualifiers?: Record<string, string[]>
}

export function TopologyViewer({ protein, label, qualifiers }: TopologyViewerProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  // Callback ref so ResizeObserver rewires correctly on every mount/unmount cycle
  // (switching Protter→D3 remounts this div; a plain useRef+useEffect misses the remount).
  const d3ContainerRef = useRef<HTMLDivElement | null>(null)
  const d3RoRef = useRef<ResizeObserver | null>(null)
  const [canvasW, setCanvasW] = useState(0)
  const [canvasH, setCanvasH] = useState(0)
  const d3ContainerCallbackRef = useCallback((node: HTMLDivElement | null) => {
    d3RoRef.current?.disconnect()
    d3RoRef.current = null
    d3ContainerRef.current = node
    if (!node) return
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect
      setCanvasW(width)
      setCanvasH(height)
    })
    ro.observe(node)
    d3RoRef.current = ro
  }, [])
  const simRef = useRef<d3.Simulation<NodeDatum, LinkDatum> | null>(null)

  const protterSvgRef = useRef<HTMLDivElement>(null)
  const pzRef = useRef({ scale: 1, tx: 0, ty: 0, dragging: false, startX: 0, startY: 0, startTx: 0, startTy: 0 })

  const [viewMode, setViewMode] = useState<'d3' | 'protter'>('d3')
  const [tmExpanded, setTmExpanded] = useState(false)
  const [topo, setTopo] = useState<TopologyResult | null>(null)
  const [topoError, setTopoError] = useState<string | null>(null)
  const [protter, setProtter] = useState<string | null>(null)
  const [protterLoading, setProtterLoading] = useState(false)
  const [protterError, setProtterError] = useState<string | null>(null)
  const [uniprotAcc, setUniprotAcc] = useState<string | null>(null)

  // Reset when protein changes
  useEffect(() => {
    setTopo(null); setTopoError(null)
    setProtter(null); setProtterLoading(false); setProtterError(null)
    setUniprotAcc(null); setTmExpanded(false)
    pzRef.current = { scale: 1, tx: 0, ty: 0, dragging: false, startX: 0, startY: 0, startTx: 0, startTy: 0 }
    if (protterSvgRef.current) protterSvgRef.current.style.transform = ''
  }, [protein])

  // Fetch topology prediction from Go backend
  useEffect(() => {
    if (!protein) return
    fetchTopology(protein)
      .then(setTopo)
      .catch(e => setTopoError(String(e)))
  }, [protein])

  // Resolve UniProt accession — qualifiers first, then REST search
  useEffect(() => {
    if (qualifiers) {
      const links = featureExternalLinks(qualifiers)
      const ul = links.find(l => l.label.startsWith('UniProt:'))
      if (ul) { setUniprotAcc(ul.label.slice('UniProt:'.length)); return }
    }
    if (!label) return
    const gene = label.split(/\s+/)[0]
    const query = `gene_exact:${gene}`
    fetch(
      `https://rest.uniprot.org/uniprotkb/search?query=${encodeURIComponent(query)}&format=json&fields=accession,sequence&size=10`
    )
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        const results: Array<{ primaryAccession: string; sequence?: { length: number } }> = data?.results ?? []
        if (!results.length) return
        const hit = results.find(r => r.sequence?.length === protein.length) ?? results[0]
        setUniprotAcc(hit.primaryAccession)
      })
      .catch(() => {})
  }, [protein, label, qualifiers])

  // Load Protter SVG when switching to Protter mode
  useEffect(() => {
    if (viewMode !== 'protter' || !protein || protter) return
    setProtterLoading(true); setProtterError(null)
    fetchProtterSVG(protein, label ?? 'protein')
      .then(svg => { setProtter(svg); setProtterLoading(false) })
      .catch(e => { setProtterError(String(e).replace(/^Error:\s*/, '')); setProtterLoading(false) })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, protein, label]) // `protter` intentionally omitted — cached after first load

  // D3 force simulation
  useEffect(() => {
    if (!topo || !svgRef.current || !d3ContainerRef.current || viewMode !== 'd3') return
    if (canvasW === 0 || canvasH === 0) return

    const W = canvasW, H = canvasH
    const MEM_TOP = H * 0.45, MEM_BOT = H * 0.55
    const MEM_MID = (MEM_TOP + MEM_BOT) / 2
    const R = 4.5, R_TM = 9

    const { nodes, links } = buildGraph(topo, tmExpanded)
    seedPositions(nodes, topo, W, H, MEM_TOP, MEM_BOT)

    if (simRef.current) simRef.current.stop()

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    svg.attr('viewBox', `0 0 ${W} ${H}`)

    // Membrane band
    svg.append('rect')
      .attr('x', 0).attr('y', MEM_TOP).attr('width', W).attr('height', MEM_BOT - MEM_TOP)
      .attr('fill', '#ffd9b3')
    ;[MEM_TOP, MEM_BOT].forEach(y =>
      svg.append('line')
        .attr('x1', 0).attr('y1', y).attr('x2', W).attr('y2', y)
        .attr('stroke', '#cc8800').attr('stroke-width', 1)
    )
    ;[['periplasm', MEM_TOP * 0.45] as const, ['membrane', MEM_MID] as const, ['cytoplasm', MEM_BOT + (H - MEM_BOT) * 0.55] as const].forEach(([lbl, y]) =>
      svg.append('text')
        .attr('x', W - 6).attr('y', y)
        .attr('text-anchor', 'end').attr('dominant-baseline', 'middle')
        .attr('font-size', 9).attr('fill', '#bbbbbb').attr('font-style', 'italic')
        .text(lbl)
    )

    // Sparkline (KD hydropathy profile)
    const SPARK_H = 32, SPARK_Y = H - SPARK_H - 6, SPARK_X = 8, SPARK_W = W * 0.27
    const xSc = d3.scaleLinear().domain([0, topo.profile.length - 1]).range([SPARK_X, SPARK_X + SPARK_W])
    const ySc = d3.scaleLinear()
      .domain([d3.min(topo.profile) ?? -5, d3.max(topo.profile) ?? 5])
      .range([SPARK_Y + SPARK_H, SPARK_Y])
    const sparkLine = d3.line<number>().x((_, i) => xSc(i)).y(d => ySc(d)).curve(d3.curveBasis)
    svg.append('path').attr('fill', 'none').attr('stroke', '#7b52ab').attr('stroke-width', 1.1).attr('opacity', 0.7).attr('d', sparkLine(topo.profile))
    const threshY = ySc(1.6)
    if (threshY >= SPARK_Y && threshY <= SPARK_Y + SPARK_H)
      svg.append('line')
        .attr('x1', SPARK_X).attr('y1', threshY).attr('x2', SPARK_X + SPARK_W).attr('y2', threshY)
        .attr('stroke', '#cc3366').attr('stroke-width', 0.8).attr('stroke-dasharray', '3,3').attr('opacity', 0.6)
    svg.append('text').attr('x', SPARK_X).attr('y', SPARK_Y - 2)
      .attr('font-size', 7).attr('fill', '#aaaaaa').text('KD profile')

    // Backbone links
    const linkSel = svg.append('g')
      .selectAll<SVGLineElement, LinkDatum>('line')
      .data(links).join('line')
      .attr('stroke', '#cccccc').attr('stroke-width', 1.5).attr('stroke-linecap', 'round').attr('fill', 'none')

    // Tooltip element (appended to the container div, not the SVG)
    const container = d3ContainerRef.current
    const tip = document.createElement('div')
    tip.style.cssText = 'position:absolute;background:#fff;color:#333;padding:3px 9px;border-radius:3px;font-size:10px;font-family:monospace;pointer-events:none;display:none;border:1px solid #ccc;z-index:20;box-shadow:0 1px 4px rgba(0,0,0,.15);white-space:nowrap'
    container.appendChild(tip)

    const isTMbd = (d: NodeDatum) => d.region === 'tm' && !d.super

    const nodeSel = svg.append('g')
      .selectAll<SVGGElement, NodeDatum>('g')
      .data(nodes, d => d.id).join('g')
      .on('mouseover', (_event: MouseEvent, d: NodeDatum) => {
        tip.textContent = d.super
          ? `TM  ${d.span}  (${d.len} aa)`
          : `${d.aa ?? '?'}${d.idx + 1}  ·  ${d.region}`
        tip.style.display = 'block'
      })
      .on('mousemove', (event: MouseEvent) => {
        const rect = container.getBoundingClientRect()
        tip.style.left = (event.clientX - rect.left + 12) + 'px'
        tip.style.top  = (event.clientY - rect.top  - 22) + 'px'
      })
      .on('mouseout', () => { tip.style.display = 'none' })
      .call(
        d3.drag<SVGGElement, NodeDatum>()
          .on('start', function(event, d) {
            if (!event.active) sim.alphaTarget(0.2).restart()
            d.fx = d.x; d.fy = d.y
          })
          .on('drag', function(event, d) { d.fx = event.x; d.fy = event.y })
          .on('end', function(event, d) {
            if (!event.active) sim.alphaTarget(0)
            d.fx = null
            if (d.region === 'tm') d.fy = MEM_MID; else d.fy = null
          })
      )

    nodeSel.append('circle')
      .attr('r', d => d.super ? R_TM : R)
      .attr('fill', d => d.super ? '#6e6a86' : beadColor(d.aa, d.region))
      .attr('stroke', '#444').attr('stroke-width', 0.7)
      .style('cursor', 'grab')

    nodeSel.each(function(d) {
      const g = d3.select(this)
      if (d.super) {
        g.append('text')
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .attr('font-family', 'Arial,sans-serif').attr('font-weight', 'bold')
          .attr('fill', '#fff').attr('font-size', 6).attr('y', -3)
          .attr('pointer-events', 'none').text(d.label)
        g.append('text')
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .attr('font-family', 'Arial,sans-serif').attr('font-weight', 'bold')
          .attr('fill', '#fff').attr('font-size', 4.5).attr('y', 4)
          .attr('pointer-events', 'none').text(d.span ?? '')
      } else {
        g.append('text')
          .attr('text-anchor', 'middle').attr('dominant-baseline', 'central')
          .attr('font-family', 'Arial,sans-serif').attr('font-weight', 'bold')
          .attr('fill', '#fff').attr('font-size', 6)
          .attr('pointer-events', 'none').text(d.label)
      }
    })

    const sim = d3.forceSimulation<NodeDatum, LinkDatum>(nodes)
      .force('link', d3.forceLink<NodeDatum, LinkDatum>(links).id(d => d.id)
        .distance(lnk => (isTMbd(lnk.source as NodeDatum) && isTMbd(lnk.target as NodeDatum)) ? 11 : 13)
        .strength(lnk => (isTMbd(lnk.source as NodeDatum) && isTMbd(lnk.target as NodeDatum)) ? 0.85 : 0.4))
      .force('collide', d3.forceCollide<NodeDatum>(d => (d.super ? R_TM : R) + 1).strength(0.65))
      .force('yHome', d3.forceY<NodeDatum>(d =>
        isTMbd(d) ? MEM_MID : (d.targetY ?? MEM_MID))
        .strength(d => d.super ? 0 : isTMbd(d) ? 0.5 : 0.25))
      .force('tmX', d3.forceX<NodeDatum>(d => d.tmAnchorX ?? W / 2)
        .strength(d => isTMbd(d) ? 0.3 : 0))
      .alphaDecay(0.025)
      .on('tick', () => {
        linkSel
          .attr('x1', d => (d.source as NodeDatum).x ?? 0)
          .attr('y1', d => (d.source as NodeDatum).y ?? 0)
          .attr('x2', d => (d.target as NodeDatum).x ?? 0)
          .attr('y2', d => (d.target as NodeDatum).y ?? 0)
        nodeSel.attr('transform', d => `translate(${(d.x ?? 0).toFixed(1)},${(d.y ?? 0).toFixed(1)})`)
      })

    simRef.current = sim

    return () => {
      sim.stop()
      if (container.contains(tip)) container.removeChild(tip)
    }
  }, [topo, tmExpanded, viewMode, canvasW, canvasH])

  // ── Protter zoom/pan ──────────────────────────────────────────────────────────

  const applyPz = useCallback(() => {
    const pz = pzRef.current
    if (protterSvgRef.current)
      protterSvgRef.current.style.transform = `translate(${pz.tx}px,${pz.ty}px) scale(${pz.scale})`
  }, [])

  const handleProtterWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const pz = pzRef.current
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    const rect = e.currentTarget.getBoundingClientRect()
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top
    pz.tx = cx + (pz.tx - cx) * factor
    pz.ty = cy + (pz.ty - cy) * factor
    pz.scale *= factor
    applyPz()
  }, [applyPz])

  const handleProtterMouseDown = useCallback((e: React.MouseEvent) => {
    const pz = pzRef.current
    pz.dragging = true
    pz.startX = e.clientX; pz.startY = e.clientY
    pz.startTx = pz.tx; pz.startTy = pz.ty
  }, [])

  const handleProtterMouseMove = useCallback((e: React.MouseEvent) => {
    const pz = pzRef.current
    if (!pz.dragging) return
    pz.tx = pz.startTx + (e.clientX - pz.startX)
    pz.ty = pz.startTy + (e.clientY - pz.startY)
    applyPz()
  }, [applyPz])

  const handleProtterMouseUp = useCallback(() => { pzRef.current.dragging = false }, [])

  const handleProtterDblClick = useCallback(() => {
    pzRef.current.scale = 1; pzRef.current.tx = 0; pzRef.current.ty = 0
    if (protterSvgRef.current) protterSvgRef.current.style.transform = ''
  }, [])

  // ── Render ────────────────────────────────────────────────────────────────────

  const tmCount = topo ? topo.segments.filter(s => s.type === 'TM').length : 0

  return (
    <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg)', display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', background: 'var(--bg-hud)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'monospace', minWidth: 0, whiteSpace: 'nowrap' }}>
          {topoError
            ? <span style={{ color: '#c0392b' }}>topology error</span>
            : topo ? `${topo.length} aa · ${tmCount} TM` : 'computing…'}
        </span>
        <div style={{ display: 'flex', gap: 3, marginLeft: 2 }}>
          <button
            onClick={() => setViewMode('d3')}
            style={{ ...tvBtnStyle, color: viewMode === 'd3' ? '#6a3d9a' : 'var(--btn-txt)', borderColor: viewMode === 'd3' ? '#6a3d9a' : 'var(--btn-bd)' }}
          >D3 ⚡</button>
          <button
            onClick={() => setViewMode('protter')}
            style={{ ...tvBtnStyle, color: viewMode === 'protter' ? '#6a3d9a' : 'var(--btn-txt)', borderColor: viewMode === 'protter' ? '#6a3d9a' : 'var(--btn-bd)' }}
          >Protter SVG</button>
        </div>
        {viewMode === 'd3' && (
          <button onClick={() => setTmExpanded(e => !e)} style={tvBtnStyle}>
            {tmExpanded ? 'Collapse TM' : 'Expand TM'}
          </button>
        )}
        <div style={{ flex: 1 }} />
        {uniprotAcc && (
          <button
            onClick={() => openExternalLink(`https://www.uniprot.org/uniprot/${uniprotAcc}`)}
            style={{ ...tvBtnStyle, color: '#6a3d9a', borderColor: '#c9b8e8' }}
          >UniProt {uniprotAcc} ↗</button>
        )}
      </div>

      {/* D3 canvas */}
      {viewMode === 'd3' && (
        <div ref={d3ContainerCallbackRef} style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <svg ref={svgRef} style={{ width: '100%', height: '100%', display: 'block' }} />
        </div>
      )}

      {/* Protter panel */}
      {viewMode === 'protter' && (
        <div
          style={{ flex: 1, overflow: 'hidden', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: protter ? 'grab' : 'default', userSelect: 'none', position: 'relative' }}
          onWheel={handleProtterWheel}
          onMouseDown={handleProtterMouseDown}
          onMouseMove={handleProtterMouseMove}
          onMouseUp={handleProtterMouseUp}
          onMouseLeave={handleProtterMouseUp}
          onDoubleClick={handleProtterDblClick}
        >
          {protterLoading && (
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'system-ui, sans-serif' }}>
              <span style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid #ddd', borderTopColor: '#6a3d9a', borderRadius: '50%', verticalAlign: 'middle', marginRight: 6, animation: 'spin 0.7s linear infinite' }} />
              Fetching Protter SVG…
            </span>
          )}
          {protterError && !protterLoading && (
            <span style={{ fontSize: 11, color: '#c0392b', fontFamily: 'system-ui, sans-serif', padding: '0 16px', textAlign: 'center' }}>⚠ {protterError}</span>
          )}
          {protter && !protterLoading && (
            <>
              <div ref={protterSvgRef} style={{ transformOrigin: '0 0', lineHeight: 0 }} dangerouslySetInnerHTML={{ __html: protter }} />
              <span style={{ position: 'absolute', bottom: 5, right: 10, fontSize: 9, color: 'var(--text-4)', pointerEvents: 'none' }}>
                scroll · drag · dbl-click to reset
              </span>
            </>
          )}
        </div>
      )}

      {/* D3 legend */}
      {viewMode === 'd3' && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '3px 10px', background: 'var(--bg-hud)', borderTop: '1px solid var(--border)', flexShrink: 0, flexWrap: 'wrap' }}>
          {([
            ['#4c9be8', 'Periplasmic'],
            ['#585b70', 'Cytoplasmic'],
            ['#7c6fa0', 'TM residue'],
            ['#6e6a86', 'TM supernode'],
            ['#f38ba8', 'His'],
            ['#a6e3a1', 'Met'],
            ['#cba6f7', 'Arg/Lys'],
            ['#fab387', 'Cys'],
          ] as [string, string][]).map(([color, lbl]) => (
            <div key={lbl} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 9, color: 'var(--text-3)' }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, border: '1px solid #555', flexShrink: 0 }} />
              {lbl}
            </div>
          ))}
        </div>
      )}

    </div>
  )
}

const tvBtnStyle: React.CSSProperties = {
  padding: '1px 6px', fontSize: 10, borderRadius: 3,
  border: '1px solid var(--btn-bd)', background: 'var(--btn-bg)',
  cursor: 'pointer', color: 'var(--btn-txt)', whiteSpace: 'nowrap',
}
