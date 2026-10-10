import type { PhotoInput } from './types'

/** 弹出系统文件选择器，返回所选文件（取消返回 null） */
export function pickImages(): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*,video/mp4'
    input.multiple = true
    input.style.display = 'none'
    document.body.appendChild(input)
    const cleanup = () => input.remove()
    input.addEventListener('change', () => {
      resolve(input.files)
      cleanup()
    })
    input.addEventListener('cancel', () => {
      resolve(null)
      cleanup()
    })
    input.click()
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image load failed'))
    img.src = src
  })
}

/** 读取视频元数据（尺寸 + 时长）；无法解码 / 无时长时拒绝 */
function loadVideoMeta(src: string): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video')
    v.preload = 'metadata'
    v.muted = true
    const fail = () => reject(new Error('video load failed'))
    v.onerror = fail
    v.onloadedmetadata = () => {
      if (!Number.isFinite(v.duration) || v.duration <= 0 || v.videoWidth <= 0 || v.videoHeight <= 0) {
        fail()
        return
      }
      resolve({ width: v.videoWidth, height: v.videoHeight, duration: v.duration })
    }
    v.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      quality,
    )
  })
}

/** 待上传的一项：待存 Blob + 宽高 + 标题 + 文件扩展名 */
export interface UploadItem {
  blob: Blob
  width: number
  height: number
  title: string
  ext: string
  kind: 'image' | 'video'
  /** 视频时长（秒） */
  duration?: number
}

/** 解析失败的细分原因：弹窗展示不同提示 */
export type PrepFailure = 'unreadable' | 'tooLong'

export type PrepResult = { ok: true; item: UploadItem } | { ok: false; reason: PrepFailure }

/** 浏览器普遍能直接显示、服务端也接受的格式：原图直传档使用 */
const DIRECT_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/bmp': 'bmp',
}

/** 压缩档：最长边 1280px 的 JPEG */
const COMPRESS_MAX = 1280

/** 视频时长上限（秒）：与服务端 MP4 白名单配套，略放宽容差 */
export const VIDEO_MAX_SECONDS = 30

/**
 * 把单个文件准备为上传项，无法解码的返回失败原因（由调用方展示）。
 * - MP4：原图直传（≤30s），读元数据取尺寸与时长
 * - compress=true：压缩为最长边 1280px、质量 0.86 的 JPEG（省空间）
 * - compress=false：原图直传；仅 HEIC/HEIF 等浏览器普遍无法显示的格式
 *   转为同分辨率 JPEG（质量 0.95）——相册跨浏览器可看的必要转格式
 */
export async function fileToUploadItem(file: File, compress: boolean): Promise<PrepResult> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const title = file.name.replace(/\.[^.]+$/, '')

    if (file.type.toLowerCase() === 'video/mp4') {
      const meta = await loadVideoMeta(objectUrl)
      if (meta.duration > VIDEO_MAX_SECONDS + 0.4) return { ok: false, reason: 'tooLong' }
      return {
        ok: true,
        item: {
          blob: file,
          width: meta.width,
          height: meta.height,
          title,
          ext: 'mp4',
          kind: 'video',
          duration: Math.round(meta.duration * 10) / 10,
        },
      }
    }

    const img = await loadImage(objectUrl)
    const width = img.naturalWidth
    const height = img.naturalHeight
    if (width <= 0 || height <= 0) return { ok: false, reason: 'unreadable' }

    if (compress) {
      const scale = Math.min(1, COMPRESS_MAX / Math.max(width, height))
      const w = Math.max(1, Math.round(width * scale))
      const h = Math.max(1, Math.round(height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
      return {
        ok: true,
        item: { blob: await canvasToBlob(canvas, 0.86), width: w, height: h, title, ext: 'jpg', kind: 'image' },
      }
    }

    const directExt = DIRECT_TYPES[file.type.toLowerCase()]
    if (directExt) {
      return { ok: true, item: { blob: file, width, height, title, ext: directExt, kind: 'image' } }
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
    return {
      ok: true,
      item: { blob: await canvasToBlob(canvas, 0.95), width, height, title, ext: 'jpg', kind: 'image' },
    }
  } catch {
    return { ok: false, reason: 'unreadable' }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/** UploadItem 转入库存档结构（上传成功后调用） */
export function itemToPhotoInput(item: UploadItem, url: string): PhotoInput {
  return {
    url,
    width: item.width,
    height: item.height,
    title: item.title,
    kind: item.kind,
    duration: item.duration,
  }
}

/** 文件是否为可上传的媒体（图片或 MP4 短视频） */
export function isUploadableMedia(file: File): boolean {
  return file.type.startsWith('image/') || file.type.toLowerCase() === 'video/mp4'
}
