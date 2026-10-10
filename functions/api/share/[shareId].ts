import { jsonReply, readJson } from '../oauth/_util'
import type { AppEnv } from '../_shared'
import { asRecord, findShare, loadLikeCounts, shareIdFrom, str, type ShareHit } from './_lib'

/* ============================================================
   GET  /api/share/:shareId —— 分享页公开数据（无需登录）
        无密码 / 未带密码：有密码只回 { locked, album.name }
   POST /api/share/:shareId —— { password } 校验通过后回完整数据
   存储路径：
     _shares/{prefix}/{shareId}      → 属主 uid（保存清单时写入）
     _manifests/{prefix}/{uid}.json  → 属主画廊清单（唯一数据源）
     _likes/{prefix}/{shareId}       → 访客点赞计数（读取时合并）
   容错：索引缺失走兜底扫描；索引失效读时校验后惰性清理
   响应永不包含 password；liked 由前端按浏览器本地记录还原
   ============================================================ */

/* ---------- 公开响应（字段白名单，剔除 password / 内部字段） ---------- */

function albumPublic(album: Record<string, unknown>): Record<string, unknown> {
  const createdAt = typeof album.createdAt === 'number' ? album.createdAt : Date.now()
  const out: Record<string, unknown> = {
    name: str(album.name, 120) ?? '',
    description: str(album.description, 500) ?? '',
    createdAt,
    type: album.type === 'wall' ? 'wall' : 'grid',
  }
  // 照片墙配置：清单保存时已过白名单，这里只做结构校验后透传
  if (album.type === 'wall' && asRecord(album.wall)) {
    const wall = asRecord(album.wall)!
    out.wall = {
      background: str(wall.background, 32) ?? 'cork',
      items: Array.isArray(wall.items) ? wall.items.slice(0, 20000) : [],
    }
  }
  return out
}

function photoPublic(raw: Record<string, unknown>, likes: number): Record<string, unknown> | null {
  const id = str(raw.id, 100)
  const url = str(raw.url, 200_000)
  if (!id || !url || !(url.startsWith('/f/') || url.startsWith('data:image/'))) return null
  const base = Math.max(0, Math.trunc(typeof raw.likes === 'number' ? raw.likes : 0))
  return {
    id,
    url,
    width: typeof raw.width === 'number' ? raw.width : 0,
    height: typeof raw.height === 'number' ? raw.height : 0,
    title: str(raw.title, 300) ?? '',
    createdAt: typeof raw.createdAt === 'number' ? raw.createdAt : 0,
    likes: base + likes,
  }
}

/** 完整数据（清单照片 + 访客点赞合并），按时间倒序 */
async function fullReply(env: AppEnv, prefix: string, shareId: string, hit: ShareHit): Promise<Response> {
  const counts = await loadLikeCounts(env, prefix, shareId)
  const photos = hit.photos
    .map((p) => photoPublic(p, counts[str(p.id, 100) ?? ''] ?? 0))
    .filter((p): p is Record<string, unknown> => p !== null)
    .sort((a, b) => (b.createdAt as number) - (a.createdAt as number))
  return jsonReply({ locked: false, album: albumPublic(hit.album), photos })
}

function lockedReply(hit: ShareHit): Response {
  const album = albumPublic(hit.album)
  return jsonReply({ locked: true, album: { name: album.name } })
}

/* ---------- 请求处理 ---------- */

interface Ctx {
  request: Request
  params: Record<string, string | string[]>
  env: AppEnv
}

export const onRequestGet = async ({ params, env }: Ctx): Promise<Response> => {
  const shareId = shareIdFrom(params)
  if (!shareId) return jsonReply({ error: 'not_found' }, 404)
  const prefix = env.R2_KEY_PREFIX || 'jiance'
  let hit: ShareHit | null
  try {
    hit = await findShare(env, prefix, shareId)
  } catch {
    return jsonReply({ error: 'server_error', error_description: '暂时无法访问，请稍后重试' }, 502)
  }
  if (!hit) return jsonReply({ error: 'not_found' }, 404)
  if (hit.album.password) return lockedReply(hit)
  return fullReply(env, prefix, shareId, hit)
}

export const onRequestPost = async ({ request, params, env }: Ctx): Promise<Response> => {
  const shareId = shareIdFrom(params)
  if (!shareId) return jsonReply({ error: 'not_found' }, 404)
  const body = await readJson(request)
  const password = typeof body?.password === 'string' ? body.password : ''
  const prefix = env.R2_KEY_PREFIX || 'jiance'
  let hit: ShareHit | null
  try {
    hit = await findShare(env, prefix, shareId)
  } catch {
    return jsonReply({ error: 'server_error', error_description: '暂时无法访问，请稍后重试' }, 502)
  }
  if (!hit) return jsonReply({ error: 'not_found' }, 404)
  if (!hit.album.password) return fullReply(env, prefix, shareId, hit)
  if (!password || password !== hit.album.password) {
    return jsonReply({ error: 'invalid_password', error_description: '密码不正确' }, 403)
  }
  return fullReply(env, prefix, shareId, hit)
}
