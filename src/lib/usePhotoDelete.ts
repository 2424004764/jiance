/* ============================================================
   照片删除（单张 / 批量共用）
   全部在服务端完成：删除 D1 记录 + 删除 R2 对象本体 + 退还额度，
   因此删除对所有设备即时生效，不存在旧设备缓存把照片"复活"的问题。
   本地镜像在接口成功后才移除，失败时保留供重试。
   ============================================================ */

import { useCallback } from 'react'
import type { Photo } from './types'
import { useGallery, useToasts } from './store'
import { tr } from './i18n'

export function usePhotoDelete() {
  const toast = useToasts((s) => s.toast)

  return useCallback(
    async (targets: Photo[]): Promise<boolean> => {
      if (targets.length === 0) return true
      try {
        await useGallery.getState().deletePhotos(targets.map((p) => p.id))
      } catch (e) {
        toast(e instanceof Error && e.message ? e.message : tr('toast.deleteFail'), 'error')
        return false
      }
      toast(tr('toast.deleted', { n: targets.length }))
      return true
    },
    [toast],
  )
}
