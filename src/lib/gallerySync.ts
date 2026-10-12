/* ============================================================
   画廊拉取（服务端 = D1 唯一事实源）
   - 登录 / 页面加载时整份拉取当前账号的画廊，替换本地镜像，
     不读设备上的旧数据，也不做任何合并
   - 本地改动即时写回服务端（见 store.ts），因此任何设备上的
     新增 / 删除 / 编辑，其他设备下次进站即可见
   - status 供页面区分「还在拉取」与「确实为空」
   ============================================================ */

import { create } from 'zustand'
import { api } from './api'
import { useGallery } from './store'

export type GallerySyncStatus = 'loading' | 'ready' | 'error'

interface GallerySyncStatusState {
  status: GallerySyncStatus
}

/**
 * 当前账号拉取 /api/gallery 的进度。
 * status 变为 ready/error 之前，页面不得把「没有数据」判定为「相册不存在」
 */
export const useGallerySyncStatus = create<GallerySyncStatusState>(() => ({
  status: 'loading',
}))

/** 从服务端整份拉取当前账号画廊并替换本地镜像；失败保留空/原状并置 error */
export async function pullGallery(): Promise<void> {
  useGallerySyncStatus.setState({ status: 'loading' })
  try {
    const { albums, photos } = await api.gallery()
    useGallery.getState().replaceAll(albums, photos)
    useGallerySyncStatus.setState({ status: 'ready' })
  } catch {
    useGallerySyncStatus.setState({ status: 'error' })
  }
}
