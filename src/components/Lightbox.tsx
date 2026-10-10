import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X, CaretLeft, CaretRight, Heart, TrashSimple, Star, PencilSimple } from '@phosphor-icons/react'
import type { Variants } from 'motion/react'
import type { Photo } from '../lib/types'
import { formatDate, formatDuration } from '../lib/format'
import { useGallery } from '../lib/store'
import { useT } from '../lib/i18n'

/** custom = 切换方向（1 前进 / -1 后退），决定滑入滑出方向 */
const figureVariants: Variants = {
  enter: (c: number) => ({ opacity: 0, x: c * 90, scale: 0.97 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (c: number) => ({ opacity: 0, x: -c * 90, scale: 0.97 }),
  /* 降级路径：不做动画，但必须可见 */
  static: { opacity: 1, x: 0, scale: 1 },
}

interface Props {
  photos: Photo[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
  /** 提供时在Caption栏显示删除按钮（相册详情场景） */
  onRemove?: () => void
  /** 提供时改走外部点赞（分享页访客，计数经服务端）；缺省用当前账号本地画廊 */
  onToggleLike?: (photoId: string) => void
  /** false = 不渲染点赞按钮（分享页未登录访客） */
  showLike?: boolean
  /** true = 属主视角：开放标题编辑与收藏星标（私人空间页面） */
  owner?: boolean
}

/** 单张图：加载中显示 spinner，加载完成淡入；每张图独立维护加载态（切换时互不影响） */
function LbImage({ photo, onSwipe }: { photo: Photo; onSwipe: (dir: number) => void }) {
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement | null>(null)

  // 浏览器缓存命中时不会触发 onLoad，挂载后立即核对一次
  useLayoutEffect(() => {
    if (imgRef.current?.complete) setLoaded(true)
  }, [photo.id])

  return (
    <>
      {!loaded && <div className="lb-spinner" aria-hidden="true" />}
      <motion.img
        ref={imgRef}
        src={photo.url}
        alt={photo.title}
        className={loaded ? 'is-loaded' : ''}
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
        drag="x"
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.22}
        onDragEnd={(_, info) => {
          if (info.offset.x < -72) onSwipe(1)
          else if (info.offset.x > 72) onSwipe(-1)
        }}
      />
    </>
  )
}

/** 视频：原生控件播放，不参与拖拽翻页（避免与进度条手势打架） */
function LbVideo({ photo }: { photo: Photo }) {
  const [ready, setReady] = useState(false)
  return (
    <div className="lb-video-wrap">
      {!ready && <div className="lb-spinner" aria-hidden="true" />}
      <video
        className={`lb-video${ready ? ' is-ready' : ''}`}
        src={photo.url}
        controls
        autoPlay
        playsInline
        onLoadedData={() => setReady(true)}
        onError={() => setReady(true)}
      />
    </div>
  )
}

export function Lightbox({ photos, index, onClose, onNavigate, onRemove, onToggleLike, showLike = true, owner = false }: Props) {
  const photo = photos[index]
  const storeToggleLike = useGallery((s) => s.toggleLike)
  const updatePhoto = useGallery((s) => s.updatePhoto)
  const toggleLike = onToggleLike ?? ((id: string) => storeToggleLike(id))
  const { t } = useT()
  const [direction, setDirection] = useState(0)
  const reduce = useReducedMotion()
  /** 标题行内编辑态（仅 owner） */
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const titleInputRef = useRef<HTMLInputElement | null>(null)
  const isVideo = photo?.kind === 'video'

  const go = (d: number) => {
    setDirection(d)
    onNavigate((index + d + photos.length) % photos.length)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 编辑标题时 Esc 先退出编辑，不关灯箱
        if (editingTitle) {
          setEditingTitle(false)
          return
        }
        onClose()
      }
      // 视频/输入框聚焦时方向键归控件本身，不翻页
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'VIDEO' || tag === 'INPUT') return
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, photos.length, editingTitle])

  // 切换照片时退出编辑态
  useEffect(() => {
    setEditingTitle(false)
  }, [photo?.id])

  useEffect(() => {
    if (editingTitle) titleInputRef.current?.select()
  }, [editingTitle])

  if (!photo) return null

  const commitTitle = () => {
    setEditingTitle(false)
    const next = titleDraft.trim().slice(0, 300)
    if (next && next !== photo.title) updatePhoto(photo.id, { title: next })
  }

  return (
    <motion.div
      className="lightbox-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={t('lb.view', { title: photo.title })}
    >
      <button className="lightbox-close btn-icon" onClick={onClose} aria-label={t('lb.close')}>
        <X size={18} />
      </button>

      {photos.length > 1 && (
        <>
          <button
            className="lightbox-nav lightbox-prev btn-icon"
            onClick={(e) => {
              e.stopPropagation()
              go(-1)
            }}
            aria-label={t('lb.prev')}
          >
            <CaretLeft size={20} />
          </button>
          <button
            className="lightbox-nav lightbox-next btn-icon"
            onClick={(e) => {
              e.stopPropagation()
              go(1)
            }}
            aria-label={t('lb.next')}
          >
            <CaretRight size={20} />
          </button>
        </>
      )}

      <AnimatePresence initial={false} custom={direction}>
        <motion.figure
          key={photo.id}
          className="lightbox-figure"
          custom={direction}
          initial={reduce ? 'static' : 'enter'}
          animate={reduce ? 'static' : 'center'}
          exit={reduce ? 'static' : 'exit'}
          variants={figureVariants}
          transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
        >
          {isVideo ? <LbVideo photo={photo} /> : <LbImage photo={photo} onSwipe={(d) => go(d)} />}
        </motion.figure>
      </AnimatePresence>

      <motion.div
        className="lightbox-caption glass"
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={{ delay: 0.1 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lb-info">
          {editingTitle ? (
            <input
              ref={titleInputRef}
              className="lb-title-input"
              value={titleDraft}
              maxLength={300}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                // Esc 在全局监听里处理（退出编辑）
              }}
              aria-label={t('lb.editTitle')}
            />
          ) : (
            <span
              className={`lb-title${owner ? ' editable' : ''}`}
              {...(owner
                ? {
                    role: 'button',
                    tabIndex: 0,
                    title: t('lb.editTitle'),
                    onClick: () => {
                      setTitleDraft(photo.title)
                      setEditingTitle(true)
                    },
                    onKeyDown: (e: React.KeyboardEvent) => {
                      if (e.key === 'Enter') {
                        setTitleDraft(photo.title)
                        setEditingTitle(true)
                      }
                    },
                  }
                : {})}
            >
              {photo.title || t('photo.untitled')}
              {owner && <PencilSimple size={12} aria-hidden="true" />}
            </span>
          )}
          <span className="lb-meta">
            {formatDate(photo.createdAt)}
            {isVideo && photo.duration ? (
              <>
                <i />
                {formatDuration(photo.duration)}
              </>
            ) : null}
            <i />
            {index + 1} / {photos.length}
          </span>
        </div>
        {owner && (
          <button
            className={`star-btn lb-star${photo.starred ? ' starred' : ''}`}
            onClick={() => updatePhoto(photo.id, { starred: !photo.starred })}
            aria-label={photo.starred ? t('lb.unstar') : t('lb.star')}
            aria-pressed={!!photo.starred}
            title={photo.starred ? t('lb.unstar') : t('lb.star')}
          >
            <Star size={17} weight={photo.starred ? 'fill' : 'regular'} />
          </button>
        )}
        {showLike && (
          <button
            className={`like-btn lb-like${photo.liked ? ' liked' : ''}`}
            onClick={() => toggleLike(photo.id)}
            aria-label={photo.liked ? t('lb.unlike') : t('lb.like')}
            aria-pressed={photo.liked}
          >
            <Heart size={18} weight={photo.liked ? 'fill' : 'regular'} />
            {photo.likes > 0 && <span>{photo.likes}</span>}
          </button>
        )}
        {onRemove && (
          <button className="btn-icon lb-remove danger" onClick={onRemove} aria-label={t('lb.remove')}>
            <TrashSimple size={17} />
          </button>
        )}
      </motion.div>
    </motion.div>
  )
}
