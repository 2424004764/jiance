import { useReducedMotion, motion } from 'motion/react'
import { Clock, Heart } from '@phosphor-icons/react'
import type { Photo } from '../lib/types'
import { relativeTime } from '../lib/format'
import { useGallery } from '../lib/store'

interface Props {
  photo: Photo
  delay?: number
  onOpen: () => void
}

export function PhotoCard({ photo, delay = 0, onOpen }: Props) {
  const toggleLike = useGallery((s) => s.toggleLike)
  const reduce = useReducedMotion()

  return (
    <motion.figure
      className="photo-card"
      initial={reduce ? false : { opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className="photo-media"
        role="button"
        tabIndex={0}
        aria-label={`查看照片 ${photo.title}`}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen()
          }
        }}
      >
        <img
          src={photo.url}
          alt={photo.title}
          loading="lazy"
          style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
        />
        <div className="photo-overlay">
          <figcaption className="photo-caption">
            <span className="photo-title">{photo.title}</span>
            <span className="photo-meta">
              <Clock size={13} />
              {relativeTime(photo.createdAt)}
            </span>
          </figcaption>
        </div>
      </div>
      <button
        className={`like-btn${photo.liked ? ' liked' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          toggleLike(photo.id)
        }}
        aria-label={photo.liked ? '取消点赞' : '点赞'}
        aria-pressed={photo.liked}
      >
        <Heart size={17} weight={photo.liked ? 'fill' : 'regular'} />
        {photo.likes > 0 && <span>{photo.likes}</span>}
      </button>
    </motion.figure>
  )
}
