import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import type { Album, Photo, PhotoInput, ToastType } from './types'
import { seedAlbums, seedPhotos } from './mock'

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
  createAlbum: (input: { name: string; description: string; password: string | null }) => Album
  updateAlbum: (id: string, patch: Partial<Omit<Album, 'id' | 'createdAt'>>) => void
  deleteAlbum: (id: string) => void
  addPhotos: (inputs: PhotoInput[], albumId: string | null) => void
  deletePhoto: (id: string) => void
  toggleLike: (id: string) => void
}

export const useGallery = create<GalleryState>()(
  persist(
    (set) => ({
      albums: seedAlbums,
      photos: seedPhotos,

      createAlbum: (input) => {
        const album: Album = {
          id: uid('a'),
          name: input.name,
          description: input.description,
          password: input.password,
          shareId: newShareId(),
          photoIds: [],
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
              albumId,
              likes: 0,
              liked: false,
            }
            photos.push(photo)
            if (target) target.photoIds.push(photo.id)
          })
          if (target) target.updatedAt = Date.now()
          return { photos, albums }
        }),

      deletePhoto: (id) =>
        set((s) => ({
          photos: s.photos.filter((p) => p.id !== id),
          albums: s.albums.map((a) =>
            a.photoIds.includes(id) ? { ...a, photoIds: a.photoIds.filter((pid) => pid !== id) } : a,
          ),
        })),

      toggleLike: (id) =>
        set((s) => ({
          photos: s.photos.map((p) =>
            p.id === id ? { ...p, liked: !p.liked, likes: p.likes + (p.liked ? -1 : 1) } : p,
          ),
        })),
    }),
    {
      name: 'shiguang-gallery-v1',
      storage: createJSONStorage(() => safeLocalStorage),
      version: 1,
    },
  ),
)

export function feedPhotos(photos: Photo[]): Photo[] {
  return photos.filter((p) => p.albumId === null).sort((a, b) => b.createdAt - a.createdAt)
}

export function albumPhotos(photos: Photo[], albumId: string): Photo[] {
  return photos.filter((p) => p.albumId === albumId).sort((a, b) => b.createdAt - a.createdAt)
}

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
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
