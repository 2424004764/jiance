/**
 * 从剪贴板 DataTransfer 中取出全部图片文件。
 * 三级兜底：files → items → text/html 里的内联 data:URL。
 * 部分应用复制图片时不把位图放进 files，或只在 HTML 里带一份。
 */
export function imagesFromClipboard(dt: DataTransfer | null): File[] {
  if (!dt) return []
  const out: File[] = []
  for (const f of Array.from(dt.files)) {
    if (f.type.startsWith('image/')) out.push(f)
  }
  if (out.length > 0) return out
  for (const item of Array.from(dt.items)) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const f = item.getAsFile()
      if (f) out.push(f)
    }
  }
  if (out.length > 0) return out
  const html = dt.getData('text/html')
  if (html) {
    const m = html.match(/<img[^>]*\ssrc="data:(image\/[\w.+-]+);base64,([\w+/=]+)"/i)
    if (m) {
      try {
        const bin = atob(m[2])
        const bytes = new Uint8Array(bin.length)
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
        const ext = (m[1].split('/')[1] ?? 'png').replace('jpeg', 'jpg')
        out.push(new File([bytes], `pasted.${ext}`, { type: m[1] }))
      } catch {
        // base64 解不开就当剪贴板没有图
      }
    }
  }
  return out
}

/** 焦点是否在可编辑元素上（文本粘贴的落点） */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
}

/**
 * 剪贴板文字是否是「跟着图片来的文件名/路径」而非用户要贴的正文：
 * 资源管理器复制文件、部分应用复制图片时会附带这类文本，此时仍按图片处理。
 */
const IMAGE_FILE_TEXT_RE = /^(?:[a-z]:[\\/][^\r\n]*|[^\r\n]{1,255}\.(?:png|jpe?g|gif|webp|avif|bmp|heic))$/i

export function textFollowsImage(text: string): boolean {
  return IMAGE_FILE_TEXT_RE.test(text.trim())
}

/**
 * 全局粘贴 → 上传弹窗的图片交接。
 * 模块级同步变量：事件监听里存入，弹窗打开时取走，StrictMode 双跑也不会重复消费。
 */
let pendingPasteFiles: File[] = []

export function setPendingPasteFiles(files: File[]): void {
  pendingPasteFiles = files
}

export function takePendingPasteFiles(): File[] {
  const files = pendingPasteFiles
  pendingPasteFiles = []
  return files
}
