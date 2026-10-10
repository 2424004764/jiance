import { jsonReply, readJson } from '../oauth/_util'
import { postUpstreamJson } from '../_accounting'

/* ============================================================
   POST /api/storage/release —— 放弃直传时释放额度预留
   纯透传工具站 /api/oauth/storage-release（令牌由工具站校验，
   预留只能释放自己名下的）。幂等；未预留时调用也无害。
   ============================================================ */

export const onRequestPost = async ({ request }: { request: Request }): Promise<Response> => {
  const auth = request.headers.get('Authorization')
  if (!auth) {
    return jsonReply({ error: 'invalid_token', error_description: '请先登录' }, 401)
  }
  const body = await readJson(request)
  const reservationId = typeof body?.reservation_id === 'string' ? body.reservation_id.trim() : ''
  if (!reservationId) {
    return jsonReply({ error: 'invalid_request', error_description: '缺少 reservation_id' }, 400)
  }
  const release = await postUpstreamJson('storage-release', auth, { reservation_id: reservationId })
  if (release.status !== 200) {
    return jsonReply({ error: 'server_error', error_description: '预留释放失败，稍后会自动过期' }, 502)
  }
  return jsonReply({ ok: true })
}
