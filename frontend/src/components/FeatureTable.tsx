import { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useSelection } from '../hooks/useSelection'
import type { DocumentDTO, FeatureDTO } from '../types'

type SortKey = 'label' | 'type' | 'start' | 'end' | 'length' | 'direction'

const COLUMNS: Array<{ key: SortKey | ''; label: string; width: number }> = [
  { key: '',          label: '',     width: 22  },
  { key: 'label',     label: 'Name', width: 160 },
  { key: 'type',      label: 'Type', width: 110 },
  { key: 'start',     label: 'Start', width: 72 },
  { key: 'end',       label: 'End',   width: 72  },
  { key: 'length',    label: 'Len',   width: 64  },
  { key: 'direction', label: 'Dir',   width: 36  },
]

function featStart(f: FeatureDTO) { return f.spans[0]?.start ?? 0 }
function featEnd(f: FeatureDTO)   { return f.spans[f.spans.length - 1]?.end ?? 0 }
function featLen(f: FeatureDTO)   { return f.spans.reduce((n, s) => n + s.end - s.start, 0) }
function featDir(f: FeatureDTO)   { return f.direction === 'forward' ? '→' : f.direction === 'reverse' ? '←' : '—' }

function sortFeatures(features: FeatureDTO[], key: SortKey, asc: boolean): FeatureDTO[] {
  return [...features].sort((a, b) => {
    let av: string | number
    let bv: string | number
    switch (key) {
      case 'label':     av = a.label;       bv = b.label;       break
      case 'type':      av = a.type;        bv = b.type;        break
      case 'start':     av = featStart(a);  bv = featStart(b);  break
      case 'end':       av = featEnd(a);    bv = featEnd(b);    break
      case 'length':    av = featLen(a);    bv = featLen(b);    break
      case 'direction': av = a.direction;   bv = b.direction;   break
    }
    const cmp = av! < bv! ? -1 : av! > bv! ? 1 : 0
    return asc ? cmp : -cmp
  })
}

interface FeatureTableProps {
  doc: DocumentDTO
}

export function FeatureTable({ doc }: FeatureTableProps) {
  const { selection, publish } = useSelection('featuretable')
  const [sortKey, setSortKey] = useState<SortKey>('start')
  const [sortAsc, setSortAsc] = useState(true)
  const selectedRowRef = useRef<HTMLTableRowElement>(null)

  const sorted = useMemo(
    () => sortFeatures(doc.features, sortKey, sortAsc),
    [doc.features, sortKey, sortAsc],
  )

  // Scroll the selected row into view when selection changes.
  useEffect(() => {
    selectedRowRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selection?.featureId])

  const handleHeaderClick = useCallback((key: SortKey | '') => {
    if (!key) return
    setSortKey(prev => {
      if (prev === key) { setSortAsc(a => !a); return prev }
      setSortAsc(true)
      return key
    })
  }, [])

  const handleRowClick = useCallback((feat: FeatureDTO) => {
    publish({ start: featStart(feat), end: featEnd(feat), featureId: feat.id })
  }, [publish])

  return (
    <div style={{ overflowY: 'auto', height: '100%' }}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {COLUMNS.map(col => (
              <th
                key={col.label || '__color'}
                onClick={() => handleHeaderClick(col.key)}
                style={{
                  ...thStyle,
                  width: col.width,
                  cursor: col.key ? 'pointer' : 'default',
                  userSelect: 'none',
                }}
              >
                {col.key === sortKey
                  ? `${col.label} ${sortAsc ? '↑' : '↓'}`
                  : col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(feat => {
            const isSelected = selection?.featureId === feat.id
            const fwdColor = feat.direction === 'reverse' ? feat.revColor : feat.fwdColor
            return (
              <tr
                key={feat.id}
                ref={isSelected ? selectedRowRef : null}
                onClick={() => handleRowClick(feat)}
                style={{
                  background: isSelected ? '#ffcc0022' : 'transparent',
                  cursor: 'pointer',
                  outline: isSelected ? '1px solid #FFCC0066' : 'none',
                }}
              >
                {/* Color swatch */}
                <td style={tdStyle}>
                  <div style={{
                    width: 12, height: 12, borderRadius: 2,
                    background: fwdColor, margin: 'auto',
                  }} />
                </td>
                <td style={tdStyle}>{feat.label}</td>
                <td style={{ ...tdStyle, color: '#666' }}>{feat.type}</td>
                <td style={tdStyle}>{featStart(feat) + 1}</td>
                <td style={tdStyle}>{featEnd(feat)}</td>
                <td style={tdStyle}>{featLen(feat)}</td>
                <td style={{ ...tdStyle, color: '#666' }}>{featDir(feat)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

const tableStyle: React.CSSProperties = {
  borderCollapse: 'collapse', fontSize: 13, width: '100%',
}
const thStyle: React.CSSProperties = {
  textAlign: 'left', padding: '4px 8px',
  borderBottom: '1px solid #d0d0d0', color: '#666',
  position: 'sticky', top: 0, background: '#f5f5f5',
  whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  padding: '3px 8px', borderBottom: '1px solid #ebebeb',
}
