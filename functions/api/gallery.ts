import { jsonReply, UPSTREAM } from './oauth/_util'
import { manifestKey, randomId, shareKey, type AppEnv } from './_shared'

/* ============================================================
   GET/PUT /api/gallery —— 画廊元数据清单（相册 + 照片记录）
   鉴权：Bearer access_token（到工具站 userinfo 验证并取 uid），与 /api/upload 同一套
   存储：R2 _manifests/{应用前缀}/{uid}.json（照片本体仍在 {prefix}/{uid}/ 下；
         清单是应用内部记账，不占工具站存储额度）
   说明：整份清单读改写、字段白名单清洗；跨端冲突由前端按
         updatedAt 做 last-write-wins 合并后再推回
   ============================================================ */

const MAX_MANIFEST_BYTES = 2 * 1024 * 1024
const MAX_ALBUMS = 1000
const MAX_PHOTOS = 20000

interface UpstreamUser {
  sub?: unknown
}

async function fetchUpstream(
  path: string,
  auth: string,
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  try {
    const res = await fetch(`${UPSTREAM}/${path}`, { headers: { Authorization: auth } })
    const text = await res.text()
    let data: Record<string, unknown> | null = null
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>
    } catch {
      /* 非 JSON 响应按 null 处理 */
    }
    return { status: res.status, data }
  } catch {
    return { status: 502, data: null }
  }
}

/** 验证 Bearer 令牌并取 uid；失败时返回对应的错误响应 */
type UidResult = { ok: true; uid: string } | { ok: false; res: Response }

async function requireUid(request: Request): Promise<UidResult> {
  const auth = request.headers.get('Authorization')
  if (!auth) {
    return { ok: false, res: jsonReply({ error: 'invalid_token', error_description: '请先登录' }, 401) }
  }
  const user = await fetchUpstream('userinfo', auth)
  if (user.status === 401) {
    return { ok: false, res: jsonReply({ error: 'invalid_token', error_description: '登录已过期，请重新登录' }, 401) }
  }
  if (user.status === 403) {
    return { ok: false, res: jsonReply({ error: 'insufficient_scope', error_description: '登录状态异常，请重新登录' }, 403) }
  }
  const uid = user.data?.sub
  if (user.status !== 200 || typeof uid !== 'string' || !uid) {
    return { ok: false, res: jsonReply({ error: 'server_error', error_description: '无法验证登录状态，请稍后重试' }, 502) }
  }
  return { ok: true, uid }
}

/* ---------- 字段白名单清洗 ---------- */

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= max ? v : null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** 数值字段夹取：非法值回退默认，越界裁到边界 */
function clampNum(v: unknown, min: number, max: number, dflt: number): number {
  const n = num(v)
  return n === null ? dflt : Math.min(max, Math.max(min, n))
}

interface SanitizedGallery {
  albums: Record<string, unknown>[]
  photos: Record<string, unknown>[]
}

/** 照片墙配置白名单：背景预设 id + 每张照片的摆放（顺序即层级） */
function sanitizeWall(raw: unknown): Record<string, unknown> | null {
  const rec = asRecord(raw)
  if (!rec) return null
  const itemsRaw = Array.isArray(rec.items) ? rec.items : []
  const items: Record<string, unknown>[] = []
  for (const it of itemsRaw.slice(0, MAX_PHOTOS)) {
    const r = asRecord(it)
    if (!r) continue
    const photoId = str(r.photoId, 100)
    if (!photoId) continue
    items.push({
      photoId,
      x: clampNum(r.x, -10, 110, 50),
      y: clampNum(r.y, -10, 110, 50),
      rot: clampNum(r.rot, -60, 60, 0),
      w: clampNum(r.w, 4, 80, 20),
    })
  }
  return { background: str(rec.background, 32) ?? 'cork', items }
}

function sanitizeAlbum(raw: unknown): Record<string, unknown> | null {
  const rec = asRecord(raw)
  if (!rec) return null
  const id = str(rec.id, 100)
  if (!id) return null
  const createdAt = num(rec.createdAt) ?? Date.now()
  return {
    id,
    name: str(rec.name, 120) ?? '未命名相册',
    description: str(rec.description, 500) ?? '',
    createdAt,
    updatedAt: num(rec.updatedAt) ?? createdAt,
    password: str(rec.password, 100),
    shareId: str(rec.shareId, 64) ?? randomId(),
    photoIds: Array.isArray(rec.photoIds)
      ? rec.photoIds.filter((v): v is string => typeof v === 'string' && v.length <= 100).slice(0, MAX_PHOTOS)
      : [],
    type: rec.type === 'wall' ? 'wall' : 'grid',
    wall: sanitizeWall(rec.wall),
  }
}

