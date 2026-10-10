/* ============================================================
   照片墙导出：在离屏 canvas 上按墙面配置重绘一张大图并触发下载
   - 画板固定 1:1（与页面预览一致），默认 2000×2000，JPEG 输出
   - 照片均为同源 /f/ 或 dataURL，canvas 不会被污染
   - 绘制顺序 = items 数组顺序（靠后在上），与页面 z-index 一致
   ============================================================ */

import type { Photo, WallConfig } from './types'
import { getWallPreset, tapeAngleFor, tapeColorFor } from './wallPresets'

const EXPORT_SIZE = 2000

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`image load failed: ${url.slice(0, 60)}`))
    img.src = url
  })
}

/** 视频首帧：loadeddata 后 drawImage 可取到当前帧（同源 /f/，canvas 不被污染） */
function loadVideoFrame(url: string): Promise<HTMLVideoElement> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'auto'
    v.muted = true
    v.playsInline = true
    const fail = () => reject(new Error(`video load failed: ${url.slice(0, 60)}`))
    v.onerror = fail
    v.onloadeddata = () => resolve(v)
    v.src = `${url}#t=0.1`
  })
}

/** 照片或视频帧，统一为可绘制源 */
async function loadDrawable(
  photo: Photo,
): Promise<HTMLImageElement | HTMLVideoElement> {
  return photo.kind === 'video' ? loadVideoFrame(photo.url) : loadImage(photo.url)
}

/** ctx.roundRect 的兜底（旧浏览器无此 API） */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, r)
    return
  }
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

async function renderWallCanvas(wall: WallConfig, photos: Photo[], size: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas 2d unavailable')

  getWallPreset(wall.background).paint(ctx, size, size)

  const byId = new Map(photos.map((p) => [p.id, p]))
  const imgs = new Map<string, HTMLImageElement | HTMLVideoElement>()
  // 先并行加载全部照片（视频取首帧）；个别加载失败只跳过该张，不阻塞整图导出
  await Promise.all(
    wall.items.map(async (it) => {
      const p = byId.get(it.photoId)
      if (!p) return
      try {
        imgs.set(it.photoId, await loadDrawable(p))
      } catch {
        /* 跳过加载失败的照片 */
      }
    }),
  )

  for (const it of wall.items) {
    const p = byId.get(it.photoId)
    const img = imgs.get(it.photoId)
    if (!p) continue

    const cardW = (it.w / 100) * size
    const pad = cardW * 0.058
    const padBottom = pad * 2.4
    const imgW = cardW - pad * 2
    const ratio = p.width > 0 && p.height > 0 ? p.height / p.width : 1
    const imgH = imgW * ratio
    const cardH = imgH + pad + padBottom
    const cx = (it.x / 100) * size
    const cy = (it.y / 100) * size

    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((it.rot * Math.PI) / 180)

    // 白色相纸（带投影）
    ctx.shadowColor = 'rgba(30, 25, 18, 0.28)'
    ctx.shadowBlur = cardW * 0.12
    ctx.shadowOffsetY = cardW * 0.045
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    roundRectPath(ctx, -cardW / 2, -cardH / 2, cardW, cardH, cardW * 0.028)
    ctx.fill()
    ctx.shadowColor = 'transparent'
    ctx.shadowBlur = 0
    ctx.shadowOffsetY = 0

    // 照片本体（宽度贴合相纸内边，高度按原图比例）
    if (img && imgW > 0 && imgH > 0) {
      ctx.drawImage(img, -imgW / 2, -cardH / 2 + pad, imgW, imgH)
    }

    // 顶部胶带
    const tapeW = cardW * 0.24
    const tapeH = cardW * 0.07
    ctx.save()
    ctx.rotate((tapeAngleFor(it.photoId) * Math.PI) / 180)
    ctx.globalAlpha = 0.88
    ctx.fillStyle = tapeColorFor(it.photoId)
    ctx.fillRect(-tapeW / 2, -cardH / 2 - tapeH * 0.45, tapeW, tapeH)
    ctx.restore()

    ctx.restore()
  }

  return canvas
}

function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, '').trim() || 'photo-wall'
}

/** 渲染照片墙为 JPEG Blob（导出与测试预览共用） */
export async function renderWallBlob(wall: WallConfig, photos: Photo[], size = EXPORT_SIZE): Promise<Blob> {
  const canvas = await renderWallCanvas(wall, photos, size)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92))
  if (!blob) throw new Error('toBlob failed')
  return blob
}

/** 渲染当前照片墙并下载为一张大图 */
export async function exportWallImage(albumName: string, wall: WallConfig, photos: Photo[]): Promise<void> {
  const blob = await renderWallBlob(wall, photos)
  const url = URL.createObjectURL(blob)
  try {
    const a = document.createElement('a')
    a.href = url
    a.download = `${sanitizeFilename(albumName)}-照片墙.jpg`
    document.body.appendChild(a)
    a.click()
    a.remove()
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 4000)
  }
}
