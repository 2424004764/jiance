import { safeLocalStorage } from './store'

/* ============================================================
   访客在分享页点过的照片（按浏览器本地记忆，用于还原 liked 态）
   服务端只记总数（无访客身份），「我是否点过」由本地判定
   ============================================================ */

const KEY = 'jiance-share-liked:'

export function getLikedPhotoIds(shareId: string): Set<string> {
  try {
    const raw = safeLocalStorage.getItem(KEY + shareId)
    const arr = raw ? (JSON.parse(raw) as unknown) : null
    return new Set(Array.isArray(arr) ? arr.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

export function saveLikedPhotoIds(shareId: string, ids: Set<string>): void {
  safeLocalStorage.setItem(KEY + shareId, JSON.stringify([...ids]))
}
