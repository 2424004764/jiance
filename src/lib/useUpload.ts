import { useCallback } from 'react'
import { useGallery, useToasts } from './store'
import { pickImages, filesToPhotoInputs } from './upload'

/** 全局上传入口（mock：本地压缩后入库；后续接 Workers） */
export function useUpload() {
  const addPhotos = useGallery((s) => s.addPhotos)
  const toast = useToasts((s) => s.toast)

  return useCallback(
    async (albumId: string | null) => {
      const files = await pickImages()
      if (!files || files.length === 0) return
      const inputs = await filesToPhotoInputs(files)
      if (inputs.length === 0) {
        toast('未识别到图片文件', 'error')
        return
      }
      addPhotos(inputs, albumId)
      toast(`已上传 ${inputs.length} 张照片`)
    },
    [addPhotos, toast],
  )
}
