import { create } from 'zustand'
import { api, ApiError } from './api'
import { tr } from './i18n'
import type { Album, AlbumType, Photo, PhotoInput, ToastType, WallConfig } from './types'

/** localStorage 超配额（语言偏好等小状态）不应导致应用崩溃 */
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

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

function newShareId(): string {
  return Math.random().toString(36).slice(2, 10)
}

/* ============================================================
   画廊状态（服务端为唯一事实源）
   - 数据不属于任何设备：登录后由 pullGallery 从服务端整份拉取，
     本地不再持有清单、不做持久化、不做合并
   - 改动类操作先写服务端（删除/新建/移动等 await 结果，
     标题/收藏/点赞/墙面等先乐观上屏再异步落库），成功后本地
     仅作展示镜像；失败回滚并提示
   ============================================================ */

interface GalleryState {
  albums: Album[]
  photos: Photo[]
  /** 整份替换（登录后拉取成功时调用），不做任何合并 */
  replaceAll: (albums: Album[], photos: Photo[]) => void
  /** 清空（退出登录 / 切换账号时调用） */
  clear: () => void
  createAlbum: (input: {
    name: string
    description: string
    password: string | null
    type?: AlbumType
    wall?: WallConfig
  }) => Promise<Album>
  /** 乐观更新 + 防抖落库（墙面拖拽会连续触发） */
  updateAlbum: (id: string, patch: Partial<Omit<Album, 'id' | 'createdAt' | 'photoIds'>>) => void
  deleteAlbum: (id: string) => Promise<void>
  /** 上传完成后入库；返回服务端生成的正式记录 */
  addPhotos: (inputs: PhotoInput[], albumId: string | null) => Promise<Photo[]>
  /** 服务端删记录 + 删 R2 对象；成功后同步本地镜像 */
  deletePhotos: (ids: string[]) => Promise<void>
  toggleLike: (id: string) => void
  /** 编辑照片元数据（标题/收藏）：乐观上屏，失败回滚 */
  updatePhoto: (id: string, patch: Partial<Pick<Photo, 'title' | 'starred'>>) => void
  /** 批量移动照片到指定相册（null = 移出相册回时间流） */
  movePhotos: (ids: string[], albumId: string | null) => Promise<void>
}

/** 单次删除接口上限（与服务端一致），超出自动分批 */
const DELETE_BATCH = 200

export const useGallery = create<GalleryState>()((set, get) => ({
  albums: [],
  photos: [],

  replaceAll: (albums, photos) => set({ albums, photos }),
  clear: () => set({ albums: [], photos: [] }),

  createAlbum: async (input) => {
    const { album } = await api.createAlbum(input)
    set((s) => ({ albums: [album, ...s.albums] }))
    return album
  },

  updateAlbum: (id, patch) => {
    // 先乐观上屏（updatedAt 前进维持相册排序），再防抖整份落库
    set((s) => ({
      albums: s.albums.map((a) => (a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a)),
    }))
    scheduleAlbumPush(id)
  },

  deleteAlbum: async (id) => {
    await api.deleteAlbum(id)
    set((s) => ({
      albums: s.albums.filter((a) => a.id !== id),
      // 相册内的照片回到首页时间流
      photos: s.photos.map((p) => (p.albumId === id ? { ...p, albumId: null } : p)),
    }))
  },

  addPhotos: async (inputs, albumId) => {
    const { photos: created } = await api.addPhotos(
      albumId,
      inputs.map((p) => ({
        url: p.url,
        width: p.width,
        height: p.height,
        title: p.title,
        kind: p.kind,
        duration: p.duration,
      })),
    )
    set((s) => ({
      photos: [...s.photos, ...created],
      albums: s.albums.map((a) =>
        a.id === albumId ? { ...a, photoIds: [...a.photoIds, ...created.map((p) => p.id)] } : a,
      ),
    }))
    return created
  },

  deletePhotos: async (ids) => {
    for (let i = 0; i < ids.length; i += DELETE_BATCH) {
      await api.deletePhotos(ids.slice(i, i + DELETE_BATCH))
    }
    const dead = new Set(ids)
    set((s) => ({
      photos: s.photos.filter((p) => !dead.has(p.id)),
      albums: s.albums.map((a) =>
        a.photoIds.some((pid) => dead.has(pid))
          ? { ...a, photoIds: a.photoIds.filter((pid) => !dead.has(pid)) }
          : a,
      ),
    }))
  },

  toggleLike: (id) => {
    const photo = get().photos.find((p) => p.id === id)
    if (!photo) return
    const liked = !photo.liked
    const likes = photo.likes + (photo.liked ? -1 : 1)
    set((s) => ({
      photos: s.photos.map((p) => (p.id === id ? { ...p, liked, likes, updatedAt: Date.now() } : p)),
    }))
    api.updatePhoto(id, { liked, likes }).catch(() => {
      // 失败回滚到点击前的值
      set((s) => ({
        photos: s.photos.map((p) => (p.id === id ? { ...p, liked: photo.liked, likes: photo.likes } : p)),
      }))
      toastSaveFail()
    })
  },

  updatePhoto: (id, patch) => {
    const photo = get().photos.find((p) => p.id === id)
    if (!photo) return
    set((s) => ({
      photos: s.photos.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: Date.now() } : p)),
    }))
    api.updatePhoto(id, patch).catch(() => {
      set((s) => ({
        photos: s.photos.map((p) =>
          p.id === id
            ? { ...p, title: photo.title, starred: photo.starred, updatedAt: photo.updatedAt }
            : p,
        ),
      }))
      toastSaveFail()
    })
  },

  movePhotos: async (ids, albumId) => {
    await api.movePhotos(ids, albumId)
    const moving = new Set(ids)
    const now = Date.now()
    set((s) => {
      const photos = s.photos.map((p) => (moving.has(p.id) ? { ...p, albumId, updatedAt: now } : p))
      // photoIds 镜像以照片记录为准重建
      const albums = s.albums.map((a) => {
        const stays = photos.filter((p) => p.albumId === a.id).map((p) => p.id)
        if (a.photoIds.length === stays.length && a.photoIds.every((id, i) => id === stays[i])) return a
        return { ...a, photoIds: stays, updatedAt: now }
      })
      return { photos, albums }
    })
  },
}))

function toastSaveFail(): void {
  useToasts.getState().toast(tr('err.saveFail'), 'error')
}

/* ---------- 相册更新的防抖落库（同一相册的连续修改合并为最后一次） ---------- */

const ALBUM_PUSH_DEBOUNCE_MS = 600
const albumTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleAlbumPush(id: string): void {
  const prev = albumTimers.get(id)
  if (prev) clearTimeout(prev)
  albumTimers.set(
    id,
    setTimeout(() => {
      albumTimers.delete(id)
      const album = useGallery.getState().albums.find((a) => a.id === id)
      if (!album) return
      api.updateAlbum(id, {
        name: album.name,
        description: album.description,
        password: album.password,
        type: album.type ?? 'grid',
        wall: album.wall,
        shareId: album.shareId,
      }).catch((e) => {
        // 409 = shareId 撞唯一索引等可重试错误；其余网络失败等下次修改重试
        if (e instanceof ApiError && e.status === 409) {
          const retry = newShareId()
          setAlbumShareId(id, retry)
          scheduleAlbumPush(id)
          return
        }
        toastSaveFail()
      })
    }, ALBUM_PUSH_DEBOUNCE_MS),
  )
}

function setAlbumShareId(id: string, shareId: string): void {
  useGallery.setState((s) => ({
    albums: s.albums.map((a) => (a.id === id ? { ...a, shareId } : a)),
  }))
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
