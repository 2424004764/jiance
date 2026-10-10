import { jsonReply, UPSTREAM } from '../oauth/_util'

/**
 * GET /api/storage/quota
 * 透传 Bearer 令牌到工具站 /api/oauth/storage-quota，
 * 返回 quota_bytes / used_bytes / pending_bytes / remaining_bytes。
 * 令牌缺少 storage scope 时上游回 403 insufficient_scope，原样透传给前端。
 */
export const onRequestGet = async ({ request }: { request: Request }): Promise<Response> => {
  const auth = request.headers.get('Authorization')
  if (!auth) {
    return jsonReply({ error: 'invalid_token', error_description: '缺少 Authorization 头' }, 401)
  }
  try {
    const res = await fetch(`${UPSTREAM}/storage-quota`, { headers: { Authorization: auth } })
    const text = await res.text()
    let data: unknown
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: 'server_error', error_description: '额度响应格式异常' }
      return jsonReply(data, 502)
    }
    return jsonReply(data, res.status)
  } catch {
    return jsonReply({ error: 'server_error', error_description: '无法连接工具站' }, 502)
  }
}
