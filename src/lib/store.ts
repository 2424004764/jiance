import { create } from 'zustand'
import type { Album, AlbumType, Photo, PhotoInput, ToastType, WallConfig } from './types'

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function newShareId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/** localStorage 超配额（大量本地上传时）不应导致应用崩溃 */
export const safeLocalStorage = {
  getItem: (name: string): string | null => {
    try {
      return localStorage.getItem(name)
    } catch {
      return null
    }
  },
  setItem: (name: string, value: string): void => {
    try {
      localStorage.setItem(name, value)
    } catch {
      /* 容量不足时放弃持久化，仅本次会话生效 */
    }
  },
  removeItem: (name: string): void => {
    try {
      localStorage.removeItem(name)
    } catch {
      /* noop */
    }
  },
}

interface GalleryState {
  albums: Album[]
  photos: Photo[]
  createAlbum: (input: {
    name: string
    description: string
    password: string | null
    type?: AlbumType
    wall?: WallConfig
  }) => Album
  updateAlbum: (id: string, patch: Partial<Omit<Album, 'id' | 'createdAt'>>) => void
  deleteAlbum: (id: string) => void
  addPhotos: (inputs: PhotoInput[], albumId: string | null) => void
  deletePhotos: (ids: string[]) => void
  toggleLike: (id: string) => void
  /** 编辑照片元数据（标题/收藏），updatedAt 前进以赢得跨端合并 */
  updatePhoto: (id: string, patch: Partial<Pick<Photo, 'title' | 'starred'>>) => void
  /** 批量移动照片到指定相册（null = 移出相册回时间流） */
  movePhotos: (ids: string[], albumId: string | null) => void
}

export const useGallery = create<GalleryState>()((set) => ({
  /* 数据按账号私有：未登录时空白（登录引导由页面负责），登录后由 setGalleryUser 载入该账号的空间 */
  albums: [],
  photos: [],

  createAlbum: (input) => {
    const album: Album = {
      id: uid('a'),
      name: input.name,
      description: input.description,
      password: input.password,
      shareId: newShareId(),
      photoIds: [],
      type: input.type ?? 'grid',
      wall: input.wall,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }
    set((s) => ({ albums: [album, ...s.albums] }))
    return album
  },

  updateAlbum: (id, patch) =>
    set((s) => ({
      albums: s.albums.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a)),
    })),

  deleteAlbum: (id) =>
    set((s) => ({
      albums: s.albums.filter((a) => a.id !== id),
      // 相册内的照片回到首页时间流
      photos: s.photos.map((p) => (p.albumId === id ? { ...p, albumId: null } : p)),
    })),

  addPhotos: (inputs, albumId) =>
    set((s) => {
      const photos = [...s.photos]
      const albums = s.albums.map((a) => ({ ...a }))
      const target = albums.find((a) => a.id === albumId)
      inputs.forEach((inp, i) => {
        const photo: Photo = {
          id: uid('p'),
          url: inp.url,
          width: inp.width,
          height: inp.height,
          title: inp.title || `新照片 ${i + 1}`,
          createdAt: Date.now() - i,
          updatedAt: Date.now() - i,
          albumId,
          likes: 0,
          liked: false,
          kind: inp.kind,
          duration: inp.duration,
        }
        photos.push(photo)
        if (target) target.photoIds.push(photo.id)
      })
      if (target) target.updatedAt = Date.now()
      return { photos, albums }
    }),

  deletePhotos: (ids) =>
    set((s) => {
      const dead = new Set(ids)
      return {
        photos: s.photos.filter((p) => !dead.has(p.id)),
        albums: s.albums.map((a) =>
          a.photoIds.some((pid) => dead.has(pid))
            ? { ...a, photoIds: a.photoIds.filter((pid) => !dead.has(pid)) }
            : a,
        ),
      }
    }),

  toggleLike: (id) =>
    set((s) => ({
      photos: s.photos.map((p) =>
        p.id === id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1), updatedAt: Date.now() } : p,
      ),
    })),

  updatePhoto: (id, patch) =>
    set((s) => ({
      photos: s.photos.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
    })),

  movePhotos: (ids, albumId) =>
    set((s) => {
      const moving = new Set(ids)
      const now = Date.now()
      const photos = s.photos.map((p) => (moving.has(p.id) ? { ...p, albumId, updatedAt: now } : p))
      // photoIds 与 photos[].albumId 双写，这里同步维护（同步合并时会以照片记录为准重建）
      const albums = s.albums.map((a) => {
        const stays = photos.filter((p) => p.albumId === a.id).map((p) => p.id)
        if (a.photoIds.length === stays.length && a.photoIds.every((id, i) => id === stays[i])) return a
        return { ...a, photoIds: stays, updatedAt: now }
      })
      return { photos, albums }
    }),
}))

/* ============================================================
   按账号隔离的画廊持久化（数据为每个账号私有，非公开）
   - 登录（uid）：读写 jiance-gallery-u:{uid}；新账号从空白开始，
     旧品牌命名空间与旧版单用户数据依次一次性迁移给第一个登录的账号
   - 退出登录：清空为空白，不落盘
   ============================================================ */

const USER_KEY_PREFIX = 'jiance-gallery-u:'
/** 旧品牌命名的用户命名空间，迁移来源 */
const LEGACY_USER_KEY_PREFIX = 'shiguang-gallery-u:'
/** 旧版（单用户、zustand persist）存储键，迁移来源 */
const LEGACY_KEY = 'shiguang-gallery-v1'

