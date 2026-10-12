import { jsonReply, readJson } from '../oauth/_util'
import { albumExists, SQL_VARS_LIMIT, requireUid, type Env } from '../_db'

/* ============================================================
   POST /api/photos/move —— 批量移动照片（进相册 / 移回时间流）
   鉴权：Bearer access_token
   请求体：{ ids: string[], albumId: string | null }
   - albumId 为 null 表示移出相册回首页时间流
   - 目标相册需属于当前账号
   返回：{ ok: true, moved: 实际更新条数 }
   ============================================================ */

const MAX_IDS = 2000

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const auth = await requireUid(request)
  if (!auth.ok) return auth.res

  const body = await readJson(request)
  const rawIds = body?.ids
  const hasAlbumId = body?.albumId !== null && body?.albumId !== undefined
  const albumId = typeof body?.albumId === 'string' && body.albumId ? body.albumId : null
  if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.some((v) => typeof v !== 'string' || !v || v.length > 100)) {
    return jsonReply({ error: 'invalid_request', error_description: '请求体需为含 ids 数组的 JSON' }, 400)
  }
  if (rawIds.length > MAX_IDS) {
    return jsonReply({ error: 'invalid_request', error_description: `单次最多移动 ${MAX_IDS} 张` }, 400)
  }
  if (hasAlbumId && albumId && !(await albumExists(env.DB, auth.uid, albumId))) {
    return jsonReply({ error: 'invalid_request', error_description: '目标相册不存在' }, 400)
  }

  const ids = [...new Set(rawIds as string[])]
  const updated = Date.now()
  let moved = 0
  for (let i = 0; i < ids.length; i += SQL_VARS_LIMIT) {
    const chunk = ids.slice(i, i + SQL_VARS_LIMIT)
    const placeholders = chunk.map(() => '?').join(', ')
    const res = await env.DB
      .prepare(`UPDATE photos SET album_id = ?, updated_at = ? WHERE uid = ? AND id IN (${placeholders})`)
      .bind(albumId, updated, auth.uid, ...chunk)
      .run()
    if (!res.success) {
      return jsonReply({ error: 'server_error', error_description: '移动失败，请稍后重试' }, 502)
    }
    moved += res.meta?.changes ?? 0
  }
  return jsonReply({ ok: true, moved })
}