function sanitizePhoto(raw: unknown): Record<string, unknown> | null {
  const rec = asRecord(raw)
  if (!rec) return null
  const id = str(rec.id, 100)
  const url = str(rec.url, 200_000)
  // 只接受 R2 路径或早期 dataURL 两种真实来源，其余（历史 mock 残留）直接丢弃
  if (!id || !url || !(url.startsWith('/f/') || url.startsWith('data:image/'))) return null
  const createdAt = num(rec.createdAt) ?? Date.now()
  const isVideo = rec.kind === 'video' && url.startsWith('/f/')
  return {
    id,
    url,
    width: num(rec.width) ?? 0,
    height: num(rec.height) ?? 0,
    title: str(rec.title, 300) ?? '照片',
    createdAt,
    updatedAt: num(rec.updatedAt) ?? createdAt,
    albumId: str(rec.albumId, 100),
    likes: Math.max(0, Math.trunc(num(rec.likes) ?? 0)),
    liked: typeof rec.liked === 'boolean' ? rec.liked : false,
    // 收藏只存「已标」态，未标不落字段，保持清单紧凑
    ...(rec.starred === true ? { starred: true } : {}),
    ...(isVideo
      ? {
          kind: 'video' as const,
          duration: Math.min(7200, Math.max(0, Math.round((num(rec.duration) ?? 0) * 10) / 10)),
        }
      : {}),
  }
}

function sanitizeGallery(body: unknown): SanitizedGallery | null {
  const rec = asRecord(body)
  if (!rec || !Array.isArray(rec.albums) || !Array.isArray(rec.photos)) return null
  return {
    albums: rec.albums.map(sanitizeAlbum).filter((a): a is Record<string, unknown> => a !== null),
    photos: rec.photos.map(sanitizePhoto).filter((p): p is Record<string, unknown> => p !== null),
  }
}

/* ---------- 分享索引维护 ---------- */

/** 本 isolate 内已确认写入的索引，避免每次保存清单都重写全部小对象 */
const shareIndexDone = new Set<string>()

/**
 * 清单保存后同步分享索引：_shares/{prefix}/{shareId} → uid。
 * 读侧（/api/share/:shareId）会校验索引有效性并有兜底扫描，
 * 因此这里尽力而为即可：失败只从记忆中移除，等待下次保存重试。
 */
async function syncSharePointers(
  env: AppEnv,
  prefix: string,
  uid: string,
  albums: Record<string, unknown>[],
): Promise<void> {
  const writes: Promise<unknown>[] = []
  for (const album of albums) {
    const shareId = album.shareId
    if (typeof shareId !== 'string' || !shareId) continue
    const memo = `${prefix}/${uid}/${shareId}`
    if (shareIndexDone.has(memo)) continue
    shareIndexDone.add(memo)
    writes.push(
      env.PHOTOS.put(shareKey(prefix, shareId), uid, {
        customMetadata: { kind: 'share', uid },
      }).catch(() => {
        shareIndexDone.delete(memo)
      }),
    )
    // 分批并发，避免大清单一次触发上千个并发 R2 写
    if (writes.length >= 10) {
      await Promise.all(writes)
      writes.length = 0
    }
  }
  if (writes.length) await Promise.all(writes)
}

export const onRequestGet = async ({ request, env }: { request: Request; env: AppEnv }): Promise<Response> => {
  const auth = await requireUid(request)
  if (!auth.ok) return auth.res
  const prefix = env.R2_KEY_PREFIX || 'jiance'
  const obj = await env.PHOTOS.get(manifestKey(prefix, auth.uid))
  if (!obj) return jsonReply({ albums: [], photos: [] })
  const body = await new Response(obj.body).text()
  let data: unknown = null
  try {
    data = JSON.parse(body)
  } catch {
    /* 损坏的清单按空处理，前端会用本地数据重建 */
  }
  const clean = sanitizeGallery(data)
  return jsonReply(clean ?? { albums: [], photos: [] })
}

export const onRequestPut = async ({ request, env }: { request: Request; env: AppEnv }): Promise<Response> => {
  const auth = await requireUid(request)
  if (!auth.ok) return auth.res
  const prefix = env.R2_KEY_PREFIX || 'jiance'

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    /* 非法 JSON 走下面的校验分支 */
  }
  const clean = sanitizeGallery(body)
  if (!clean) {
    return jsonReply({ error: 'invalid_request', error_description: '请求体需为含 albums/photos 数组的 JSON' }, 400)
  }
  if (clean.albums.length > MAX_ALBUMS || clean.photos.length > MAX_PHOTOS) {
    return jsonReply({ error: 'invalid_request', error_description: '相册或照片数量超出上限' }, 400)
  }
  const payload = JSON.stringify(clean)
  if (payload.length > MAX_MANIFEST_BYTES) {
    return jsonReply({ error: 'invalid_request', error_description: '清单体积超出上限' }, 400)
  }

  try {
    await env.PHOTOS.put(manifestKey(prefix, auth.uid), payload, {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { kind: 'manifest', uid: auth.uid },
    })
  } catch {
    return jsonReply({ error: 'server_error', error_description: '清单写入失败，请稍后重试' }, 502)
  }
  // 分享索引尽力而为：失败不影响清单保存，公开接口有兜底扫描
  try {
    await syncSharePointers(env, prefix, auth.uid, clean.albums)
  } catch {
    /* 索引写失败由读侧兜底 */
  }
  return jsonReply({ ok: true, albums: clean.albums.length, photos: clean.photos.length })
}
