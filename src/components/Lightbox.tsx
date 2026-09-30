import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { X, CaretLeft, CaretRight, Heart, TrashSimple } from '@phosphor-icons/react'
import type { Variants } from 'motion/react'
import type { Photo } from '../lib/types'
import { formatDate } from '../lib/format'
import { useGallery } from '../lib/store'

/** custom = 切换方向（1 前进 / -1 后退），决定滑入滑出方向 */
const figureVariants: Variants = {
  enter: (c: number) => ({ opacity: 0, x: c * 90, scale: 0.97 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (c: number) => ({ opacity: 0, x: -c * 90, scale: 0.97 }),
  static: { opacity: 0 },
}

interface Props {
  photos: Photo[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
  /** 提供时在Caption栏显示删除按钮（相册详情场景） */
  onRemove?: () => void
}

export function Lightbox({ photos, index, onClose, onNavigate, onRemove }: Props) {
  const photo = photos[index]
  const toggleLike = useGallery((s) => s.toggleLike)
  const [direction, setDirection] = useState(0)
  const reduce = useReducedMotion()

  const go = (d: number) => {
    setDirection(d)
    onNavigate((index + d + photos.length) % photos.length)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
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
  }, [index, photos.length])

  if (!photo) return null

  return (
    <motion.div
      className="lightbox-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`查看照片 ${photo.title}`}
    >
      <button className="lightbox-close btn-icon" onClick={onClose} aria-label="关闭">
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
            aria-label="上一张"
          >
            <CaretLeft size={20} />
          </button>
          <button
            className="lightbox-nav lightbox-next btn-icon"
            onClick={(e) => {
              e.stopPropagation()
              go(1)
            }}
            aria-label="下一张"
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
          <motion.img
            src={photo.url}
            alt={photo.title}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.22}
            onDragEnd={(_, info) => {
              if (info.offset.x < -72) go(1)
              else if (info.offset.x > 72) go(-1)
            }}
          />
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
          <span className="lb-title">{photo.title}</span>
          <span className="lb-meta">
            {formatDate(photo.createdAt)}
            <i />
            {index + 1} / {photos.length}
          </span>
        </div>
        <button
          className={`like-btn lb-like${photo.liked ? ' liked' : ''}`}
          onClick={() => toggleLike(photo.id)}
          aria-label={photo.liked ? '取消点赞' : '点赞'}
          aria-pressed={photo.liked}
        >
          <Heart size={18} weight={photo.liked ? 'fill' : 'regular'} />
          {photo.likes > 0 && <span>{photo.likes}</span>}
        </button>
        {onRemove && (
          <button className="btn-icon lb-remove danger" onClick={onRemove} aria-label="删除这张照片">
            <TrashSimple size={17} />
          </button>
        )}
      </motion.div>
    </motion.div>
  )
}
