import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { ArrowSquareOut, Camera, Check, Database, ImageSquare, Play, Plus, SpinnerGap, Warning, X } from '@phosphor-icons/react'
import { Modal } from './Modal'
import {
  fileToUploadItem,
  isUploadableMedia,
  itemToPhotoInput,
  pickImages,
  VIDEO_MAX_SECONDS,
  type PrepResult,
  type UploadItem,
} from '../lib/upload'
import {
  fetchStorageQuota,
  uploadPhoto,
  QuotaExceededError,
  ScopeMissingError,
  type StorageQuota,
} from '../lib/storage'
import { beginLogin, oauthCreditsUrl } from '../lib/oauth'
import { formatBytes } from '../lib/format'
import { safeLocalStorage, useGallery, useToasts, useUploadModal } from '../lib/store'
import { imagesFromClipboard, isEditableTarget, takePendingPasteFiles, textFollowsImage } from '../lib/clipboard'
import { tr, useT } from '../lib/i18n'
import type { PhotoInput } from '../lib/types'

/** 与服务端一致的限额：图片 20MB，视频放宽到 100MB */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_VIDEO_BYTES = 100 * 1024 * 1024
/** 同时上传的张数：直传 PUT 走 R2 独立域名，服务端预留额度按并发原子扣减 */
const UPLOAD_CONCURRENCY = 3
/** 压缩开关记忆键（记住上次选择） */
const COMPRESS_KEY = 'jiance-up-compress'

type ItemStatus = 'idle' | 'uploading' | 'done' | 'error' | 'skipped'

interface Selected {
  id: string
  file: File
}

const limitFor = (file: File): number =>
  file.type.toLowerCase() === 'video/mp4' ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES

/** 单个缩略图：原图预览（视频用 video 元素取首帧），加载失败显示占位 */
function Thumb({ src, alt, isVideo }: { src: string | undefined; alt: string; isVideo: boolean }) {
  const [broken, setBroken] = useState(false)
  if (!src || broken) {
    return (
      <div className="up-thumb-broken">
        <ImageSquare size={22} />
      </div>
    )
  }
  if (isVideo) {
    return (
      <span className="up-thumb-video">
        <video src={src} preload="metadata" muted playsInline onError={() => setBroken(true)} />
        <Play size={18} weight="fill" aria-hidden="true" />
      </span>
    )
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setBroken(true)} />
}

