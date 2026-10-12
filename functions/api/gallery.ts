import { jsonReply } from './oauth/_util'
import { albumJson, ensureMigrated, groupPhotoIds, listAlbums, listPhotos, photoJson, requireUid, type Env } from './_db'

/* ============================================================
   GET /api/gallery —— 当前账号的画廊（相册 + 照片记录）
   鉴权：Bearer access_token（到工具站 userinfo 验证并取 uid）
   存储：D1（唯一事实源）。旧 R2 整份清单在首次访问时自动迁入，
         客户端不再本地持有清单，也不再整份推送——每次进站都
         从这里按当前账号拉取最新数据，删除/编辑全局即时生效。
   ============================================================ */

export const onRequestGet = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const auth = await requireUid(request)
  if (!auth.ok) return auth.res
  const prefix = env.R2_KEY_PREFIX || 'jiance'
  try {
    await ensureMigrated(env, prefix, auth.uid)
    const [albums, photos] = await Promise.all([listAlbums(env.DB, auth.uid), listPhotos(env.DB, auth.uid)])
    const byAlbum = groupPhotoIds(photos)
    return jsonReply({
      albums: albums.map((a) => albumJson(a, byAlbum.get(a.id) ?? [])),
      photos: photos.map(photoJson),
    })
  } catch {
    return jsonReply({ error: 'server_error', error_description: '画廊数据读取失败，请稍后重试' }, 502)
  }
}
