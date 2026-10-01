import { jsonReply, UPSTREAM } from './_util'

/** GET /api/oauth/userinfo —— 透传 Bearer 令牌获取用户资料 */
export const onRequestGet = async ({ request }: { request: Request }): Promise<Response> => {
  const auth = request.headers.get('Authorization')
  if (!auth) {
    return jsonReply({ error: 'invalid_token', error_description: '缺少 Authorization 头' }, 401)
  }
  const res = await fetch(`${UPSTREAM}/userinfo`, { headers: { Authorization: auth } })
  const text = await res.text()
  try {
    return jsonReply(JSON.parse(text), res.status)
  } catch {
    return jsonReply({ error: 'server_error', error_description: '用户资料响应格式异常' }, 502)
  }
}
