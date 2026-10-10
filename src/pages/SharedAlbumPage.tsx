import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import { Aperture, ArrowClockwise, DownloadSimple, LinkBreak, WarningCircle } from '@phosphor-icons/react'
import { albumPhotos, useGallery, useToasts } from '../lib/store'
import { isUnlocked, markUnlocked } from '../lib/unlocked'
import { useAuth } from '../lib/auth'
import { getLikedPhotoIds, saveLikedPhotoIds } from '../lib/shareLikes'
import { exportWallImage } from '../lib/wallExport'
import type { Photo, WallConfig } from '../lib/types'
import { PageTransition } from '../components/PageTransition'
import { MasonryGrid } from '../components/MasonryGrid'
import { PhotoWall } from '../components/PhotoWall'
import { Lightbox } from '../components/Lightbox'
import { PasswordGate } from '../components/PasswordGate'
import { EmptyState } from '../components/EmptyState'
import { tr, useT } from '../lib/i18n'

/* ============================================================
   分享页：任何拿到链接的人都能看（无需登录）
   - 属主本机已登录：直接读本地画廊（含离线缓存，最快路径）
   - 其余情况（未登录 / 其他账号 / 换设备）：走公开接口 /api/share/:id
   ============================================================ */

/** 公开接口返回的相册元信息（服务端已剔除密码等私有字段） */
interface SharedAlbumInfo {
  name: string
  description: string
  createdAt: number
  type?: 'grid' | 'wall'
  wall?: WallConfig
}

/** 校验公开接口返回的照片墙配置（结构不符时忽略，按平铺渲染） */
function asWall(raw: unknown): WallConfig | undefined {
  const rec = asRecord(raw)
  if (!rec || typeof rec.background !== 'string' || !Array.isArray(rec.items)) return undefined
  const items = []
  for (const it of rec.items) {
    const r = asRecord(it)
    if (!r || typeof r.photoId !== 'string') continue
    const n = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
    items.push({ photoId: r.photoId, x: n(r.x, 50), y: n(r.y, 50), rot: n(r.rot, 0), w: n(r.w, 20) })
  }
  return { background: rec.background.slice(0, 32), items }
}

type RemoteShare =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'notfound' }
  | { state: 'locked'; name: string }
  | { state: 'ok'; album: SharedAlbumInfo; photos: Photo[] }

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function asPhotos(raw: unknown): Photo[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((v, i): Photo | null => {
      const rec = asRecord(v)
      if (!rec) return null
      const url = typeof rec.url === 'string' ? rec.url : ''
      if (!(url.startsWith('/f/') || url.startsWith('data:image/'))) return null
      return {
        id: typeof rec.id === 'string' ? rec.id : `remote-${i}`,
        url,
        width: typeof rec.width === 'number' ? rec.width : 0,
        height: typeof rec.height === 'number' ? rec.height : 0,
        title: typeof rec.title === 'string' ? rec.title : '',
        createdAt: typeof rec.createdAt === 'number' ? rec.createdAt : 0,
        albumId: null,
        likes: typeof rec.likes === 'number' ? rec.likes : 0,
        // 服务端只回总数；「我是否点过」按浏览器本地记录还原
        liked: false,
      }
    })
    .filter((p): p is Photo => p !== null)
    .sort((a, b) => b.createdAt - a.createdAt)
}

/** 用本地记忆的点赞记录还原访客的 liked 态 */
function applyLocalLiked(photos: Photo[], shareId: string): Photo[] {
  const liked = getLikedPhotoIds(shareId)
  if (!liked.size) return photos
  return photos.map((p) => (liked.has(p.id) && !p.liked ? { ...p, liked: true } : p))
}

function hydrateRemote(r: RemoteShare, shareId: string): RemoteShare {
  return r.state === 'ok' ? { ...r, photos: applyLocalLiked(r.photos, shareId) } : r
}

/** 解析公开接口响应体；不符合预期返回 null（按加载失败处理） */
function parseShareBody(data: unknown): RemoteShare | null {
  const rec = asRecord(data)
  if (!rec) return null
  if (rec.locked === true) {
    const album = asRecord(rec.album)
    return { state: 'locked', name: typeof album?.name === 'string' ? album.name : '' }
  }
  const album = asRecord(rec.album)
  if (!album) return null
  return {
    state: 'ok',
    album: {
      name: typeof album.name === 'string' ? album.name : '',
      description: typeof album.description === 'string' ? album.description : '',
      createdAt: typeof album.createdAt === 'number' ? album.createdAt : 0,
      type: album.type === 'wall' ? 'wall' : 'grid',
      wall: asWall(album.wall),
    },
    photos: asPhotos(rec.photos),
  }
}

