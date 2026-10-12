import { jsonReply, readJson } from '../oauth/_util'
import { getPhoto, photoJson, requireUid, str, type Env } from '../_db'

/* ============================================================
   POST /api/photos/update —— 更新单张照片元数据（全局生效）
   鉴权：Bearer access_token
   请求体：{ id, title?, starred?, liked?, likes? }
   - 字段白名单，未提供的字段不动；liked 与 likes 一起提交
   返回：{ photo: 完整照片记录 }；照片不存在回 404
   ============================================================ */

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const auth = await requireUid(request)
  if (!auth.ok) return auth.res

  const body = await readJson(request)
  const id = str(body?.id, 100)
  if (!id) {
    return jsonReply({ error: 'invalid_request', error_description: '需要照片 id' }, 400)
  }

  const updated = Date.now()
  const sets: string[] = [`updated_at = ${updated}`]
  const values: unknown[] = []
  const title = str(body?.title, 300)
  if (title) {
    sets.push('title = ?')
    values.push(title)
  }
  if (typeof body?.starred === 'boolean') {
    sets.push('starred = ?')
    values.push(body.starred ? 1 : 0)
  }
  if (typeof body?.liked === 'boolean') {
    const likes = Math.max(0, Math.trunc(Number(body?.likes) || 0))
    sets.push('liked = ?', 'likes = ?')
    values.push(body.liked ? 1 : 0, likes)
  }
  if (sets.length === 1) {
    return jsonReply({ error: 'invalid_request', error_description: '没有可更新的字段' }, 400)
  }

  values.push(auth.uid, id)
  const res = await env.DB
    .prepare(`UPDATE photos SET ${sets.join(', ')} WHERE uid = ? AND id = ?`)
    .bind(...values)
    .run()
  if (!res.success || (res.meta?.changes ?? 0) === 0) {
    return jsonReply({ error: 'not_found', error_description: '照片不存在' }, 404)
  }
  const row = await getPhoto(env.DB, auth.uid, id)
  if (!row) {
    return jsonReply({ error: 'not_found', error_description: '照片不存在' }, 404)
  }
  return jsonReply({ photo: photoJson(row) })
}
