/* ============================================================
   照片删除（单张 / 批量共用）
   先删云端 R2 对象，成功后才移除本地记录（跨端同步随后把
   清单对齐）。云端删除失败时不动本地：清单里还留着记录，
   用户重试仍能定位到这些对象；反之若先删清单，对象就成了
   无法追溯的孤儿，只能白白占用存储额度。
   ============================================================ */

import { useCallback } from 'react'
import type { Photo } from './types'
import { useGallery, useToasts } from './store'
import { deletePhotoObjects } from './storage'
import { tr } from './i18n'

/** 从照片记录提取 R2 对象 key（/f/{key} 形态的 url）；早期 dataURL 照片没有云端对象 */
function photoKey(p: Photo): string | null {
  return p.url.startsWith('/f/') ? p.url.slice(3) : null
}

export function usePhotoDelete() {
  const toast = useToasts((s) => s.toast)

  return useCallback(
    async (targets: Photo[]): Promise<boolean> => {
      if (targets.length === 0) return true
      const keys = [...new Set(targets.map(photoKey).filter((k): k is string => k !== null))]
      try {
        await deletePhotoObjects(keys)
      } catch (e) {
        toast(e instanceof Error && e.message ? e.message : tr('toast.deleteFail'), 'error')
        return false
      }
      useGallery.getState().deletePhotos(targets.map((p) => p.id))
      toast(tr('toast.deleted', { n: targets.length }))
      return true
    },
    [toast],
  )
}
