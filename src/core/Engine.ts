import { PerspectiveCamera, Scene, Timer, WebGLRenderer } from 'three'

export interface EngineOptions {
  /** Capture mode pins the resolution and disables adaptive scaling so frames
   *  are comparable between runs. */
  capture?: boolean
}

/**
 * Renderer, camera and frame loop.
 *
 * Adaptive pixel ratio is treated as a quality feature rather than an
 * optimisation bolted on at the end: the brief asks for a locked 60 at retina,
 * and the honest way to hold that is to give back resolution when a frame goes
 * long instead of dropping frames.
 */
export class Engine {
  readonly renderer: WebGLRenderer
  readonly scene = new Scene()
  readonly camera: PerspectiveCamera
  readonly timer = new Timer()

  private maxPixelRatio: number
  private readonly deviceRatio: number
  private pixelRatio: number
  private readonly capture: boolean

  private frameTimes: number[] = []
  private cooldown = 0

  private updateFn: ((delta: number, elapsed: number) => void) | null = null
  private renderFn: ((renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) => void) | null =
    null
  private running = false

  /** Vertical extent of one pixel at one unit of depth: 2*tan(fov/2)/height.
   *  Outline thickness multiplies by this to stay a fixed pixel width through
   *  the camera's FOV kick. */
  get pixelScale(): number {
    const fovRadians = (this.camera.fov * Math.PI) / 180
    return (2 * Math.tan(fovRadians / 2)) / (window.innerHeight * this.pixelRatio)
  }

  constructor(canvas: HTMLCanvasElement, options: EngineOptions = {}) {
    this.capture = options.capture ?? false

    this.renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: this.capture,
      stencil: false,
    })

    this.deviceRatio = Math.min(window.devicePixelRatio || 1, 2)
    this.maxPixelRatio = this.deviceRatio
    this.pixelRatio = this.maxPixelRatio
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.setSize(window.innerWidth, window.innerHeight)

    this.camera = new PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.5, 600)
    this.camera.position.set(0, 40, 0)

    window.addEventListener('resize', this.onResize)
  }

  private resizeFn: ((width: number, height: number) => void) | null = null

  /** Notified with the drawing-buffer size, so render targets can follow. */
  onResized(fn: (width: number, height: number) => void): void {
    this.resizeFn = fn
    const size = this.drawingBufferSize()
    fn(size.width, size.height)
  }

  private drawingBufferSize(): { width: number; height: number } {
    return {
      width: Math.floor(window.innerWidth * this.pixelRatio),
      height: Math.floor(window.innerHeight * this.pixelRatio),
    }
  }

  private onResize = (): void => {
    this.camera.aspect = window.innerWidth / window.innerHeight
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    const size = this.drawingBufferSize()
    this.resizeFn?.(size.width, size.height)
  }

  /**
   * Nudges resolution toward whatever holds 60fps. Changes are gated behind a
   * cooldown because an unfiltered controller oscillates between two ratios and
   * the resolution visibly pulses.
   */
  /** Freezes resolution. Benchmarks must pin it, or the controller changes the
   *  pixel count mid-measurement and the comparison means nothing. */
  adaptive = true

  private adaptResolution(delta: number): void {
    if (this.capture || !this.adaptive) return

    this.frameTimes.push(delta * 1000)
    if (this.frameTimes.length < 40) return

    const average = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length
    this.frameTimes.length = 0

    if (this.cooldown > 0) {
      this.cooldown--
      return
    }

    const min = 0.75
    if (average > 18.5 && this.pixelRatio > min) {
      this.applyPixelRatio(Math.max(min, this.pixelRatio - 0.25))
      this.cooldown = 2
    } else if (average < 13.0 && this.pixelRatio < this.maxPixelRatio) {
      this.applyPixelRatio(Math.min(this.maxPixelRatio, this.pixelRatio + 0.25))
      this.cooldown = 4
    }
  }

  /** Render targets have to follow the pixel ratio, or the post pass samples a
   *  buffer at the wrong resolution the moment quality is stepped down. */
  private applyPixelRatio(ratio: number): void {
    this.pixelRatio = ratio
    this.renderer.setPixelRatio(ratio)
    const size = this.drawingBufferSize()
    this.resizeFn?.(size.width, size.height)
  }

  /**
   * The graphics setting: the most pixels per CSS pixel to render, below the
   * screen's own. The adaptive controller still works underneath it.
   */
  setPixelCap(cap: number): void {
    if (this.capture) return
    this.maxPixelRatio = Math.max(0.75, Math.min(this.deviceRatio, cap))
    if (Math.abs(this.pixelRatio - this.maxPixelRatio) > 0.01) this.applyPixelRatio(this.maxPixelRatio)
  }

  get currentPixelRatio(): number {
    return this.pixelRatio
  }

  onUpdate(fn: (delta: number, elapsed: number) => void): void {
    this.updateFn = fn
  }

  /** Replaces the plain scene render: used to install the cel post pipeline. */
  onRender(fn: (renderer: WebGLRenderer, scene: Scene, camera: PerspectiveCamera) => void): void {
    this.renderFn = fn
  }

  private draw(): void {
    if (this.renderFn) this.renderFn(this.renderer, this.scene, this.camera)
    else this.renderer.render(this.scene, this.camera)
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.renderer.setAnimationLoop(this.tick)
  }

  stop(): void {
    this.running = false
    this.renderer.setAnimationLoop(null)
  }

  private tick = (): void => {
    // A long delta after a tab switch or a stall would teleport people through
    // walls, so it is clamped rather than trusted.
    this.timer.update()
    const delta = Math.min(this.timer.getDelta(), 0.05)
    this.adaptResolution(delta)
    this.updateFn?.(delta, this.timer.getElapsed())
    this.draw()
  }

  /** Renders one frame synchronously. Used by the screenshot harness. */
  renderOnce(): void {
    this.draw()
  }

  dispose(): void {
    this.stop()
    window.removeEventListener('resize', this.onResize)
    this.renderer.dispose()
  }
}