export function UploadModal() {
  const { open, albumId, closeUpload } = useUploadModal()
  const addPhotos = useGallery((s) => s.addPhotos)
  const toast = useToasts((s) => s.toast)
  const { t } = useT()

  const [selected, setSelected] = useState<Selected[]>([])
  /** id -> 按当前压缩选项准备好的上传项（失败时带原因） */
  const [prep, setPrep] = useState<Record<string, PrepResult | null>>({})
  const [preparing, setPreparing] = useState(false)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const [compress, setCompress] = useState(false)
  const [quota, setQuota] = useState<StorageQuota | null>(null)
  const [quotaState, setQuotaState] = useState<'idle' | 'loading' | 'ok' | 'scope' | 'error'>('idle')
  const [statuses, setStatuses] = useState<Record<string, ItemStatus>>({})
  /** id -> 已上传百分比（0~100，整数） */
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [uploading, setUploading] = useState(false)
  /* 上传跟随滚动：滚容器与各缩略图元素 */
  const gridRef = useRef<HTMLDivElement | null>(null)
  const thumbRefs = useRef(new Map<string, HTMLDivElement>())
  const reduce = useReducedMotion()

  /* 打开时重置并读取额度；关闭时释放预览 */
  useEffect(() => {
    if (!open) return
    setSelected([])
    setPrep({})
    setPreviews({})
    setStatuses({})
    setProgress({})
    setUploading(false)
    setCompress(safeLocalStorage.getItem(COMPRESS_KEY) === '1')
    setQuotaState('loading')
    let alive = true
    fetchStorageQuota()
      .then((q) => {
        if (!alive) return
        setQuota(q)
        setQuotaState('ok')
      })
      .catch((e) => {
        if (!alive) return
        setQuotaState(e instanceof ScopeMissingError ? 'scope' : 'error')
      })
    return () => {
      alive = false
    }
  }, [open])

  /* 释放全部预览 URL */
  useEffect(() => {
    const map = previews
    return () => {
      Object.values(map).forEach((url) => URL.revokeObjectURL(url))
    }
  }, [previews])

  /* 压缩开关或选择变化时重新准备上传项 */
  useEffect(() => {
    if (selected.length === 0) {
      setPrep({})
      setPreparing(false)
      return
    }
    let alive = true
    setPreparing(true)
    void (async () => {
      const next: Record<string, PrepResult | null> = {}
      for (const s of selected) next[s.id] = await fileToUploadItem(s.file, compress)
      if (!alive) return
      setPrep(next)
      setPreparing(false)
    })()
    return () => {
      alive = false
    }
  }, [selected, compress])

  const addFiles = (files: FileList | File[] | null) => {
    if (!files) return
    const media = Array.from(files).filter(isUploadableMedia)
    if (media.length === 0) {
      toast(tr('up.noImages'), 'error')
      return
    }
    const added = media.map((file) => ({ id: crypto.randomUUID(), file }))
    setSelected((prev) => [...prev, ...added])
    setPreviews((prev) => {
      const next = { ...prev }
      added.forEach((a) => {
        next[a.id] = URL.createObjectURL(a.file)
      })
      return next
    })
  }

  /* 上传跟随滚动：以最靠前的「上传中」项为锚，其变化时把它滚进列表可视区，
     用户能一直看到当前正在传的是哪几张（多路并发时跟随批次最前端） */
  const frontUploadingId = uploading
    ? selected.find((s) => statuses[s.id] === 'uploading')?.id
    : undefined

  useEffect(() => {
    if (!frontUploadingId) return
    const grid = gridRef.current
    const el = thumbRefs.current.get(frontUploadingId)
    if (!grid || !el) return
    const g = grid.getBoundingClientRect()
    const r = el.getBoundingClientRect()
    const pad = 6
    const behavior = reduce ? 'auto' : 'smooth'
    if (r.top < g.top + pad) grid.scrollBy({ top: r.top - g.top - pad, behavior })
    else if (r.bottom > g.bottom - pad) grid.scrollBy({ top: r.bottom - g.bottom + pad, behavior })
  }, [frontUploadingId, reduce])

  const setThumbRef = (id: string) => (el: HTMLDivElement | null) => {
    if (el) thumbRefs.current.set(id, el)
    else thumbRefs.current.delete(id)
  }

  /* 全局粘贴唤起的上传弹窗：取走交接的图片，直接进选图列表（声明在重置 effect 之后，先清空再填入） */
  useEffect(() => {
    if (!open) return
    const pending = takePendingPasteFiles()
    if (pending.length > 0) addFiles(pending)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  /* 弹窗打开期间监听粘贴：截图 / 复制的图片 Ctrl+V 直接加入待上传列表 */
  useEffect(() => {
    if (!open) return
    const onPaste = (e: ClipboardEvent) => {
      if (uploading) return
      const images = imagesFromClipboard(e.clipboardData)
      if (images.length === 0) return
      // 焦点在输入框且带用户要贴的正文时放行文本粘贴（富文本复制常附带位图回退）
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (isEditableTarget(e.target) && text && !textFollowsImage(text)) return
      e.preventDefault()
      addFiles(images)
    }
    // 弹窗已打开时的全局拖拽投放：App 把文件放进 pending 交接区后发事件通知
    const onDropped = () => {
      if (uploading) return
      const pending = takePendingPasteFiles()
      if (pending.length > 0) addFiles(pending)
    }
    document.addEventListener('paste', onPaste)
    window.addEventListener('jiance-drop-files', onDropped)
    return () => {
      document.removeEventListener('paste', onPaste)
      window.removeEventListener('jiance-drop-files', onDropped)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, uploading])

  const removeSelected = (id: string) => {
    if (uploading) return
    setSelected((prev) => prev.filter((s) => s.id !== id))
    setPreviews((prev) => {
      const url = prev[id]
      if (url) URL.revokeObjectURL(url)
      const { [id]: _drop, ...rest } = prev
      return rest
    })
  }

  const toggleCompress = () => {
    if (uploading) return
    setCompress((v) => {
      const next = !v
      safeLocalStorage.setItem(COMPRESS_KEY, next ? '1' : '0')
      return next
    })
  }

  const close = () => {
    if (uploading) return
    closeUpload()
  }

  /* 解析成功的上传项（失败原因在渲染层单独提示） */
  const itemOf = (r: PrepResult | null | undefined): UploadItem | null => (r && r.ok ? r.item : null)

  /* 可上传项：已解析成功且未超对应类型上限 */
  const uploadable = selected.filter((s) => {
    const it = itemOf(prep[s.id])
    return !!it && it.blob.size <= limitFor(s.file) && statuses[s.id] !== 'done'
  })
  const totalBytes = uploadable.reduce((sum, s) => sum + itemOf(prep[s.id])!.blob.size, 0)
  const overQuota = quotaState === 'ok' && quota !== null && totalBytes > quota.remaining_bytes

  /* 本批全部可传项（含已完成，供总进度统计；uploadable 不含已完成项） */
  const batch = selected.filter((s) => {
    const it = itemOf(prep[s.id])
    return !!it && it.blob.size <= limitFor(s.file)
  })
  const batchBytes = batch.reduce((sum, s) => sum + itemOf(prep[s.id])!.blob.size, 0)
  const doneCount = batch.filter((s) => statuses[s.id] === 'done').length
  const overallPct =
    batchBytes > 0
      ? Math.round(
          (batch.reduce(
            (sum, s) =>
              sum +
              (statuses[s.id] === 'done'
                ? itemOf(prep[s.id])!.blob.size
                : (itemOf(prep[s.id])!.blob.size * (progress[s.id] ?? 0)) / 100),
            0,
          ) /
            batchBytes) *
            100,
        )
      : 0

  const startUpload = async () => {
    if (uploading || preparing || uploadable.length === 0 || overQuota) return
    setUploading(true)
    const inputs: PhotoInput[] = uploadable.map((s) => itemToPhotoInput(itemOf(prep[s.id])!, ''))
    let success = 0
    let failed = 0
    let stopped = false
    let next = 0

    const runOne = async (i: number) => {
      const s = uploadable[i]
      const it = itemOf(prep[s.id])!
      setStatuses((prev) => ({ ...prev, [s.id]: 'uploading' }))
      try {
        const result = await uploadPhoto(it.blob, `${it.title || 'photo'}.${it.ext}`, (loaded, total) => {
          const pct = total > 0 ? Math.min(99, Math.floor((loaded / total) * 100)) : 0
          setProgress((prev) => (prev[s.id] === pct ? prev : { ...prev, [s.id]: pct }))
        })
        inputs[i] = itemToPhotoInput(it, result.url)
        success++
        setProgress((prev) => ({ ...prev, [s.id]: 100 }))
        setStatuses((prev) => ({ ...prev, [s.id]: 'done' }))
      } catch (e) {
        if (e instanceof QuotaExceededError) {
          // 并发下可能多张同时撞额度，只在第一次停下时提示
          if (!stopped) toast(tr('up.quotaDone', { size: formatBytes(e.remainingBytes), n: success }), 'error')
          setStatuses((prev) => ({ ...prev, [s.id]: 'skipped' }))
          stopped = true
        } else if (e instanceof ScopeMissingError) {
          if (!stopped) toast(tr('up.scopeMissing'), 'error')
          setStatuses((prev) => ({ ...prev, [s.id]: 'skipped' }))
          stopped = true
        } else {
          failed++
          setStatuses((prev) => ({ ...prev, [s.id]: 'error' }))
        }
      }
    }

    /* 固定 N 路并发：worker 从同一游标领任务；触发停止后不再派发，在飞的让其传完 */
    const worker = async () => {
      while (!stopped) {
        const i = next
        if (i >= uploadable.length) return
        next++
        await runOne(i)
      }
    }
    await Promise.all(Array.from({ length: Math.min(UPLOAD_CONCURRENCY, uploadable.length) }, worker))

    /* 停止后未派发的项补标 skipped，与逐张停止时的状态一致 */
    if (stopped) {
      setStatuses((prev) => {
        const nextStatuses = { ...prev }
        for (const s of uploadable) {
          const st = nextStatuses[s.id]
          if (st !== 'done' && st !== 'error' && st !== 'skipped') nextStatuses[s.id] = 'skipped'
        }
        return nextStatuses
      })
    }

    let saved = false
    if (success > 0) {
      try {
        /* 服务端入库（D1 记录）；成功后本地镜像同步，删除/编辑对其他设备即时可见 */
        await addPhotos(
          inputs.filter((p) => p.url !== ''),
          albumId,
        )
        saved = true
        toast(failed > 0 ? tr('up.partial', { n: success, m: failed }) : tr('up.done', { n: success }))
        /* 结算已在各上传完成后发生，这里取一次最新额度刷新展示 */
        fetchStorageQuota()
          .then((q) => {
            setQuota(q)
            setQuotaState('ok')
          })
          .catch(() => {})
      } catch (e) {
        toast(e instanceof Error && e.message ? e.message : tr('err.saveFail'), 'error')
      }
    } else if (failed > 0) {
      toast(tr('up.allFail'), 'error')
    }

    setUploading(false)
    /* 全部成功则自动关闭；有失败的留在弹窗里供查看/重试 */
    if (saved && failed === 0 && !stopped) {
      setTimeout(() => closeUpload(), 700)
    }
  }

  const quotaLine =
    quotaState === 'ok' && quota
      ? `${t('up.quotaLine', { used: formatBytes(quota.used_bytes), total: formatBytes(quota.quota_bytes) })} · ${t('up.quotaFree', { free: formatBytes(quota.remaining_bytes) })}`
      : null

  return (
    <Modal open={open} onClose={close} title={t('up.title')} width={560}>
      {/* 存储空间用量 */}
      <div className="up-quota">
        <span className="up-quota-icon">
          <Database size={16} weight="fill" />
        </span>
        <div className="up-quota-main">
          {quotaState === 'ok' && quota ? (
            <>
              <span className="up-quota-line">{quotaLine}</span>
              <span className="up-quota-bar" aria-hidden="true">
                <i style={{ width: `${Math.min(100, (quota.used_bytes / quota.quota_bytes) * 100)}%` }} />
              </span>
            </>
          ) : quotaState === 'loading' ? (
            <span className="up-quota-line muted">{t('nav.storageLoading')}</span>
          ) : quotaState === 'scope' ? (
            <button className="up-quota-action" onClick={() => void beginLogin()}>
              {t('nav.storageScope')}
            </button>
          ) : (
            <span className="up-quota-line muted">{t('nav.storageError')}</span>
          )}
        </div>
        <a className="up-quota-manage" href={oauthCreditsUrl} target="_blank" rel="noreferrer">
          {t('nav.manage')}
          <ArrowSquareOut size={11} />
        </a>
      </div>

      {/* 压缩开关 */}
      <div className="switch-row up-switch">
        <span className="switch-label">
          <Camera size={15} weight={compress ? 'fill' : 'regular'} />
          {t('up.compress')}
        </span>
        <button
          type="button"
          className="switch"
          role="switch"
          aria-checked={compress}
          data-on={compress}
          onClick={toggleCompress}
          disabled={uploading}
          aria-label={t('up.compress')}
        />
      </div>
      <small className="field-hint">{t('up.compressHint')}</small>

      {/* 选图区 */}
      {selected.length === 0 ? (
        <div className="up-empty">
          <Camera size={30} />
          <span>{t('up.emptyHint')}</span>
          <button type="button" className="btn btn-primary" onClick={() => void pickImages().then(addFiles)}>
            <Plus size={15} weight="bold" />
            {t('up.add')}
          </button>
        </div>
      ) : (
        <>
          <div className="up-grid" ref={gridRef}>
            {selected.map((s) => {
              const result = prep[s.id]
              const it = itemOf(result)
              const status = statuses[s.id] ?? 'idle'
              const tooLarge = !!it && it.blob.size > limitFor(s.file)
              const isVideo = s.file.type.toLowerCase() === 'video/mp4'
              return (
                <div key={s.id} ref={setThumbRef(s.id)} className="up-thumb" data-status={status}>
                  <Thumb src={previews[s.id]} alt={it?.title ?? s.file.name} isVideo={isVideo} />
                  <button
                    type="button"
                    className="up-thumb-remove"
                    onClick={() => removeSelected(s.id)}
                    aria-label={t('up.remove')}
                    disabled={uploading}
                  >
                    <X size={13} weight="bold" />
                  </button>
                  {!it && !preparing && (
                    <span className="up-thumb-badge err">
                      {result && !result.ok && result.reason === 'tooLong'
                        ? t('up.videoTooLong', { n: VIDEO_MAX_SECONDS })
                        : t('up.unreadable')}
                    </span>
                  )}
                  {tooLarge && (
                    <span className="up-thumb-badge err">
                      {isVideo ? t('up.overLimitVideo') : t('up.overLimit')}
                    </span>
                  )}
                  {status === 'uploading' && (
                    <>
                      <span className="up-thumb-state pct">{progress[s.id] ?? 0}%</span>
                      <span className="up-progress" aria-hidden="true">
                        <i style={{ width: `${progress[s.id] ?? 0}%` }} />
                      </span>
                    </>
                  )}
                  {status === 'done' && (
                    <span className="up-thumb-state ok">
                      <Check size={20} weight="bold" />
                    </span>
                  )}
                  {status === 'error' && (
                    <span className="up-thumb-state err">
                      <X size={20} weight="bold" />
                    </span>
                  )}
                  {it && (
                    <span className="up-thumb-meta">
                      <span>{formatBytes(it.blob.size)}</span>
                    </span>
                  )}
                </div>
              )
            })}
          </div>
          <button type="button" className="btn btn-ghost up-add-more" onClick={() => void pickImages().then(addFiles)} disabled={uploading}>
            <Plus size={14} weight="bold" />
            {t('up.addMore')}
          </button>
        </>
      )}

      {/* 汇总与动作 */}
      <div className="up-summary">
        {selected.length > 0 && (
          <span>
            {t('up.selected', { n: uploadable.length, size: formatBytes(totalBytes) })}
            {preparing ? ` · ${t('up.preparing')}` : ''}
          </span>
        )}
        {uploading && batch.length > 0 && (
          <span className="up-overall">
            <span className="up-overall-bar" aria-hidden="true">
              <i style={{ width: `${overallPct}%` }} />
            </span>
            {t('up.overall', { n: doneCount, m: batch.length, p: overallPct })}
          </span>
        )}
        {overQuota && (
          <span className="up-warn">
            <Warning size={13} weight="fill" />
            {t('up.overQuota', { size: formatBytes(totalBytes - quota!.remaining_bytes) })}
          </span>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="btn btn-ghost" onClick={close} disabled={uploading}>
          {t('form.cancel')}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void startUpload()}
          disabled={uploading || preparing || uploadable.length === 0 || overQuota}
        >
          {uploading ? (
            <>
              <SpinnerGap size={15} className="spin" />
              {t('up.uploading')}
            </>
          ) : (
            t('up.start')
          )}
        </button>
      </div>
    </Modal>
  )
}
