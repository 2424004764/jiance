import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Lock, ImageSquare, PushPin } from '@phosphor-icons/react'
import type { Album, Photo } from '../lib/types'
import { relativeTime } from '../lib/format'
import { useT } from '../lib/i18n'
import { LoadingImage } from './LoadingImage'

interface Props {
  album: Album
  covers: Photo[]
  delay?: number
}

export function AlbumCard({ album, covers, delay = 0 }: Props) {
  const { t } = useT()
  const reduce = useReducedMotion()

  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      <Link to={`/album/${album.id}`} className="album-card">
        <div className="album-collage">
          {[0, 1, 2, 3].map((i) =>
            covers[i] ? (
              <LoadingImage key={i} src={covers[i].url} alt="" loading="lazy" />
            ) : (
              <div key={i} className="tile-empty">
                <ImageSquare size={20} />
              </div>
            ),
          )}
          {album.password && (
            <span className="album-lock">
              <Lock size={12} weight="fill" />
              {t('detail.locked')}
            </span>
          )}
          {album.type === 'wall' && (
            <span className="album-type">
              <PushPin size={11} weight="fill" />
              {t('form.typeWall')}
            </span>
          )}
        </div>
        <div className="album-info">
          <h3>{album.name}</h3>
          <p>
            {t('detail.meta', { n: album.photoIds.length, t: relativeTime(album.updatedAt) })}
          </p>
        </div>
      </Link>
    </motion.div>
  )
}
