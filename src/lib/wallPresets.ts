/* ============================================================
   照片墙背景预设
   - css 用于页面渲染；paint 是同一视觉的 canvas 实现，用于导出大图
   - 颗粒噪点用确定性伪随机（种子固定），保证导出图与页面观感一致
   ============================================================ */

export interface WallPreset {
  id: string
  name: { zh: string; en: string }
  /** 页面 CSS background（渐变 + SVG 噪点纹理） */
  css: string
  /** 导出时在 canvas 上绘制同一背景 */
  paint: (ctx: CanvasRenderingContext2D, w: number, h: number) => void
}

/** mulberry32：小而快的确定性伪随机（导出与预览共用同一份颗粒） */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface NoiseSpec {
  rgb: [number, number, number]
  /** 颗粒不透明度上限 */
  alpha: number
  /** SVG 纹理频率 */
  freq: number
  seed: number
  /** canvas 每百万像素的颗粒数 */
  density: number
}

/** 生成一张 SVG 噪点纹理的 data URI，叠在 CSS 渐变上模拟纸面/软木颗粒 */
function noiseTile(spec: NoiseSpec): string {
  const [r, g, b] = spec.rgb
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="220">` +
    `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${spec.freq}" numOctaves="2" seed="${spec.seed}"/>` +
    `<feColorMatrix type="matrix" values="0 0 0 0 ${r / 255}  0 0 0 0 ${g / 255}  0 0 0 0 ${b / 255}  0 0 0 ${spec.alpha} 0"/>` +
    `</filter><rect width="220" height="220" filter="url(#n)"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

/** canvas 颗粒：与 SVG 噪点同色系的小圆点 */
function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, spec: NoiseSpec): void {
  const rng = mulberry32(spec.seed * 7919 + 13)
  const count = Math.round((spec.density * w * h) / 1_000_000)
  for (let i = 0; i < count; i++) {
    const a = rng() * spec.alpha
    ctx.fillStyle = `rgba(${spec.rgb[0]},${spec.rgb[1]},${spec.rgb[2]},${a.toFixed(3)})`
    const r = 0.6 + rng() * (w / 900)
    ctx.beginPath()
    ctx.arc(rng() * w, rng() * h, r, 0, Math.PI * 2)
    ctx.fill()
  }
}

interface PresetDef {
  id: string
  name: { zh: string; en: string }
  /** 渐变停靠色（页面 CSS 与 canvas 渐变共用） */
  stops: [string, string, string]
  angle: number
  noise: NoiseSpec
}

const DEFS: PresetDef[] = [
  {
    id: 'cork',
    name: { zh: '软木板', en: 'Cork board' },
    stops: ['#dcbf94', '#d3b284', '#c9a774'],
    angle: 165,
    noise: { rgb: [112, 78, 40], alpha: 0.4, freq: 0.85, seed: 7, density: 260000 },
  },
  {
    id: 'linen',
    name: { zh: '亚麻白', en: 'Linen' },
    stops: ['#f7f3ea', '#f0eadd', '#eae2d2'],
    angle: 160,
    noise: { rgb: [150, 135, 105], alpha: 0.16, freq: 0.9, seed: 11, density: 140000 },
  },
  {
    id: 'mist',
    name: { zh: '雾蓝', en: 'Mist blue' },
    stops: ['#c9d8e6', '#dbe6ef', '#eaf1f6'],
    angle: 160,
    noise: { rgb: [90, 110, 140], alpha: 0.1, freq: 0.9, seed: 23, density: 90000 },
  },
  {
    id: 'blush',
    name: { zh: '樱花粉', en: 'Blush' },
    stops: ['#f3d9d4', '#f7e7e2', '#fbf1ee'],
    angle: 160,
    noise: { rgb: [190, 120, 110], alpha: 0.1, freq: 0.9, seed: 31, density: 90000 },
  },
  {
    id: 'board',
    name: { zh: '墨绿黑板', en: 'Chalkboard' },
    stops: ['#44584c', '#394b41', '#31403a'],
    angle: 165,
    noise: { rgb: [255, 255, 255], alpha: 0.09, freq: 0.8, seed: 41, density: 130000 },
  },
  {
    id: 'night',
    name: { zh: '炭黑夜幕', en: 'Charcoal' },
    stops: ['#37342f', '#2b2823', '#221f1b'],
    angle: 165,
    noise: { rgb: [255, 255, 255], alpha: 0.06, freq: 0.85, seed: 53, density: 90000 },
  },
]

function cssOf(def: PresetDef): string {
  // CSS 多背景：先声明的图层在上，噪点纹理要叠在渐变上面
  return `${noiseTile(def.noise)}, linear-gradient(${def.angle}deg, ${def.stops[0]} 0%, ${def.stops[1]} 55%, ${def.stops[2]} 100%)`
}

function paintOf(def: PresetDef): WallPreset['paint'] {
  return (ctx, w, h) => {
    // 与 CSS 渐变角度近似：165deg ≈ 从上偏左到下偏右
    const rad = ((def.angle - 90) * Math.PI) / 180
    const cx = w / 2
    const cy = h / 2
    const len = (Math.abs(Math.cos(rad)) * w + Math.abs(Math.sin(rad)) * h) / 2
    const grad = ctx.createLinearGradient(
      cx - Math.cos(rad) * len,
      cy - Math.sin(rad) * len,
      cx + Math.cos(rad) * len,
      cy + Math.sin(rad) * len,
    )
    grad.addColorStop(0, def.stops[0])
    grad.addColorStop(0.55, def.stops[1])
    grad.addColorStop(1, def.stops[2])
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, w, h)
    speckle(ctx, w, h, def.noise)
  }
}

export const WALL_PRESETS: WallPreset[] = DEFS.map((d) => ({
  id: d.id,
  name: d.name,
  css: cssOf(d),
  paint: paintOf(d),
}))

export const DEFAULT_WALL_BG = 'cork'

export function getWallPreset(id: string | undefined): WallPreset {
  return WALL_PRESETS.find((p) => p.id === id) ?? WALL_PRESETS[0]
}

/** 胶带/图钉色板：按照片 id 哈希取色，保证同一张照片颜色稳定 */
export const TAPE_COLORS = ['#e2b13c', '#d96a5a', '#7fa8c9', '#8fbf8f', '#d98cab', '#b7a3d6']

export function tapeColorFor(photoId: string): string {
  let hash = 0
  for (let i = 0; i < photoId.length; i++) hash = (hash * 31 + photoId.charCodeAt(i)) | 0
  return TAPE_COLORS[Math.abs(hash) % TAPE_COLORS.length]
}

/** 胶带自身的小偏角（-6°~6°），同样按 id 稳定 */
export function tapeAngleFor(photoId: string): number {
  let hash = 7
  for (let i = 0; i < photoId.length; i++) hash = (hash * 17 + photoId.charCodeAt(i)) | 0
  return (Math.abs(hash) % 13) - 6
}
