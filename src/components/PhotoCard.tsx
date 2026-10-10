import { useReducedMotion, motion } from 'motion/react'
import { Clock, Heart, Check, Play, Star } from '@phosphor-icons/react'
import type { Photo } from '../lib/types'
import { relativeTime, formatDuration } from '../lib/format'
import { useGallery } from '../lib/store'
import { useT } from '../lib/i18n'
import { LoadingImage } from './LoadingImage'

interface Props {
  photo: Photo
  delay?: number
  onOpen: () => void
  /** 多选模式：显示勾选圈，点击切换选中（行为由外部 onOpen 决定） */
  selectMode?: boolean
  /** 多选模式下当前卡片是否已选 */
  selected?: boolean
  /** 提供时改走外部点赞（分享页访客，计数经服务端）；缺省用当前账号本地画廊 */
  onToggleLike?: (photoId: string) => void
  /** false = 不渲染点赞按钮（分享页未登录访客） */
  showLike?: boolean
  /** true = 属主视角：显示收藏星标（角标常显，悬停可切换） */
  showStar?: boolean
}

export function PhotoCard({
  photo,
  delay = 0,
  onOpen,
  selectMode = false,
  selected = false,
  onToggleLike,
  showLike = true,
  showStar = false,
}: Props) {
  const storeToggleLike = useGallery((s) => s.toggleLike)
  const toggleLike = onToggleLike ?? ((id: string) => storeToggleLike(id))
  const updatePhoto = useGallery((s) => s.updatePhoto)
  const { t } = useT()
  const reduce = useReducedMotion()
  const isVideo = photo.kind === 'video'

  return (
    <motion.figure
      className={`photo-card${selectMode ? ' selectable' : ''}${selected ? ' is-selected' : ''}`}
      initial={reduce ? false : { opacity: 0, y: 26 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.12 }}
      transition={{ duration: 0.55, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <div
        className="photo-media"
        role="button"
        tabIndex={0}
        aria-label={
          selectMode ? t('photo.selectAria', { title: photo.title }) : t('lb.view', { title: photo.title })
        }
        aria-pressed={selectMode ? selected : undefined}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onOpen()
          }
        }}
      >
        {isVideo ? (
          /* #t=0.1 让 Safari 也稳定渲染首帧而非空白 */
          <video
            className="pc-video"
            src={`${photo.url}#t=0.1`}
            preload="metadata"
            muted
            playsInline
            tabIndex={-1}
            style={{ aspectRatio: `${photo.width || 16} / ${photo.height || 9}` }}
          />
        ) : (
          <LoadingImage
            src={photo.url}
            alt={photo.title}
            loading="lazy"
            style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
          />
        )}
        {isVideo && (
          <span className="video-badge" aria-hidden="true">
            <Play size={11} weight="fill" />
            {photo.duration ? formatDuration(photo.duration) : '视频'}
          </span>
        )}
        {showStar && photo.starred && !selectMode && (
          <span className="star-badge" aria-label={t('lb.starred')}>
            <Star size={12} weight="fill" />
          </span>
        )}
        {selectMode && (
          <span className={`photo-check${selected ? ' is-on' : ''}`} aria-hidden="true">
            <Check size={14} weight="bold" />
          </span>
        )}
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
      {showStar && !selectMode && (
        <button
          className={`star-btn${photo.starred ? ' starred' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            updatePhoto(photo.id, { starred: !photo.starred })
          }}
          aria-label={photo.starred ? t('lb.unstar') : t('lb.star')}
          aria-pressed={!!photo.starred}
          title={photo.starred ? t('lb.unstar') : t('lb.star')}
        >
          <Star size={16} weight={photo.starred ? 'fill' : 'regular'} />
        </button>
      )}
      {showLike && !selectMode && (
        <button
          className={`like-btn${photo.liked ? ' liked' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            toggleLike(photo.id)
          }}
          aria-label={photo.liked ? t('lb.unlike') : t('lb.like')}
          aria-pressed={photo.liked}
        >
          <Heart size={17} weight={photo.liked ? 'fill' : 'regular'} />
          {photo.likes > 0 && <span>{photo.likes}</span>}
        </button>
      )}
    </motion.figure>
  )
}
