import { jsonReply, readJson } from '../oauth/_util'
import { albumJson, getAlbum, groupPhotoIds, listPhotos, requireUid, sanitizeAlbumPatch, str, type Env } from '../_db'

/* ============================================================
   POST /api/albums/update —— 更新相册（名称/简介/密码/形态/墙面/分享令牌）
   鉴权：Bearer access_token
   请求体：{ id, name?, description?, password?: string | null,
             type?, wall?, shareId? }
   - 字段白名单，未提供的字段不动；password 为 null 表示清除密码
   - shareId 变更撞唯一索引时回 409（重新生成即可）
   返回：{ album: 完整相册记录（含派生 photoIds）}
   ============================================================ */

/** 与公开分享接口同一规则：URL 安全、4~64 位 */
const SHARE_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{3,63}$/

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const auth = await requireUid(request)
  if (!auth.ok) return auth.res

  const body = await readJson(request)
  const id = str(body?.id, 100)
  const patch = sanitizeAlbumPatch(body)
  if (!id || !patch) {
    return jsonReply({ error: 'invalid_request', error_description: '请求体需为含 id 与待更新字段的 JSON' }, 400)
  }

  const sets: string[] = ['updated_at = ?']
  const values: unknown[] = [Date.now()]
  if (patch.name) {
    sets.push('name = ?')
    values.push(patch.name)
  }
  if (patch.description !== null) {
    sets.push('description = ?')
    values.push(patch.description)
  }
  if (patch.password !== undefined) {
    sets.push('password = ?')
    values.push(patch.password)
  }
  if (patch.type) {
    sets.push('type = ?')
    values.push(patch.type)
  }
  if (patch.wall) {
    sets.push('wall_json = ?')
    values.push(JSON.stringify(patch.wall))
  }
  if (patch.shareId) {
    if (!SHARE_ID_RE.test(patch.shareId)) {
      return jsonReply({ error: 'invalid_request', error_description: '分享令牌格式不正确' }, 400)
    }
    sets.push('share_id = ?')
    values.push(patch.shareId)
  }
  if (sets.length === 1) {
    return jsonReply({ error: 'invalid_request', error_description: '没有可更新的字段' }, 400)
  }

  values.push(auth.uid, id)
  try {
    const res = await env.DB
      .prepare(`UPDATE albums SET ${sets.join(', ')} WHERE uid = ? AND id = ?`)
      .bind(...values)
      .run()
    if (!res.success || (res.meta?.changes ?? 0) === 0) {
      return jsonReply({ error: 'not_found', error_description: '相册不存在' }, 404)
    }
  } catch {
    // share_id 唯一索引冲突（随机重排撞车，概率极低）
    return jsonReply({ error: 'conflict', error_description: '分享令牌已被占用，请重新生成' }, 409)
  }

  const row = await getAlbum(env.DB, auth.uid, id)
  if (!row) {
    return jsonReply({ error: 'not_found', error_description: '相册不存在' }, 404)
  }
  const photos = await listPhotos(env.DB, auth.uid)
  const photoIds = groupPhotoIds(photos).get(id) ?? []
  return jsonReply({ album: albumJson(row, photoIds) })
}
