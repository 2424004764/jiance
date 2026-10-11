import { jsonReply, UPSTREAM } from '../oauth/_util'
import { type AppEnv } from '../_shared'
import { postUpstreamJson } from '../_accounting'

/* ============================================================
   POST /api/photos/delete —— 批量删除照片的 R2 对象并退还额度
   鉴权：Bearer access_token（到工具站 userinfo 验证并取 uid）
   隔离：只接受两个归属前缀下的对象 key，其余一律丢弃，防止
         越权删除他人对象：
           subsite/{uid}/…          统一凭证通道（现行），已计入主站额度
           {应用前缀}/{uid}/…       旧直传通道（jiance/{uid}/…），从未计额
         画廊清单由客户端经 /api/gallery 推送对齐，这里负责删对象本体
   额度：删除前逐个 HEAD 拿真实大小，删完把【统一通道】对象的合计
         退还工具站（used_bytes 是工具站 D1 账本，退款即减账）；
         旧通道对象从未计过账，删除不退款，防止把其他来源的用量冲掉。
         对象已不存在（HEAD null）不参与退款，重复删除不会重复刷额度
   ============================================================ */

const MAX_KEYS = 200
const MAX_KEY_LEN = 1024

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
  // uid 参与 key 归属前缀判断，若含路径分隔符会破坏隔离，直接拒绝
  if (uid.includes('/') || uid.includes('\\') || uid.includes('..')) {
    return jsonReply({ error: 'server_error', error_description: '账号标识异常，无法执行删除' }, 502)
  }

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    /* 非 JSON 走下面的校验分支 */
  }
  const rawKeys = (body as { keys?: unknown } | null)?.keys
  if (!Array.isArray(rawKeys) || rawKeys.length === 0) {
    return jsonReply({ error: 'invalid_request', error_description: '请求体需为含 keys 数组的 JSON' }, 400)
  }
  if (rawKeys.length > MAX_KEYS) {
    return jsonReply({ error: 'invalid_request', error_description: `单次最多删除 ${MAX_KEYS} 张` }, 400)
  }

  const prefix = env.R2_KEY_PREFIX || 'jiance'
  // 统一凭证通道的对象已计入主站额度（删除要退款）；旧直传通道从未计额（删除不退款）
  const subsiteOwned = `subsite/${uid}/`
  const legacyOwned = `${prefix}/${uid}/`
  const keys = new Set<string>()
  for (const k of rawKeys) {
    if (typeof k !== 'string' || k.length === 0 || k.length > MAX_KEY_LEN) continue
    if (!k.startsWith(subsiteOwned) && !k.startsWith(legacyOwned)) continue
    // 与 /f/ 取图同规则：禁相对路径、反斜杠与保留命名空间段（_manifests 等）
    if (k.includes('..') || k.includes('\\')) continue
    const rest = k.startsWith(subsiteOwned) ? k.slice(subsiteOwned.length) : k.slice(legacyOwned.length)
    const segments = rest.split('/')
    if (segments.some((s) => s.length === 0 || s.startsWith('_'))) continue
    keys.add(k)
  }
  if (keys.size === 0) {
    return jsonReply({ error: 'invalid_request', error_description: '没有可删除的对象' }, 400)
  }

  // 先 HEAD 拿真实大小，再批量删除。只有统一凭证通道的对象参与退款
  // （旧通道对象从未计账）；HEAD null（对象早已不存在）→ 跳过退款但 key
  // 仍进批量删除（幂等无害）；HEAD 网络失败同理，宁可少退不虚报。
  let refundBytes = 0
  let headFailures = 0
  for (const key of keys) {
    if (!key.startsWith(subsiteOwned)) continue
    try {
      const obj = await env.PHOTOS.head(key)
      if (obj && typeof obj.size === 'number') refundBytes += obj.size
    } catch {
      headFailures++
    }
  }

  try {
    await env.PHOTOS.delete([...keys])
  } catch {
    return jsonReply({ error: 'server_error', error_description: '对象删除失败，请稍后重试' }, 502)
  }

  // 退还额度（尽力而为）：账本在工具站侧，失败只是这次用量晚一点回落，
  // 对象本体已删除，不影响删除结果
  let refunded = 0
  if (refundBytes > 0) {
    const refund = await postUpstreamJson('storage-refund', auth, { bytes: refundBytes })
    if (refund.status === 200) refunded = refundBytes
  }

  return jsonReply({
    ok: true,
    deleted: keys.size,
    refunded,
    refund_pending: refunded < refundBytes || headFailures > 0,
  })
}
