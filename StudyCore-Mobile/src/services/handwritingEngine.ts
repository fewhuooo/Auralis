import { getStroke } from 'perfect-freehand'

export interface StrokePoint {
  x: number
  y: number
  pressure: number      // 0.0-1.0
  tiltX: number         // -90 to 90
  tiltY: number         // -90 to 90
  timestamp: number
}

export interface Stroke {
  id: string
  points: StrokePoint[]
  tool: 'pen' | 'pencil' | 'highlighter' | 'eraser'
  color: string
  size: number
}

export interface NotebookData {
  id: string
  title: string
  strokes: Stroke[]
  viewport: { x: number, y: number, scale: number }
  background: 'blank' | 'grid' | 'lined' | 'dotted'
  createdAt: string
  updatedAt: string
}

export class HandwritingEngine {
  private ctx: CanvasRenderingContext2D
  private strokes: Stroke[] = []
  private undoStack: Stroke[][] = []
  
  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx
  }

  // Load existing strokes
  public loadStrokes(strokes: Stroke[]) {
    this.strokes = strokes
    this.undoStack = []
    this.render()
  }

  // Add a new stroke
  public addStroke(stroke: Stroke) {
    this.saveState()
    this.strokes.push(stroke)
    this.render()
  }

  // Erase strokes that intersect with the eraser path
  public erase(eraserPath: StrokePoint[], eraserSize: number) {
    this.saveState()
    const newStrokes = this.strokes.filter(stroke => {
      // Very basic bounding box/distance intersection check for eraser
      for (const p of stroke.points) {
        for (const ep of eraserPath) {
          const dist = Math.hypot(p.x - ep.x, p.y - ep.y)
          if (dist < eraserSize) {
            return false // Intersects, remove this stroke completely
          }
        }
      }
      return true
    })
    
    if (newStrokes.length !== this.strokes.length) {
      this.strokes = newStrokes
      this.render()
    } else {
      this.undoStack.pop() // Revert saveState if nothing was erased
    }
  }

  private saveState() {
    this.undoStack.push(JSON.parse(JSON.stringify(this.strokes)))
    if (this.undoStack.length > 50) this.undoStack.shift() // Max 50 undo steps
  }

  public undo() {
    if (this.undoStack.length > 0) {
      this.strokes = this.undoStack.pop()!
      this.render()
    }
  }

  // Render all strokes to the canvas
  public render() {
    if (!this.ctx) return
    const canvas = this.ctx.canvas
    this.ctx.clearRect(0, 0, canvas.width, canvas.height)
    
    for (const stroke of this.strokes) {
      if (stroke.points.length === 0) continue

      if (stroke.tool === 'highlighter') {
        this.ctx.globalCompositeOperation = 'multiply'
        this.ctx.globalAlpha = 0.5
      } else {
        this.ctx.globalCompositeOperation = 'source-over'
        this.ctx.globalAlpha = 1.0
      }

      const pathData = this.getSvgPathFromStroke(stroke)
      const p = new Path2D(pathData)
      this.ctx.fillStyle = stroke.color
      this.ctx.fill(p)
    }
    
    // Reset defaults
    this.ctx.globalCompositeOperation = 'source-over'
    this.ctx.globalAlpha = 1.0
  }

  // Generate SVG path string using perfect-freehand
  private getSvgPathFromStroke(stroke: Stroke): string {
    const points = stroke.points.map(p => [p.x, p.y, p.pressure])
    
    // Options for perfect-freehand
    const options = {
      size: stroke.size,
      thinning: 0.5,
      smoothing: 0.5,
      streamline: 0.5,
      easing: (t: number) => t,
      start: { taper: 0, easing: (t: number) => t, cap: true },
      end: { taper: 0, easing: (t: number) => t, cap: true },
      simulatePressure: false // We provide actual pressure!
    }

    // Highlighters are blockier, pens are smoother
    if (stroke.tool === 'highlighter') {
      options.size = stroke.size * 3
      options.thinning = -0.2
    } else if (stroke.tool === 'pencil') {
      options.size = stroke.size * 0.8
    }

    const outlinePoints = getStroke(points, options)
    
    if (outlinePoints.length === 0) return ''

    const d = outlinePoints.reduce(
      (acc, [x0, y0], i, arr) => {
        const [x1, y1] = arr[(i + 1) % arr.length]
        acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2)
        return acc
      },
      ['M', ...outlinePoints[0], 'Q']
    )
    d.push('Z')
    return d.join(' ')
  }

  // Export to Blob (PNG)
  public async exportToPNG(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      this.ctx.canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Failed to export canvas to PNG'))
      }, 'image/png')
    })
  }
}
