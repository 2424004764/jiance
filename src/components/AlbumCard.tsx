import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'motion/react'
import { Lock, ImageSquare } from '@phosphor-icons/react'
import type { Album, Photo } from '../lib/types'
import { relativeTime } from '../lib/format'

interface Props {
  album: Album
  covers: Photo[]
  delay?: number
}

export function AlbumCard({ album, covers, delay = 0 }: Props) {
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
              <img key={i} src={covers[i].url} alt="" loading="lazy" />
            ) : (
              <div key={i} className="tile-empty">
                <ImageSquare size={20} />
              </div>
            ),
          )}
          {album.password && (
            <span className="album-lock">
              <Lock size={12} weight="fill" />
              加密
            </span>
          )}
        </div>
        <div className="album-info">
          <h3>{album.name}</h3>
          <p>
            {album.photoIds.length} 张照片 · {relativeTime(album.updatedAt)}更新
          </p>
        </div>
      </Link>
    </motion.div>
  )
}
