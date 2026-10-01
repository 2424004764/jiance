import { jsonReply, pickForm, readJson, relayUpstream } from './_util'

interface Env {
  OAUTH_CLIENT_SECRET?: string
}

/** POST /api/oauth/token —— 授权码/刷新令牌换令牌（服务端注入 client_secret） */
export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (!env.OAUTH_CLIENT_SECRET) {
    return jsonReply({ error: 'server_error', error_description: '服务端未配置 OAUTH_CLIENT_SECRET' }, 500)
  }
  const body = await readJson(request)
  if (!body) {
    return jsonReply({ error: 'invalid_request', error_description: '请求体必须是 JSON' }, 400)
  }
  const grant = body.grant_type
  if (grant !== 'authorization_code' && grant !== 'refresh_token') {
    return jsonReply({ error: 'unsupported_grant_type', error_description: '不支持的授权类型' }, 400)
  }
  const form = pickForm(body, [
    'grant_type',
    'code',
    'code_verifier',
    'redirect_uri',
    'refresh_token',
    'client_id',
  ])
  form.set('client_secret', env.OAUTH_CLIENT_SECRET)
  return relayUpstream('token', form)
}
