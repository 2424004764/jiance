import { jsonReply, readJson } from '../oauth/_util'
import { randomId } from '../_shared'
import { albumJson, countAlbums, insertAlbumStmt, MAX_ALBUMS, requireUid, sanitizeAlbumPatch, type AlbumRow, type Env } from '../_db'

/* ============================================================
   POST /api/albums/create —— 新建相册
   鉴权：Bearer access_token
   请求体：{ name, description?, password?: string | null,
             type?: 'grid' | 'wall', wall? }
   - id / shareId 由服务端生成
   返回：{ album: 完整相册记录 }
   ============================================================ */

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const auth = await requireUid(request)
  if (!auth.ok) return auth.res

  const body = await readJson(request)
  const patch = sanitizeAlbumPatch(body)
  if (!patch) {
    return jsonReply({ error: 'invalid_request', error_description: '请求体格式不正确' }, 400)
  }
  if (!patch.name) {
    return jsonReply({ error: 'invalid_request', error_description: '需要相册名称' }, 400)
  }

  const counted = await countAlbums(env.DB, auth.uid)
  if (counted >= MAX_ALBUMS) {
    return jsonReply({ error: 'invalid_request', error_description: `相册数量超出上限（${MAX_ALBUMS} 个）` }, 400)
  }

  const now = Date.now()
  const row: AlbumRow = {
    uid: auth.uid,
    id: randomId(),
    name: patch.name,
    description: patch.description ?? '',
    password: patch.password ?? null,
    share_id: randomId(),
    type: patch.type ?? 'grid',
    wall_json: patch.wall && (patch.type ?? 'grid') === 'wall' ? JSON.stringify(patch.wall) : null,
    created_at: now,
    updated_at: now,
  }
  await insertAlbumStmt(env.DB, auth.uid, row).run()
  return jsonReply({ album: albumJson(row, []) })
}