async function fetchShare(shareId: string): Promise<RemoteShare> {
  let res: Response
  try {
    res = await fetch(`/api/share/${encodeURIComponent(shareId)}`)
  } catch {
    return { state: 'error' }
  }
  if (res.status === 404) return { state: 'notfound' }
  if (!res.ok) return { state: 'error' }
  return parseShareBody(await res.json().catch(() => null)) ?? { state: 'error' }
}

/** 提交访问密码；通过后返回完整数据 */
async function verifySharePassword(shareId: string, password: string): Promise<RemoteShare | null> {
  let res: Response
  try {
    res = await fetch(`/api/share/${encodeURIComponent(shareId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    })
  } catch {
    return null
  }
  if (!res.ok) return null
  return parseShareBody(await res.json().catch(() => null))
}

export function SharedAlbumPage() {
  const { shareId } = useParams()
  const album = useGallery((s) => s.albums.find((a) => a.shareId === shareId))
  const photos = useGallery((s) => s.photos)
  const { t, lang } = useT()
  const [unlocked, setUnlocked] = useState(() => (shareId ? isUnlocked(shareId) : false))
  const [lbIndex, setLbIndex] = useState<number | null>(null)
  const [remote, setRemote] = useState<RemoteShare>({ state: 'loading' })
  const [retry, setRetry] = useState(0)
  const toast = useToasts((s) => s.toast)
  /** 点赞仅对登录用户开放（属主本地点赞，访客经服务端计数）；未登录访客不渲染按钮 */
  const authed = useAuth((s) => s.user !== null)
  /** 加密相册解锁时的密码，访客点赞需要随请求带给服务端校验 */
  const pwRef = useRef('')

  useEffect(() => {
    if (!shareId || album) return
    let alive = true
    setRemote({ state: 'loading' })
    void fetchShare(shareId).then((r) => {
      if (alive) setRemote(hydrateRemote(r, shareId))
    })
    return () => {
      alive = false
    }
  }, [shareId, album, retry])

  const remoteOk = remote.state === 'ok' ? remote : null
  const list = useMemo(
    () => (album ? albumPhotos(photos, album.id) : remoteOk ? remoteOk.photos : []),
    [photos, album, remoteOk],
  )

  /* 照片墙分享：只读摆放视图 + 访客可导出大图 */
  const wallConfig = album?.wall ?? remoteOk?.album.wall
  const isWall = (album ? album.type === 'wall' : remoteOk?.album.type === 'wall') && !!wallConfig
  const [exporting, setExporting] = useState(false)
  const doExportWall = async () => {
    if (exporting || !wallConfig || list.length === 0) return
    setExporting(true)
    try {
      await exportWallImage(displayName ?? 'photo-wall', wallConfig, list)
      toast(t('wall.exported'))
    } catch {
      toast(t('wall.exportFail'), 'error')
    } finally {
      setExporting(false)
    }
  }

  const displayName =
    album?.name ?? remoteOk?.album.name ?? (remote.state === 'locked' ? remote.name : null)
  const displayDesc = album?.description ?? remoteOk?.album.description ?? ''
  const locked = album
    ? !!album.password && !unlocked
    : remote.state === 'locked' && !unlocked

  useEffect(() => {
    document.title = displayName
      ? `${displayName} · ${t('brand')}`
      : remote.state === 'notfound'
        ? t('shared.notFoundDoc')
        : t('brand')
  }, [displayName, remote.state, t, lang])

  /** 访客点赞：乐观更新 + 服务端计数，失败回滚并提示 */
  const toggleRemoteLike = async (photoId: string): Promise<void> => {
    if (!shareId || remote.state !== 'ok') return
    const prev = remote
    const photo = prev.photos.find((p) => p.id === photoId)
    if (!photo) return
    const liked = !photo.liked
    const delta = liked ? 1 : -1

    const nextLiked = getLikedPhotoIds(shareId)
    if (liked) nextLiked.add(photoId)
    else nextLiked.delete(photoId)
    saveLikedPhotoIds(shareId, nextLiked)
    setRemote({
      ...prev,
      photos: prev.photos.map((p) =>
        p.id === photoId ? { ...p, liked, likes: Math.max(0, p.likes + delta) } : p,
      ),
    })

    try {
      const res = await fetch(`/api/share/${encodeURIComponent(shareId)}/like`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photoId, delta, password: pwRef.current }),
      })
      if (!res.ok) throw new Error(String(res.status))
      const data = (await res.json().catch(() => null)) as { likes?: unknown } | null
      if (typeof data?.likes === 'number') {
        // 服务端计数为权威值（含其他访客的点赞）
        setRemote((s) =>
          s.state === 'ok'
            ? {
                ...s,
                photos: s.photos.map((p) =>
                  p.id === photoId ? { ...p, likes: Math.max(0, data.likes as number) } : p,
                ),
              }
            : s,
        )
      }
    } catch {
      const rollback = getLikedPhotoIds(shareId)
      if (liked) rollback.delete(photoId)
      else rollback.add(photoId)
      saveLikedPhotoIds(shareId, rollback)
      setRemote(prev)
      toast(tr('shared.likeFail'), 'error')
    }
  }

  if (!album && remote.state === 'loading') {
    return (
      <div className="gate-page">
        <div className="gate-card glass auth-card">
          <div className="auth-spinner" role="status" />
          <h1 className="auth-title">{t('shared.loadingTitle')}</h1>
          <p className="auth-sub">{t('shared.loadingSub')}</p>
        </div>
      </div>
    )
  }

  if (!album && remote.state === 'error') {
    return (
      <PageTransition>
        <EmptyState
          icon={<WarningCircle size={30} weight="thin" />}
          title={t('shared.errorTitle')}
          desc={t('shared.errorDesc')}
          action={
            <div className="empty-action-row">
              <button className="btn btn-primary" onClick={() => setRetry((n) => n + 1)}>
                <ArrowClockwise size={15} weight="bold" />
                {t('shared.retry')}
              </button>
              <Link className="btn btn-ghost" to="/">
                {t('shared.home')}
              </Link>
            </div>
          }
        />
      </PageTransition>
    )
  }

  if (!album && remote.state === 'notfound') {
    return (
      <PageTransition>
        <EmptyState
          icon={<LinkBreak size={30} weight="thin" />}
          title={t('shared.notFoundTitle')}
          desc={t('shared.notFoundDesc')}
          action={
            <Link className="btn btn-ghost" to="/">
              {t('shared.home')}
            </Link>
          }
        />
      </PageTransition>
    )
  }

  if (locked) {
    return (
      <PasswordGate
        albumName={displayName ?? ''}
        onSubmit={async (pw) => {
          // 属主本地有数据时直接比对；访客走服务端校验（密码不落前端）
          if (album) {
            if (pw !== album.password) return false
            if (shareId) markUnlocked(shareId)
            setUnlocked(true)
            return true
          }
          if (!shareId) return false
          const r = await verifySharePassword(shareId, pw)
          if (!r || r.state !== 'ok') return false
          pwRef.current = pw
          setRemote(hydrateRemote(r, shareId))
          markUnlocked(shareId)
          setUnlocked(true)
          return true
        }}
      />
    )
  }

  return (
    <PageTransition>
      <header className="page-hero shared-hero">
        <span className="shared-badge">
          <Aperture size={13} weight="bold" />
          {t('shared.badge')}
        </span>
        <h1>{displayName}</h1>
        {displayDesc && <p className="detail-desc">{displayDesc}</p>}
        <p className="hero-meta">{t('shared.meta', { n: list.length })}</p>
        {isWall && list.length > 0 && (
          <div className="wall-export-row">
            <button className="btn btn-ghost" disabled={exporting} onClick={() => void doExportWall()}>
              <DownloadSimple size={16} weight="bold" />
              {exporting ? t('wall.exporting') : t('wall.export')}
            </button>
          </div>
        )}
      </header>

      {isWall && list.length > 0 ? (
        <PhotoWall
          wall={wallConfig}
          photos={list}
          editable={false}
          editing={false}
          onEditingChange={() => {}}
          onWallChange={() => {}}
          onOpenPhoto={setLbIndex}
        />
      ) : (
        <MasonryGrid
          photos={list}
          onOpen={setLbIndex}
          showLike={authed}
          onToggleLike={album || !authed ? undefined : (id) => void toggleRemoteLike(id)}
        />
      )}

      <footer className="shared-footer">
        <span className="brand-mark small">
          <Aperture size={15} weight="bold" />
        </span>
        {t('shared.footer')}
      </footer>

      <AnimatePresence>
        {lbIndex !== null && (
          <Lightbox
            photos={list}
            index={lbIndex}
            onClose={() => setLbIndex(null)}
            onNavigate={setLbIndex}
            showLike={authed}
            onToggleLike={album || !authed ? undefined : (id) => void toggleRemoteLike(id)}
          />
        )}
      </AnimatePresence>
    </PageTransition>
  )
}
