// Minimal ambient declaration for CGView.js v1.8.0 (browser global)
// https://github.com/sciguy/cgview-js

declare namespace CGView {
  interface Track {
    name: string
    thicknessRatio: number
  }

  interface LegendItem {
    name: string
    decoration: string
    swatchColor: string
  }

  interface Legend {
    position:    string
    font:        string
    interactive: boolean
    items(): LegendItem[]
  }

  interface Ruler {
    visible: boolean
    rulerPadding: number
    tickLength: number
    tickWidth: number
    tickCount: number
    spacing: number
    font: unknown
  }

  interface Settings {
    arrowHeadLength: number
    update(opts: { format: 'circular' | 'linear' }): void
  }

  interface Canvas {
    resize(width: number, height: number): void
  }

  interface IO {
    loadJSON(payload: object): void
    downloadImage(width: number, height: number, filename: string): void
  }

  interface EventData {
    features?: CGViewFeature[]
    feature?: CGViewFeature
    nearestFeature?: CGViewFeature
    canvasX?: number
    canvasY?: number
  }

  interface Viewer {
    settings: Settings
    ruler: Ruler
    legend: Legend
    canvas: Canvas
    io: IO
    format: string
    width: number
    height: number
    draw(): void
    tracks(): Track[]
    zoomIn(): void
    zoomOut(): void
    moveLeft(): void
    moveRight(): void
    reset(): void
    zoomTo(bp: number, zoom: number, options?: { duration?: number; bbOffset?: number }): void
    on(event: string, handler: (e: EventData, data?: EventData) => void): void
  }

  interface CGViewFeature {
    name: string
    start: number
    stop: number
    end?: number
    strand: number | string
    type: string
    source: string
  }

  const Viewer: new (selector: string, opts: { width: number; height: number }) => Viewer
}

declare const CGView: typeof CGView
