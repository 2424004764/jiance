import { jsonReply, readJson } from '../oauth/_util'
import { requireUid, str, type Env } from '../_db'

/* ============================================================
   POST /api/albums/delete —— 删除相册（全局生效）
   鉴权：Bearer access_token
   请求体：{ id }
   相册内的照片不被删除，而是移回首页时间流（album_id 置空），
   与既有客户端行为一致；一个 batch 内原子完成。
   ============================================================ */

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const auth = await requireUid(request)
  if (!auth.ok) return auth.res

  const body = await readJson(request)
  const id = str(body?.id, 100)
  if (!id) {
    return jsonReply({ error: 'invalid_request', error_description: '需要相册 id' }, 400)
  }

  const now = Date.now()
  const results = await env.DB.batch([
    env.DB.prepare('DELETE FROM albums WHERE uid = ? AND id = ?').bind(auth.uid, id),
    env.DB.prepare('UPDATE photos SET album_id = NULL, updated_at = ? WHERE uid = ? AND album_id = ?').bind(now, auth.uid, id),
  ])
  if (!results[0]?.success) {
    return jsonReply({ error: 'server_error', error_description: '相册删除失败，请稍后重试' }, 502)
  }
  if ((results[0].meta?.changes ?? 0) === 0) {
    return jsonReply({ error: 'not_found', error_description: '相册不存在' }, 404)
  }
  return jsonReply({ ok: true, restored: results[1]?.meta?.changes ?? 0 })
}
