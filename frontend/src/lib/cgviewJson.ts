// cgviewJson.ts
// Converts a DocumentDTO into the JSON payload expected by CGView.js v1.8.0.
//
// Port of build_cgview_json() from micromicon/R/frameworks_cgview_build.R.
// Track routing, palette, and ruler math are kept identical to the R version.

import type { DocumentDTO } from '../types'

// ---- Default colour palette (mirrors .CGVIEW_PALETTE in R) -----------------

const PALETTE: Record<string, string> = {
  CDS:           '#4e79a7',
  tRNA:          '#8b6bd6',
  rRNA:          '#2ecc71',
  tmRNA:         '#e74c3c',
  repeat_region: '#f39c12',
  gene:          '#95a5a6',
  other:         '#7f8c8d',
}

/** Returns the genome-mode display colour for a feature type. */
export function genomeFeatureColor(type: string): string {
  return PALETTE[type] ?? PALETTE.other
}

/** Returns a pastel (55% white-blended) version for use in text-heavy panes. */
export function genomeFeatureLightColor(type: string): string {
  const hex = genomeFeatureColor(type)
  const n = parseInt(hex.slice(1), 16)
  const r = Math.round(((n >> 16) & 0xff) * 0.45 + 255 * 0.55)
  const g = Math.round(((n >>  8) & 0xff) * 0.45 + 255 * 0.55)
  const b = Math.round(( n        & 0xff) * 0.45 + 255 * 0.55)
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}

// Feature types routed to the ncRNA track
const NCRNA_TYPES = new Set(['tRNA', 'rRNA', 'tmRNA', 'repeat_region'])

// Feature types that get arrow decoration (driven via legend item in CGView 1.8)
const ARROW_TYPES = new Set(['CDS', 'gene'])

// ---- Public builder ---------------------------------------------------------

export function buildCGViewJSON(doc: DocumentDTO): object {
  const genomeLength = doc.length

  // tickCount: clamp to [4, 10], target one tick per nice interval
  const niceInterval = cgviewNiceInterval(genomeLength)
  const tickCount    = Math.max(4, Math.min(10, Math.round(genomeLength / niceInterval)))

  // Collect features (skip 'source' entries)
  const featureObjects: object[] = []
  const legendSeen = new Set<string>()

  for (const feat of doc.features) {
    if (feat.type === 'source') continue
    if (feat.spans.length === 0) continue

    const start  = feat.spans[0].start + 1          // CGView is 1-indexed
    const stop   = feat.spans[feat.spans.length - 1].end
    const strand = feat.direction === 'reverse' ? -1 : 1
    const ft     = feat.type

    const sourceKey = NCRNA_TYPES.has(ft) ? 'ncRNA' : ft
    const deco      = ARROW_TYPES.has(ft)  ? 'arrow' : 'arc'

    featureObjects.push({
      name:       feat.label || feat.id,  // display name (id is the fallback for unlabeled features)
      type:       ft,
      start,
      stop,
      strand,
      source:     sourceKey,
      legend:     ft,
      decoration: deco,
      showLabel:  false,
    })

    legendSeen.add(ft)
  }

  // ---- Legend items ----------------------------------------------------------
  const legendItems = Array.from(legendSeen).map(nm => {
    const item: Record<string, unknown> = {
      name:        nm,
      swatchColor: PALETTE[nm] ?? PALETTE.other,
    }
    if (ARROW_TYPES.has(nm)) item.decoration = 'arrow'
    return item
  })

  // ---- Track list ------------------------------------------------------------
  const tracks: object[] = []

  const typesPresent = new Set(legendSeen)

  // CDS track — straddles backbone, strand-split
  const hasCDS = [...ARROW_TYPES].some(t => typesPresent.has(t))
  if (hasCDS) {
    tracks.push({
      name:               'CDS',
      separateFeaturesBy: 'strand',
      position:           'both',
      dataType:           'feature',
      dataMethod:         'source',
      dataKeys:           'CDS',
      showLabels:         false,
    })
  }

  // ncRNA track — outside CDS band
  const hasNcRNA = [...NCRNA_TYPES].some(t => typesPresent.has(t))
  if (hasNcRNA) {
    tracks.push({
      name:               'ncRNA',
      separateFeaturesBy: 'strand',
      position:           'outside',
      dataType:           'feature',
      dataMethod:         'source',
      dataKeys:           'ncRNA',
      showLabels:         false,
    })
  }

  // Any remaining types get their own inside track
  const covered = new Set([...ARROW_TYPES, ...NCRNA_TYPES])
  for (const ft of typesPresent) {
    if (!covered.has(ft)) {
      tracks.push({
        name:               ft,
        separateFeaturesBy: 'none',
        position:           'inside',
        dataType:           'feature',
        dataMethod:         'source',
        dataKeys:           ft,
        showLabels:         false,
      })
    }
  }

  // ---- Assemble CGView-native JSON -------------------------------------------
  return {
    cgview: {
      version: '1.0',
      settings: {
        format:          'circular',
        backgroundColor: '#FFFFFF',
        arrowHeadLength: 0.3,
      },
      sequence: {
        length: genomeLength,
        name:   doc.name,
      },
      backbone: {
        color:     '#999999',
        thickness: 6,
      },
      ruler: {
        visible:    true,
        tickCount,
        color:      '#888888',
        tickLength: 10,
        tickWidth:  2,
        font:       'sans-serif, plain, 18',
      },
      features: featureObjects,
      legend: {
        position:    'top-right',
        interactive: false,
        items:       legendItems,
      },
      tracks,
    },
  }
}

// ---- Utility ----------------------------------------------------------------

// Port of .cgview_nice_interval(): return a round number ~1/5 of genome length.
function cgviewNiceInterval(len: number): number {
  const raw  = len / 5
  const mag  = Math.pow(10, Math.floor(Math.log10(raw)))
  const cands = [1, 2, 5, 10].map(c => c * mag)
  return cands.reduce((best, c) => Math.abs(c - raw) < Math.abs(best - raw) ? c : best)
}
