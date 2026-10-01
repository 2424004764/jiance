/* ============================================================
   OAuth2 服务端代理 · 共用工具
   工具站 /api/oauth/token 强制要求 client_secret（含 PKCE 请求），
   secret 只能存服务端（Cloudflare Pages 环境变量），由这三个
   Function 代理转发：token / userinfo / revoke。
   ============================================================ */

export const UPSTREAM = 'https://tool.fologde.com/api/oauth'

export function jsonReply(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/** 读取请求体里的 JSON 对象，失败返回 null */
export async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const data = await request.json()
    return data && typeof data === 'object' ? (data as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** 把允许转发的字符串字段收集为表单参数 */
export function pickForm(
  body: Record<string, unknown>,
  keys: string[],
): URLSearchParams {
  const form = new URLSearchParams()
  for (const key of keys) {
    const v = body[key]
    if (typeof v === 'string' && v) form.set(key, v)
  }
  return form
}

/** 转发到工具站并把响应原样回传（状态码 + JSON 体） */
export async function relayUpstream(path: string, form: URLSearchParams): Promise<Response> {
  const res = await fetch(`${UPSTREAM}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  })
  const text = await res.text()
  return jsonReply(safeParse(text) ?? { error: 'server_error' }, res.status)
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}
