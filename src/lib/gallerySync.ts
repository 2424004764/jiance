/* ============================================================
   画廊跨设备同步（服务端清单 = /api/gallery 的 R2 manifest）
   - 登录后先拉取远端清单，与本地缓存按 id 并集合并
     （updatedAt 新者胜，照片缺省回退 createdAt），合并结果回写两端
   - 首次拉取成功前不推送：防止本地旧数据整份覆盖服务端清单
   - 此后本地任何变更防抖推送；localStorage 退化为离线缓存 + 快速首屏
   - 并发修改两台设备：整份 last-write-wins，任一端下次登录拉取时
     仍会与本地缓存做并集合并，记录不会因为覆盖而丢失
   ============================================================ */

import { create } from 'zustand'
import { useGallery, getGalleryUid } from './store'
import { getAccessToken } from './auth'
import type { Album, Photo } from './types'

interface GallerySlice {
  albums: Album[]
  photos: Photo[]
}

const PUSH_DEBOUNCE_MS = 1200

/* ---------- 首次拉取状态：页面据此区分「还在同步」和「确实没有」 ---------- */

export type GallerySyncStatus = 'loading' | 'ready' | 'error'

interface GallerySyncStatusState {
  status: GallerySyncStatus
}

/**
 * 当前账号首次拉取 /api/gallery 的进度。
 * status 变为 ready/error 之前，页面不得把「本地没有」判定为「相册不存在」；
 * 登录用户进站即有一次拉取，故初值取 loading
 */
export const useGallerySyncStatus = create<GallerySyncStatusState>(() => ({
  status: 'loading',
}))

/** 拉取远端清单并与当前状态合并（登录 / 账号切换后调用一次） */
export async function pullGallery(): Promise<void> {
  const uid = getGalleryUid()
  if (!uid) return
  useGallerySyncStatus.setState({ status: 'loading' })
  const token = await getAccessToken()
  // 等待令牌期间可能已退出/切换账号；切换时新一次拉取已接管状态，不再回写
  if (!token || getGalleryUid() !== uid) {
    if (getGalleryUid() === uid) useGallerySyncStatus.setState({ status: 'error' })
    return
  }

  let remote: GallerySlice
  try {
    const res = await fetch('/api/gallery', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      // 拉取失败保持本地现状，且本次会话不推送（见 syncedUid 注释）
      if (getGalleryUid() === uid) useGallerySyncStatus.setState({ status: 'error' })
      return
    }
    const data = (await res.json()) as { albums?: unknown; photos?: unknown }
    remote = {
      albums: Array.isArray(data.albums) ? (data.albums as Album[]) : [],
      photos: Array.isArray(data.photos) ? (data.photos as Photo[]) : [],
    }
  } catch {
    if (getGalleryUid() === uid) useGallerySyncStatus.setState({ status: 'error' })
    return
  }
  if (getGalleryUid() !== uid) return

  const s = useGallery.getState()
  const merged = mergeSlices(remote, { albums: s.albums, photos: s.photos })
  syncedUid = uid
  useGallerySyncStatus.setState({ status: 'ready' })
  useGallery.setState({ albums: merged.albums, photos: merged.photos })
  // 远端缺本地新增（或反之）时，把并集结果回写服务端对齐
  schedulePush()
}

/** 按 id 并集合并两份画廊：相册取 updatedAt 新者，照片取 updatedAt（缺省 createdAt）新者 */
function mergeSlices(a: GallerySlice, b: GallerySlice): GallerySlice {
  const albums = new Map<string, Album>()
  for (const x of [...a.albums, ...b.albums]) {
    const prev = albums.get(x.id)
    if (!prev || (x.updatedAt ?? x.createdAt ?? 0) >= (prev.updatedAt ?? prev.createdAt ?? 0)) {
      albums.set(x.id, x)
    }
  }
  const photos = new Map<string, Photo>()
  for (const x of [...a.photos, ...b.photos]) {
    const prev = photos.get(x.id)
    if (!prev || (x.updatedAt ?? x.createdAt ?? 0) >= (prev.updatedAt ?? x.createdAt ?? 0)) {
      photos.set(x.id, x)
    }
  }

  // 相册可能在另一端被删：悬空 albumId 的照片回归首页时间流
  const albumIds = new Set(albums.keys())
  const repaired = [...photos.values()].map((p) =>
    p.albumId && !albumIds.has(p.albumId) ? { ...p, albumId: null } : p,
  )

  // photoIds 与 photos[].albumId 双写维护，两端各自演化会漂移，以照片记录为准重建
  const byAlbum = new Map<string, string[]>()
  for (const p of repaired) {
    if (!p.albumId) continue
    const list = byAlbum.get(p.albumId)
    if (list) list.push(p.id)
    else byAlbum.set(p.albumId, [p.id])
  }
  return {
    albums: [...albums.values()].map((a) => ({ ...a, photoIds: byAlbum.get(a.id) ?? [] })),
    photos: repaired,
  }
}

/* ---------- 推送 ---------- */

let pushTimer: ReturnType<typeof setTimeout> | null = null
/** 已完成首次拉取的账号；只有对齐过远端之后才允许整份覆盖推送 */
let syncedUid: string | null = null

function schedulePush(): void {
  if (pushTimer !== null) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void pushGallery()
  }, PUSH_DEBOUNCE_MS)
}

async function pushGallery(): Promise<void> {
  const uid = getGalleryUid()
  if (!uid || syncedUid !== uid) return
  const token = await getAccessToken()
  if (!token || getGalleryUid() !== uid) return
  const { albums, photos } = useGallery.getState()
  try {
    // 401/403 = 会话失效，推送静默放弃；其余失败同样静默：
    // 本地缓存仍在，之后的任意变更会重新触发推送，下次登录也会拉取对齐
    await fetch('/api/gallery', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ albums, photos }),
    })
  } catch {
    /* 离线等网络异常：等下次变更重试 */
  }
}

// 本地每次变更（含 pullGallery 写回的合并结果）都防抖推送
useGallery.subscribe(() => {
  if (getGalleryUid()) schedulePush()
})

// 移动端切后台可能直接杀掉防抖定时器，页面隐藏时尽力补一发
window.addEventListener('pagehide', () => {
  if (pushTimer === null || syncedUid !== getGalleryUid()) return
  clearTimeout(pushTimer)
  pushTimer = null
  void pushGallery()
})
