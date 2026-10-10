import { jsonReply, UPSTREAM } from './oauth/_util'
import { dateSegment, extFromMime, maxBytesFor, randomId, type AppEnv } from './_shared'
import { postUpstreamJson, quotaExceededReply } from './_accounting'

/* ============================================================
   POST /api/upload —— 照片上传到 R2（代理上传）
   鉴权：Bearer access_token（到工具站 userinfo 验证并取 uid）
   额度：上传前向工具站 storage-quota 校验 remaining_bytes 并
         reserve 预扣，落桶成功后 settle 结算（失败 release 释放），
         不足回 402
   隔离：{应用前缀}/{uid}/{YYYY-MM-DD}/{32位随机串}.{扩展名}
   ============================================================ */

interface UpstreamUser {
  sub?: unknown
}

async function fetchUpstream(path: string, auth: string): Promise<{ status: number; data: Record<string, unknown> | null }> {
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
    return jsonReply({ error: 'invalid_token', error_description: '请先登录后再上传' }, 401)
  }

  // 1. 验证令牌并取 uid（sub）
  const user = await fetchUpstream('userinfo', auth)
  if (user.status === 401) {
    return jsonReply({ error: 'invalid_token', error_description: '登录已过期，请重新登录' }, 401)
  }
  if (user.status === 403) {
    return jsonReply(
      {
        error: 'insufficient_scope',
        error_description: '当前登录未授权存储空间，请退出后重新登录',
      },
      403,
    )
  }
  const uid = user.data?.sub
  if (user.status !== 200 || typeof uid !== 'string' || !uid) {
    return jsonReply({ error: 'server_error', error_description: '无法验证登录状态，请稍后重试' }, 502)
  }

  // 2. 解析上传文件
  let file: File
  try {
    const form = await request.formData()
    const f = form.get('file')
    if (!(f instanceof File)) throw new Error('missing')
    file = f
  } catch {
    return jsonReply({ error: 'invalid_request', error_description: '请求体需为包含 file 字段的表单' }, 400)
  }
  const ext = extFromMime(file.type)
  if (!ext) {
    return jsonReply(
      { error: 'invalid_request', error_description: '仅支持图片（jpeg/png/webp/gif 等）与短视频（MP4）' },
      400,
    )
  }
  if (file.size <= 0) {
    return jsonReply({ error: 'invalid_request', error_description: '文件内容为空' }, 400)
  }
  const maxBytes = maxBytesFor(file.type)
  if (file.size > maxBytes) {
    const cap = Math.round(maxBytes / 1024 / 1024)
    return jsonReply(
      { error: 'invalid_request', error_description: `单个文件不能超过 ${cap}MB` },
      400,
    )
  }

  // 3. 校验存储额度（工具站为唯一定价/记账方，本站只读）
  const quota = await fetchUpstream('storage-quota', auth)
  if (quota.status === 403) {
    return jsonReply(
      { error: 'insufficient_scope', error_description: '当前登录未授权存储空间，请退出后重新登录' },
      403,
    )
  }
  if (quota.status !== 200 || typeof quota.data?.remaining_bytes !== 'number') {
    return jsonReply({ error: 'server_error', error_description: '存储额度查询失败，请稍后重试' }, 502)
  }
  const remaining = quota.data.remaining_bytes
  if (file.size > remaining) {
    return jsonReply(
      {
        error: 'quota_exceeded',
        error_description: '存储额度不足，请前往一方工具箱充值后重试',
        remaining_bytes: remaining,
        need_bytes: file.size,
      },
      402,
    )
  }

  // 3.5 预扣额度；402 = 并发场景下额度已被用掉。预留端点暂不可用等其他
  //     失败不阻塞上传（与旧的不记账行为一致），预留超时自动失效
  let reservationId: string | null = null
  const reserve = await postUpstreamJson('storage-reserve', auth, { bytes: file.size })
  if (reserve.status === 200 && typeof reserve.data?.reservation_id === 'string') {
    reservationId = reserve.data.reservation_id
  } else if (reserve.status === 402) {
    return quotaExceededReply(reserve.data, file.size)
  }

  // 4. 落桶：{应用}/{uid}/{日期}/{随机名}
  const prefix = env.R2_KEY_PREFIX || 'jiance'
  const key = `${prefix}/${uid}/${dateSegment()}/${randomId()}.${ext}`
  try {
    await env.PHOTOS.put(key, file, {
      httpMetadata: { contentType: file.type },
      customMetadata: { app: prefix, uid },
    })
  } catch {
    // 落桶失败释放预留（尽力而为；超时也会自动失效）
    if (reservationId) {
      await postUpstreamJson('storage-release', auth, { reservation_id: reservationId })
    }
    return jsonReply({ error: 'server_error', error_description: '对象存储写入失败，请稍后重试' }, 502)
  }

  // 5. 按实际大小结算（大小即写入的 file.size，无需再 HEAD 核实）
  await postUpstreamJson('storage-settle', auth, { bytes: file.size, reservation_id: reservationId })

  return jsonReply({ key, url: `/f/${key}`, size: file.size })
}
