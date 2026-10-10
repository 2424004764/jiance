import { likesKey, manifestKey, shareKey, type AppEnv } from '../_shared'

/* ============================================================
   分享公开接口共用逻辑（_ 前缀文件不参与路由）
   被 /api/share/[shareId]（读取/解锁）与 /api/share/[shareId]/like（点赞）共用
   ============================================================ */

/** 客户端 shareId 为 base36（8 位）随机串；放宽到 URL 安全字符集 */
export const SHARE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{3,63}$/
/** 索引缺失兜底扫描的清单数上限（个人应用规模下绰绰有余） */
const SCAN_MANIFEST_LIMIT = 300

interface ManifestSlice {
  albums: Record<string, unknown>[]
  photos: Record<string, unknown>[]
}

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= max ? v : null
}

/** uid 只作 R2 Key 段使用，排除路径分隔与保留前缀 */
export function validUid(v: unknown): string | null {
  const uid = str(v, 128)
  return uid && !uid.includes('/') && !uid.startsWith('_') ? uid : null
}

async function readBody(obj: { body: ReadableStream }): Promise<string> {
  return new Response(obj.body).text()
}

/** 读取属主清单；缺失 / 损坏返回 null */
async function loadManifest(env: AppEnv, prefix: string, uid: string): Promise<ManifestSlice | null> {
  const obj = await env.PHOTOS.get(manifestKey(prefix, uid))
  if (!obj) return null
  try {
    const data = JSON.parse(await readBody(obj)) as unknown
    const rec = asRecord(data)
    const albums = Array.isArray(rec?.albums) ? rec!.albums.map(asRecord) : null
    const photos = Array.isArray(rec?.photos) ? rec!.photos.map(asRecord) : null
    if (!albums || !photos) return null
    return {
      albums: albums.filter((a): a is Record<string, unknown> => a !== null),
      photos: photos.filter((p): p is Record<string, unknown> => p !== null),
    }
  } catch {
    return null
  }
}

export interface ShareHit {
  uid: string
  album: Record<string, unknown>
  photos: Record<string, unknown>[]
}

/** 在指定账号的清单里找 shareId 对应的相册及其照片 */
async function matchManifest(
  env: AppEnv,
  prefix: string,
  uid: string,
  shareId: string,
): Promise<{ album: Record<string, unknown>; photos: Record<string, unknown>[] } | null> {
  const manifest = await loadManifest(env, prefix, uid)
  if (!manifest) return null
  const album = manifest.albums.find((a) => a.shareId === shareId)
  if (!album) return null
  const photos = manifest.photos.filter((p) => p.albumId === album.id)
  return { album, photos }
}

/** 从清单 Key（_manifests/{prefix}/{uid}.json）还原 uid */
function uidFromManifestKey(prefix: string, key: string): string | null {
  const head = `_manifests/${prefix}/`
  if (!key.startsWith(head) || !key.endsWith('.json')) return null
  return validUid(key.slice(head.length, -'.json'.length))
}

/** 索引缺失时扫描所有清单自救（老数据没有索引），命中后回填索引 */
async function scanManifests(env: AppEnv, prefix: string, shareId: string): Promise<ShareHit | null> {
  let cursor: string | undefined
  let scanned = 0
  while (scanned < SCAN_MANIFEST_LIMIT) {
    const page = await env.PHOTOS.list({ prefix: `_manifests/${prefix}/`, limit: 100, cursor })
    for (const obj of page.objects) {
      scanned++
      const uid = uidFromManifestKey(prefix, obj.key)
      if (!uid) continue
      const hit = await matchManifest(env, prefix, uid, shareId)
      if (hit) {
        await env.PHOTOS.put(shareKey(prefix, shareId), uid, {
          customMetadata: { kind: 'share', uid },
        }).catch(() => {})
        return { uid, ...hit }
      }
      if (scanned >= SCAN_MANIFEST_LIMIT) return null
    }
    if (!page.truncated || !page.cursor) return null
    cursor = page.cursor
  }
  return null
}

/** 定位分享：先查索引，未命中 / 失效再兜底扫描 */
export async function findShare(env: AppEnv, prefix: string, shareId: string): Promise<ShareHit | null> {
  const pointer = await env.PHOTOS.get(shareKey(prefix, shareId))
  if (pointer) {
    const uid = validUid((await readBody(pointer)).trim())
    if (uid) {
      const hit = await matchManifest(env, prefix, uid, shareId)
      if (hit) return { uid, ...hit }
      // 索引指向的账号已没有该分享（删除 / 重置），惰性清理后继续兜底
      await env.PHOTOS.delete(shareKey(prefix, shareId)).catch(() => {})
    }
  }
  return scanManifests(env, prefix, shareId)
}

/** 读取访客点赞计数 { photoId: n }；缺失 / 损坏返回空记录 */
export async function loadLikeCounts(
  env: AppEnv,
  prefix: string,
  shareId: string,
): Promise<Record<string, number>> {
  const obj = await env.PHOTOS.get(likesKey(prefix, shareId)).catch(() => null)
  if (!obj) return {}
  try {
    const data = asRecord(JSON.parse(await readBody(obj)))
    const counts = asRecord(data?.counts)
    if (!counts) return {}
    const clean: Record<string, number> = {}
    for (const [id, n] of Object.entries(counts)) {
      if (id.length <= 100 && typeof n === 'number' && Number.isFinite(n)) {
        clean[id] = Math.min(1_000_000, Math.max(0, Math.trunc(n)))
      }
    }
    return clean
  } catch {
    return {}
  }
}

/** 从路由参数取合法 shareId */
export function shareIdFrom(params: Record<string, string | string[]>): string | null {
  const raw = params.shareId
  const id = Array.isArray(raw) ? raw[0] : raw
  return typeof id === 'string' && SHARE_ID_RE.test(id) ? id : null
}
