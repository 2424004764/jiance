import { jsonReply, readJson } from '../oauth/_util'
import { randomId } from '../_shared'
import {
  albumExists,
  insertPhotoStmt,
  MAX_PHOTOS,
  photoJson,
  requireUid,
  sanitizePhotoInput,
  SQL_VARS_LIMIT,
  type Env,
  type PhotoInputClean,
  type PhotoRow,
} from '../_db'

/* ============================================================
   POST /api/photos/add —— 上传完成后批量写入照片记录
   鉴权：Bearer access_token；记录归属当前账号（uid 是主键的一部分）
   请求体：{ albumId: string | null, photos: [{ url, width, height,
             title, kind?, duration? }] }
   - url 必须是 /f/{key}（R2 直传后地址）或早期 dataURL
   - albumId 需属于当前账号；id / createdAt 由服务端生成
   - 单批上限 200 张；账号照片总量上限 MAX_PHOTOS
   返回：{ photos: [完整照片记录] }（createdAt 依批次顺序递减，
         保证前端时间流里先选的排在前面）
   ============================================================ */

const MAX_BATCH = 200

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const auth = await requireUid(request)
  if (!auth.ok) return auth.res

  const body = await readJson(request)
  const albumId = typeof body?.albumId === 'string' && body.albumId ? body.albumId : null
  const rawInputs = body?.photos
  if (!Array.isArray(rawInputs) || rawInputs.length === 0) {
    return jsonReply({ error: 'invalid_request', error_description: '请求体需为含 photos 数组的 JSON' }, 400)
  }
  if (rawInputs.length > MAX_BATCH) {
    return jsonReply({ error: 'invalid_request', error_description: `单次最多入库 ${MAX_BATCH} 张` }, 400)
  }
  const inputs: PhotoInputClean[] = []
  for (const raw of rawInputs) {
    const p = sanitizePhotoInput(raw)
    if (!p) {
      return jsonReply({ error: 'invalid_request', error_description: '存在非法的照片记录（url 需为 /f/ 地址）' }, 400)
    }
    inputs.push(p)
  }
  if (albumId && !(await albumExists(env.DB, auth.uid, albumId))) {
    return jsonReply({ error: 'invalid_request', error_description: '目标相册不存在' }, 400)
  }

  const counted = await env.DB.prepare('SELECT COUNT(*) AS n FROM photos WHERE uid = ?').bind(auth.uid).first<{ n: number }>()
  if ((counted?.n ?? 0) + inputs.length > MAX_PHOTOS) {
    return jsonReply({ error: 'invalid_request', error_description: `照片数量超出上限（${MAX_PHOTOS} 张）` }, 400)
  }

  const base = Date.now()
  const rows: PhotoRow[] = inputs.map((p, i) => ({
    id: randomId(),
    url: p.url,
    width: p.width,
    height: p.height,
    title: p.title,
    album_id: p.albumId ?? albumId,
    kind: p.kind === 'video' ? 'video' : null,
    duration: p.duration,
    starred: 0,
    likes: 0,
    liked: 0,
    created_at: base - i,
    updated_at: base - i,
  }))
  // 分批执行，绕开单条语句的绑定参数上限
  for (let i = 0; i < rows.length; i += SQL_VARS_LIMIT) {
    await env.DB.batch(rows.slice(i, i + SQL_VARS_LIMIT).map((r) => insertPhotoStmt(env.DB, auth.uid, r)))
  }
  return jsonReply({ photos: rows.map(photoJson) })
}
