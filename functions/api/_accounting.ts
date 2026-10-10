/* ============================================================
   工具站存储记账（OAuth 端点透传）
   used_bytes 是工具站 D1 账本（user_storage_quota），不是扫 R2
   算出来的：上传要走 reserve（预扣）→ settle（按实际大小结算），
   放弃上传 release，删除对象 refund。这里封装四个记账调用，
   Authorization 原样透传，由工具站校验令牌与 storage scope。
   ============================================================ */

import { UPSTREAM } from './oauth/_util'

export interface UpstreamReply {
  status: number
  data: Record<string, unknown> | null
}

/** 上游 JSON POST（Bearer 透传）；网络失败按 502 处理 */
export async function postUpstreamJson(path: string, auth: string, body: unknown): Promise<UpstreamReply> {
  try {
    const res = await fetch(`${UPSTREAM}/${path}`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
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

/** 402（quota_exceeded）统一转成给前端的额度错误体 */
export function quotaExceededReply(data: Record<string, unknown> | null, needBytes: number): Response {
  return new Response(
    JSON.stringify({
      error: 'quota_exceeded',
      error_description: '存储额度不足，请前往一方工具箱充值后重试',
      remaining_bytes: typeof data?.remaining_bytes === 'number' ? data.remaining_bytes : 0,
      need_bytes: needBytes,
    }),
    { status: 402, headers: { 'content-type': 'application/json; charset=utf-8' } },
  )
}
