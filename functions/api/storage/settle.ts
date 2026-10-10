import { jsonReply, readJson, UPSTREAM } from '../oauth/_util'
import { type AppEnv } from '../_shared'
import { postUpstreamJson } from '../_accounting'

/* ============================================================
   POST /api/storage/settle —— 直传（upload-ticket）完成后结算用量
   浏览器上报 key，本端以 R2 HEAD 核实真实大小（防谎报绕过校验），
   再透传工具站 /api/oauth/storage-settle 记账，工具站自己校验
   令牌与 storage scope。对象不存在（上传没完成）回 400。
   ============================================================ */

interface UpstreamUser {
  sub?: unknown
}

async function fetchUpstream(
  path: string,
  auth: string,
): Promise<{ status: number; data: Record<string, unknown> | null }> {
  try {
    const res = await fetch(`${UPSTREAM}/${path}`, { headers: { Authorization: auth } })
    const text = await res.text()
    let data: Record<string, unknown> | null = null
    try {
      const parsed = JSON.parse(text)
      if (parsed && typeof parsed === 'object') data = parsed as Record<string, unknown>
    } catch {
      /* 非 JSON 响应按 null 处理 */
    }
    return { status: res.status, data }
  } catch {
    return { status: 502, data: null }
  }
}

/** /f/ 取图同规则：只接受本账号命名空间下的合法 key */
function validKey(key: string, prefix: string, uid: string): boolean {
  const owned = `${prefix}/${uid}/`
  if (!key.startsWith(owned)) return false
  if (key.includes('..') || key.includes('\\')) return false
  const rest = key.slice(owned.length)
  return rest.split('/').every((s) => s.length > 0 && !s.startsWith('_'))
}

export const onRequestPost = async ({ request, env }: { request: Request; env: AppEnv }): Promise<Response> => {
  const auth = request.headers.get('Authorization')
  if (!auth) {
    return jsonReply({ error: 'invalid_token', error_description: '请先登录' }, 401)
  }
  const user = await fetchUpstream('userinfo', auth)
  if (user.status === 401) {
    return jsonReply({ error: 'invalid_token', error_description: '登录已过期，请重新登录' }, 401)
  }
  if (user.status === 403) {
    return jsonReply({ error: 'insufficient_scope', error_description: '登录状态异常，请重新登录' }, 403)
  }
  const uid = user.data?.sub
  if (user.status !== 200 || typeof uid !== 'string' || !uid) {
    return jsonReply({ error: 'server_error', error_description: '无法验证登录状态，请稍后重试' }, 502)
  }

  const body = await readJson(request)
  const key = typeof body?.key === 'string' ? body.key : ''
  const reservationId = typeof body?.reservation_id === 'string' && body.reservation_id.trim() ? body.reservation_id.trim() : null
  const prefix = env.R2_KEY_PREFIX || 'jiance'
  if (!key || !validKey(key, prefix, uid)) {
    return jsonReply({ error: 'invalid_request', error_description: '对象 key 不合法或不属于当前账号' }, 400)
  }

  // 真实大小以 R2 为准（防谎报 size 绕过额度）；对象不存在视为上传未完成
  let actualSize: number
  try {
    const obj = await env.PHOTOS.head(key)
    if (!obj) {
      return jsonReply({ error: 'invalid_request', error_description: '对象不存在，请重新上传' }, 400)
    }
    actualSize = obj.size
  } catch {
    return jsonReply({ error: 'server_error', error_description: '对象校验失败，请稍后重试' }, 502)
  }

  // 结算失败原样透传（客户端静默忽略；预留若未结算会在 TTL 后自动失效）
  const settle = await postUpstreamJson('storage-settle', auth, {
    bytes: actualSize,
    reservation_id: reservationId,
  })
  if (settle.status !== 200) {
    return jsonReply(
      { error: 'server_error', error_description: '用量结算失败，额度稍后可能未更新' },
      502,
    )
  }
  return jsonReply({ ok: true, size: actualSize })
}
