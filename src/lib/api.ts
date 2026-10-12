/* ============================================================
   服务端 API 客户端（D1 元数据 · 服务端为唯一事实源）
   - 所有读写在服务端按记录落库，任何设备改动全局即时生效
   - 客户端不再持有清单副本，也不再整份推送
   ============================================================ */

import { getAccessToken } from './auth'
import { tr } from './i18n'
import type { Album, Photo, PhotoInput, WallConfig } from './types'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function call<T>(path: string, body?: unknown): Promise<T> {
  const token = await getAccessToken()
  if (!token) throw new ApiError(401, tr('err.loginFirst'))
  let res: Response
  try {
    res = await fetch(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined
        ? { Authorization: `Bearer ${token}` }
        : { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, tr('err.requestFail', { code: 'network' }))
  }
  if (!res.ok) {
    if (res.status === 401) throw new ApiError(401, tr('err.sessionExpired'))
    const data = (await res.json().catch(() => null)) as { error_description?: string } | null
    throw new ApiError(res.status, data?.error_description ?? tr('err.requestFail', { code: res.status }))
  }
  return (await res.json()) as T
}

export interface GalleryData {
  albums: Album[]
  photos: Photo[]
}

export const api = {
  /** 拉取当前账号的完整画廊（唯一入口，无本地缓存） */
  gallery: () => call<GalleryData>('/api/gallery'),

  addPhotos: (albumId: string | null, photos: PhotoInput[]) =>
    call<{ photos: Photo[] }>('/api/photos/add', { albumId, photos }),

  updatePhoto: (id: string, patch: { title?: string; starred?: boolean; liked?: boolean; likes?: number }) =>
    call<{ photo: Photo }>('/api/photos/update', { id, ...patch }),

  movePhotos: (ids: string[], albumId: string | null) =>
    call<{ ok: true; moved: number }>('/api/photos/move', { ids, albumId }),

  deletePhotos: (ids: string[]) =>
    call<{ ok: true; deleted: number }>('/api/photos/delete', { ids }),

  createAlbum: (input: {
    name: string
    description: string
    password: string | null
    type?: 'grid' | 'wall'
    wall?: WallConfig
  }) => call<{ album: Album }>('/api/albums/create', { ...input }),

  updateAlbum: (
    id: string,
    patch: Partial<{
      name: string
      description: string
      password: string | null
      type: 'grid' | 'wall'
      wall: WallConfig
      shareId: string
    }>,
  ) => call<{ album: Album }>('/api/albums/update', { id, ...patch }),

  deleteAlbum: (id: string) => call<{ ok: true }>('/api/albums/delete', { id }),
}
