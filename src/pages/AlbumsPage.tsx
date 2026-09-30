import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, FolderPlus } from '@phosphor-icons/react'
import { useGallery } from '../lib/store'
import { relativeTime } from '../lib/format'
import { PageTransition } from '../components/PageTransition'
import { AlbumCard } from '../components/AlbumCard'
import { AlbumFormModal } from '../components/AlbumFormModal'
import { EmptyState } from '../components/EmptyState'
import type { Photo } from '../lib/types'

export function AlbumsPage() {
  const albums = useGallery((s) => s.albums)
  const photos = useGallery((s) => s.photos)
  const [formOpen, setFormOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    document.title = '相册集 · 拾光集'
  }, [])

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      setFormOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const items = useMemo(() => {
    const byId = new Map<string, Photo>(photos.map((p) => [p.id, p]))
    return [...albums]
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((album) => ({
        album,
        covers: album.photoIds
          .slice(0, 4)
          .map((id) => byId.get(id))
          .filter((p): p is Photo => !!p),
      }))
  }, [albums, photos])

  const photoCount = photos.filter((p) => p.albumId !== null).length

  return (
    <PageTransition>
      <header className="page-hero page-hero-row">
        <div>
          <h1>
            相册<span className="grad-text">集</span>
          </h1>
          <p className="hero-meta">
            {albums.length} 个相册，收录了 {photoCount} 张照片
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
          <Plus size={16} weight="bold" />
          新建相册
        </button>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon={<FolderPlus size={30} weight="thin" />}
          title="创建你的第一个相册"
          desc="把照片整理成集，一键生成分享链接，还能加上密码"
          action={
            <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
              <Plus size={16} weight="bold" />
              新建相册
            </button>
          }
        />
      ) : (
        <div className="album-grid">
          {items.map((item, i) => (
            <AlbumCard
              key={item.album.id}
              album={item.album}
              covers={item.covers}
              delay={(i % 6) * 0.06}
            />
          ))}
        </div>
      )}

      <AlbumFormModal open={formOpen} onClose={() => setFormOpen(false)} />
    </PageTransition>
  )
}
