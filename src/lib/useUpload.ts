import { useCallback } from 'react'
import { useAuth } from './auth'
import { useToasts, useUploadModal } from './store'
import { tr } from './i18n'

/**
 * 全局上传入口：校验登录后打开上传弹窗（弹窗内选图预览、可选压缩、
 * 展示空间用量，确认后批量上传 R2 并入库）。
 */
export function useUpload() {
  const toast = useToasts((s) => s.toast)

  return useCallback(
    (albumId: string | null) => {
      if (!useAuth.getState().user) {
        toast(tr('up.loginFirst'), 'error')
        return
      }
      useUploadModal.getState().openUpload(albumId)
    },
    [toast],
  )
}
