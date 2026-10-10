import { jsonReply, readJson } from '../../oauth/_util'
import { likesKey, type AppEnv } from '../../_shared'
import { findShare, loadLikeCounts, shareIdFrom, str } from '../_lib'

/* ============================================================
   POST /api/share/:shareId/like —— 访客点赞 / 取消点赞（无需登录）
   请求体：{ photoId, delta: 1 | -1, password? }
   - photoId 必须属于该分享相册；delta 只接受 ±1
   - 加密相册需带解锁时使用的 password
   计数独立存于 _likes/{prefix}/{shareId}（不写属主清单，
   避免被属主客户端的整份覆盖推送冲掉）；读改写无 CAS，
   极端并发下可能少计一两次，个人应用规模下可接受
   响应：{ ok: true, likes: 合并后的总数 }
   ============================================================ */

interface Ctx {
  request: Request
  params: Record<string, string | string[]>
  env: AppEnv
}

export const onRequestPost = async ({ request, params, env }: Ctx): Promise<Response> => {
  const shareId = shareIdFrom(params)
  if (!shareId) return jsonReply({ error: 'not_found' }, 404)

  const body = await readJson(request)
  const photoId = typeof body?.photoId === 'string' ? body.photoId : ''
  const delta = body?.delta === 1 ? 1 : body?.delta === -1 ? -1 : 0
  const password = typeof body?.password === 'string' ? body.password : ''
  if (!str(photoId, 100) || !delta) {
    return jsonReply({ error: 'invalid_request', error_description: '需要 photoId 与 ±1 的 delta' }, 400)
  }

  const prefix = env.R2_KEY_PREFIX || 'jiance'
  let hit: Awaited<ReturnType<typeof findShare>>
  try {
    hit = await findShare(env, prefix, shareId)
  } catch {
    return jsonReply({ error: 'server_error', error_description: '暂时无法访问，请稍后重试' }, 502)
  }
  if (!hit) return jsonReply({ error: 'not_found' }, 404)

  const albumPassword = typeof hit.album.password === 'string' ? hit.album.password : ''
  if (albumPassword && password !== albumPassword) {
    return jsonReply({ error: 'invalid_password', error_description: '密码不正确' }, 403)
  }

  const photo = hit.photos.find((p) => p.id === photoId)
  if (!photo) return jsonReply({ error: 'not_found', error_description: '照片不在这个相册里' }, 404)
  const base = Math.max(0, Math.trunc(typeof photo.likes === 'number' ? photo.likes : 0))

  const counts = await loadLikeCounts(env, prefix, shareId)
  counts[photoId] = Math.min(1_000_000, Math.max(0, Math.trunc(counts[photoId] ?? 0) + delta))

  try {
    await env.PHOTOS.put(likesKey(prefix, shareId), JSON.stringify({ v: 1, counts }), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { kind: 'likes', shareId },
    })
  } catch {
    return jsonReply({ error: 'server_error', error_description: '点赞写入失败，请稍后重试' }, 502)
  }
  return jsonReply({ ok: true, likes: base + counts[photoId] })
}