/** 旧版演示相册的固定 ID（mock 数据源已删除，这里只负责清理历史存量） */
const LEGACY_MOCK_ALBUM_IDS = new Set([
  'a-chuanxi',
  'a-city',
  'a-cats',
  'a-sea',
  'a-food',
  'a-film',
  'a-trek',
  'a-spring',
])

interface GallerySlice {
  albums: Album[]
  photos: Photo[]
}

let currentUid: string | null = null

/** 当前画廊归属的账号（未登录为 null），跨端同步模块用于校验归属 */
export function getGalleryUid(): string | null {
  return currentUid
}

/** 真实上传的照片：R2 对象（/f/ 前缀）或更早的 dataURL 直存 */
function isRealPhoto(p: Photo): boolean {
  return typeof p.url === 'string' && (p.url.startsWith('/f/') || p.url.startsWith('data:image/'))
}

/** 剔除历史 mock 数据：只保留真实上传的照片与用户自建相册 */
function stripMockData(slice: GallerySlice): GallerySlice {
  const albums = slice.albums.filter((a) => !LEGACY_MOCK_ALBUM_IDS.has(a.id))
  const keptAlbumIds = new Set(albums.map((a) => a.id))
  const photos = slice.photos
    .filter(isRealPhoto)
    .map((p) => (p.albumId && keptAlbumIds.has(p.albumId) ? p : { ...p, albumId: null }))
  const photoIds = new Set(photos.map((p) => p.id))
  return {
    albums: albums.map((a) => ({
      ...a,
      photoIds: a.photoIds.filter((id) => photoIds.has(id)),
    })),
    photos,
  }
}

function readSlice(key: string): GallerySlice | null {
  const raw = safeLocalStorage.getItem(key)
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as
      | GallerySlice
      | { state?: { albums?: Album[]; photos?: Photo[] } }
    const albums = Array.isArray((data as GallerySlice).albums)
      ? (data as GallerySlice).albums
      : (data as { state?: { albums?: Album[] } }).state?.albums
    const photos = Array.isArray((data as GallerySlice).photos)
      ? (data as GallerySlice).photos
      : (data as { state?: { photos?: Photo[] } }).state?.photos
    if (albums && photos) return { albums, photos }
    return null
  } catch {
    return null
  }
}

function writeSlice(key: string, slice: GallerySlice): void {
  safeLocalStorage.setItem(key, JSON.stringify(slice))
}

// 登录期间的所有变更实时写入当前账号的 namespace
useGallery.subscribe((s) => {
  if (!currentUid) return
  writeSlice(USER_KEY_PREFIX + currentUid, { albums: s.albums, photos: s.photos })
})

/** 登录态变化时切换画廊数据源（uid 为 null 表示退出登录/未登录） */
export function setGalleryUser(userUid: string | null): void {
  if (userUid === currentUid) return

  if (!userUid) {
    currentUid = null
    useGallery.setState({ albums: [], photos: [] })
    return
  }

  currentUid = userUid
  let slice = readSlice(USER_KEY_PREFIX + userUid)
  if (!slice) {
    // 旧品牌命名空间的数据一次性迁移过来（同样剔除 mock），随后原键作废
    const legacyUser = readSlice(LEGACY_USER_KEY_PREFIX + userUid)
    if (legacyUser) {
      slice = legacyUser
      safeLocalStorage.removeItem(LEGACY_USER_KEY_PREFIX + userUid)
    }
  }
  if (!slice) {
    // 旧版单用户数据只迁移给第一个登录的账号（同样剔除 mock），随后原键作废
    const legacy = readSlice(LEGACY_KEY)
    slice = legacy ?? { albums: [], photos: [] }
    if (legacy) safeLocalStorage.removeItem(LEGACY_KEY)
  }
  // 无论来源（存量 namespace / 旧版迁移），加载时统一清理 mock 数据
  slice = stripMockData(slice)
  writeSlice(USER_KEY_PREFIX + userUid, slice)
  useGallery.setState({ albums: slice.albums, photos: slice.photos })
}

export function feedPhotos(photos: Photo[]): Photo[] {
  return photos.filter((p) => p.albumId === null).sort((a, b) => b.createdAt - a.createdAt)
}

export function albumPhotos(photos: Photo[], albumId: string): Photo[] {
  return photos.filter((p) => p.albumId === albumId).sort((a, b) => b.createdAt - a.createdAt)
}

/* ---------- 上传弹窗 ---------- */

interface UploadModalState {
  open: boolean
  /** 上传目标相册（null = 首页时间流） */
  albumId: string | null
  openUpload: (albumId: string | null) => void
  closeUpload: () => void
}

export const useUploadModal = create<UploadModalState>((set) => ({
  open: false,
  albumId: null,
  openUpload: (albumId) => set({ open: true, albumId }),
  closeUpload: () => set({ open: false, albumId: null }),
}))

/* ---------- Toast ---------- */

interface ToastItem {
  id: string
  type: ToastType
  message: string
}

interface ToastState {
  toasts: ToastItem[]
  toast: (message: string, type?: ToastType) => void
  dismiss: (id: string) => void
}

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  toast: (message, type = 'success') => {
    const id = uid('t')
    set((s) => ({ toasts: [...s.toasts.slice(-2), { id, type, message }] }))
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
    }, 2600)
  },
  dismiss: (id: string) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
