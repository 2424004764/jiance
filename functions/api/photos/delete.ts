import { jsonReply } from '../oauth/_util'
import { postUpstreamJson } from '../_accounting'
import { SQL_VARS_LIMIT, requireUid, type Env } from '../_db'

/* ============================================================
   POST /api/photos/delete —— 批量删除照片（全局生效）
   鉴权：Bearer access_token
   请求体：{ ids: string[] }（照片记录 id，单次上限 200）
   服务端一次完成两件事：
     1. 删除 R2 对象本体（key 由记录 url 推导，并做归属校验），
        统一凭证通道对象按真实大小向工具站退还额度
     2. 删除 D1 照片记录 —— 记录没了，任何设备都不会再看到，
        也不存在旧清单被并集合并"复活"的问题
   重复删除幂等：对象/记录已不存在时照常返回成功。
   ============================================================ */

const MAX_IDS = 200
const MAX_KEY_LEN = 1024

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }): Promise<Response> => {
  const auth = await requireUid(request)
  if (!auth.ok) return auth.res

  let body: unknown = null
  try {
    body = await request.json()
  } catch {
    /* 非 JSON 走下面的校验分支 */
  }
  const rawIds = (body as { ids?: unknown } | null)?.ids
  if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.some((v) => typeof v !== 'string' || !v || v.length > 100)) {
    return jsonReply({ error: 'invalid_request', error_description: '请求体需为含 ids 数组的 JSON' }, 400)
  }
  const ids = [...new Set(rawIds as string[])]
  if (ids.length > MAX_IDS) {
    return jsonReply({ error: 'invalid_request', error_description: `单次最多删除 ${MAX_IDS} 张` }, 400)
  }

  // 找到属于当前账号的记录（不存在的 id 直接忽略，保证幂等）
  const rows: { id: string; url: string }[] = []
  for (let i = 0; i < ids.length; i += SQL_VARS_LIMIT) {
    const chunk = ids.slice(i, i + SQL_VARS_LIMIT)
    const placeholders = chunk.map(() => '?').join(', ')
    const res = await env.DB
      .prepare(`SELECT id, url FROM photos WHERE uid = ? AND id IN (${placeholders})`)
      .bind(auth.uid, ...chunk)
      .all<{ id: string; url: string }>()
    if (!res.success) {
      return jsonReply({ error: 'server_error', error_description: '删除失败，请稍后重试' }, 502)
    }
    rows.push(...(res.results ?? []))
  }
  if (rows.length === 0) {
    return jsonReply({ ok: true, deleted: 0, refunded: 0, refund_pending: false })
  }

  // 由 url 推导 R2 key 并做归属校验（越权 key 一律不碰），沿用 /f/ 取图同规则
  const prefix = env.R2_KEY_PREFIX || 'jiance'
  const subsiteOwned = `subsite/${auth.uid}/`
  const legacyOwned = `${prefix}/${auth.uid}/`
  const keys = new Set<string>()
  for (const row of rows) {
    if (!row.url.startsWith('/f/')) continue // 早期 dataURL 照片没有云端对象
    const key = row.url.slice(3)
    if (key.length === 0 || key.length > MAX_KEY_LEN) continue
    if (!key.startsWith(subsiteOwned) && !key.startsWith(legacyOwned)) continue
    if (key.includes('..') || key.includes('\\')) continue
    const rest = key.startsWith(subsiteOwned) ? key.slice(subsiteOwned.length) : key.slice(legacyOwned.length)
    if (rest.split('/').some((s) => s.length === 0 || s.startsWith('_'))) continue
    keys.add(key)
  }

  // 先 HEAD 拿真实大小再删；只有统一凭证通道的对象参与退款（旧通道从未计账）
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

  if (keys.size > 0) {
    try {
      await env.PHOTOS.delete([...keys])
    } catch {
      return jsonReply({ error: 'server_error', error_description: '对象删除失败，请稍后重试' }, 502)
    }
  }

  // 删除 D1 记录（分批绕开绑定参数上限）；这一步是"删除全局生效"的落点
  for (let i = 0; i < ids.length; i += SQL_VARS_LIMIT) {
    const chunk = ids.slice(i, i + SQL_VARS_LIMIT)
    const placeholders = chunk.map(() => '?').join(', ')
    await env.DB.prepare(`DELETE FROM photos WHERE uid = ? AND id IN (${placeholders})`).bind(auth.uid, ...chunk).run()
  }

  // 退还额度（尽力而为）：失败只是这次用量晚一点回落，不影响删除结果
  let refunded = 0
  if (refundBytes > 0) {
    const refund = await postUpstreamJson('storage-refund', request.headers.get('Authorization') ?? '', { bytes: refundBytes })
    if (refund.status === 200) refunded = refundBytes
  }

  return jsonReply({
    ok: true,
    deleted: rows.length,
    refunded,
    refund_pending: refunded < refundBytes || headFailures > 0,
  })
}
