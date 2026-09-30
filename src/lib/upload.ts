import type { PhotoInput } from './types'

/** 弹出系统文件选择器，返回所选文件（取消返回 null） */
export function pickImages(): Promise<FileList | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
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

/**
 * 本地文件转可直接持久化的 dataURL（压到最长边 1280px）。
 * mock 阶段全前端处理，接入 Workers 后替换为对象存储 + API。
 */
async function fileToPhotoInput(file: File): Promise<PhotoInput> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)
    const max = 1280
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
    return {
      url: canvas.toDataURL('image/jpeg', 0.82),
      width: w,
      height: h,
      title: file.name.replace(/\.[^.]+$/, ''),
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

export async function filesToPhotoInputs(files: FileList): Promise<PhotoInput[]> {
  const out: PhotoInput[] = []
  for (const file of Array.from(files)) {
    if (!file.type.startsWith('image/')) continue
    try {
      out.push(await fileToPhotoInput(file))
    } catch {
      /* 跳过无法解析的文件 */
    }
  }
  return out
}
