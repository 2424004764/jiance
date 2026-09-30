import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { Aperture, LinkBreak } from '@phosphor-icons/react'
import { albumPhotos, useGallery } from '../lib/store'
import { isUnlocked, markUnlocked } from '../lib/unlocked'
import { PageTransition } from '../components/PageTransition'
import { MasonryGrid } from '../components/MasonryGrid'
import { Lightbox } from '../components/Lightbox'
import { PasswordGate } from '../components/PasswordGate'
import { EmptyState } from '../components/EmptyState'

export function SharedAlbumPage() {
  const { shareId } = useParams()
  const album = useGallery((s) => s.albums.find((a) => a.shareId === shareId))
  const photos = useGallery((s) => s.photos)
  const [unlocked, setUnlocked] = useState(() => (shareId ? isUnlocked(shareId) : false))
  const [lbIndex, setLbIndex] = useState<number | null>(null)

  const list = useMemo(
    () => (album ? albumPhotos(photos, album.id) : []),
    [photos, album],
  )

  useEffect(() => {
    document.title = album ? `${album.name} · 分享自拾光集` : '分享不存在 · 拾光集'
  }, [album])

  if (!album) {
    return (
      <PageTransition>
        <EmptyState
          icon={<LinkBreak size={30} weight="thin" />}
          title="分享不存在"
          desc="链接可能已失效，或相册被重新设置了分享"
          action={
            <Link className="btn btn-ghost" to="/">
              回到拾光集
            </Link>
          }
        />
      </PageTransition>
    )
  }

  if (album.password && !unlocked) {
    return (
      <PasswordGate
        albumName={album.name}
        onSubmit={(pw) => {
          if (pw === album.password) {
            if (shareId) markUnlocked(shareId)
            setUnlocked(true)
            return true
          }
          return false
        }}
      />
    )
  }

  return (
    <PageTransition>
      <header className="page-hero shared-hero">
        <span className="shared-badge">
          <Aperture size={13} weight="bold" />
          分享相册
        </span>
        <h1>{album.name}</h1>
        {album.description && <p className="detail-desc">{album.description}</p>}
        <p className="hero-meta">{list.length} 张照片，来自拾光集</p>
      </header>

      <MasonryGrid photos={list} onOpen={setLbIndex} />

      <footer className="shared-footer">
        <span className="brand-mark small">
          <Aperture size={15} weight="bold" />
        </span>
        由拾光集整理分享
      </footer>

      <AnimatePresence>
        {lbIndex !== null && (
          <Lightbox
            photos={list}
            index={lbIndex}
            onClose={() => setLbIndex(null)}
            onNavigate={setLbIndex}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  )
}
