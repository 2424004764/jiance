import { jsonReply, pickForm, readJson, relayUpstream } from './_util'

interface Env {
  OAUTH_CLIENT_SECRET?: string
}

/** POST /api/oauth/revoke —— 撤销令牌（服务端注入 client_secret） */
export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  if (!env.OAUTH_CLIENT_SECRET) {
    return jsonReply({ error: 'server_error', error_description: '服务端未配置 OAUTH_CLIENT_SECRET' }, 500)
  }
  const body = await readJson(request)
  if (!body || typeof body.token !== 'string' || !body.token) {
    return jsonReply({ error: 'invalid_request', error_description: '缺少 token 字段' }, 400)
  }
  const form = pickForm(body, ['token', 'client_id'])
  form.set('client_secret', env.OAUTH_CLIENT_SECRET)
  return relayUpstream('revoke', form)
}
