import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, FolderPlus, ImagesSquare, SignIn } from '@phosphor-icons/react'
import { useGallery, useToasts } from '../lib/store'
import { useGallerySyncStatus } from '../lib/gallerySync'
import { useAuth } from '../lib/auth'
import { beginLogin, oauthConfigured } from '../lib/oauth'
import { PageTransition } from '../components/PageTransition'
import { AlbumCard } from '../components/AlbumCard'
import { AlbumFormModal } from '../components/AlbumFormModal'
import { EmptyState } from '../components/EmptyState'
import { SyncFallback } from '../components/SyncFallback'
import type { Photo } from '../lib/types'
import { useT } from '../lib/i18n'

export function AlbumsPage() {
  const albums = useGallery((s) => s.albums)
  const photos = useGallery((s) => s.photos)
  const user = useAuth((s) => s.user)
  const syncStatus = useGallerySyncStatus((s) => s.status)
  const toast = useToasts((s) => s.toast)
  const { t, lang } = useT()
  const [formOpen, setFormOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    document.title = `${t('nav.albums')} · ${t('brand')}`
  }, [t, lang])

  useEffect(() => {
    if (searchParams.get('new') === '1') {
      // 从导航进入的新建意图；未登录时保持弹窗关闭，由按钮给出提示
      if (user) setFormOpen(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams, user])

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

  const tryCreate = () => {
    if (!user) {
      toast(t('toast.loginToCreate'), 'error')
      return
    }
    setFormOpen(true)
  }

  const startLogin = () => {
    if (!oauthConfigured) {
      toast(t('toast.needConfig'), 'error')
      return
    }
    void beginLogin()
  }

  const photoCount = photos.filter((p) => p.albumId !== null).length

  /* 相册数据为账号私有：未登录不展示任何内容，引导登录 */
  if (!user) {
    return (
      <PageTransition>
        <EmptyState
          icon={<ImagesSquare size={30} weight="thin" />}
          title={t('albums.loginTitle')}
          desc={t('albums.loginDesc')}
          action={
            <button className="btn btn-primary" onClick={startLogin}>
              <SignIn size={16} weight="bold" />
              {t('landing.cta')}
            </button>
          }
        />
      </PageTransition>
    )
  }

  /* 云端首次同步未完成且本地为空：先 loading / 失败重试，避免闪「还没有相册」 */
  if (items.length === 0 && syncStatus !== 'ready') {
    return (
      <PageTransition>
        <SyncFallback />
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <header className="page-hero page-hero-row">
        <div>
          <h1>{t('detail.back')}</h1>
          <p className="hero-meta">{t('albums.meta', { n: albums.length, m: photoCount })}</p>
        </div>
        <button className="btn btn-primary" onClick={tryCreate}>
          <Plus size={16} weight="bold" />
          {t('nav.newAlbum')}
        </button>
      </header>

      {items.length === 0 ? (
        <EmptyState
          icon={<FolderPlus size={30} weight="thin" />}
          title={t('albums.emptyTitle')}
          desc={t('albums.emptyDesc')}
          action={
            <button className="btn btn-primary" onClick={tryCreate}>
              <Plus size={16} weight="bold" />
              {t('nav.newAlbum')}
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
