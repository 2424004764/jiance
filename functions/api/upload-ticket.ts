import { jsonReply, readJson, UPSTREAM } from './oauth/_util'
import { dateSegment, extFromMime, maxBytesFor, randomId, type AppEnv } from './_shared'
import { postUpstreamJson, quotaExceededReply } from './_accounting'

/* ============================================================
   POST /api/upload-ticket —— 签发 R2 直传临时凭证（S3 预签名 PUT URL）
   鉴权：Bearer access_token（到工具站 userinfo 验证并取 uid）
   额度：签发前向工具站 storage-quota 校验剩余容量并 reserve 预扣，
         不足回 402；浏览器 PUT 成功后调 /api/storage/settle 结算，
         放弃上传由 /api/storage/release 释放预留
   直传：浏览器拿 URL 后 PUT 到 R2 S3 端点，照片字节流不再经过
         本站 Worker；URL 10 分钟过期，key 服务端生成不可指定
   依赖：R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY（R2 API Token，
         Cloudflare 控制台创建后用 `wrangler pages secret put` 注入）。
         未配置时回 501，前端自动降级为 /api/upload 代理上传
   ============================================================ */

const TICKET_TTL_SECONDS = 600

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

/* ---------- S3 SigV4 预签名（presigned PUT，WebCrypto 实现） ---------- */

const encoder = new TextEncoder()

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', encoder.encode(data)))
}

async function hmac(key: ArrayBuffer, message: string): Promise<ArrayBuffer> {
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message))
}

/** RFC 3986 编码：encodeURIComponent 未覆盖的 ! ' ( * 以及 S3 要求必须转义的 / 一并编码 */
function awsUriEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/\//g, '%2F')
}

interface PresignOptions {
  accountId: string
  bucket: string
  /** 对象 key，段间以 / 分隔 */
  key: string
  /** 参与签名的 Content-Type；传 null 表示只签 host（不限制 Content-Type） */
  contentType: string | null
  accessKeyId: string
  secretAccessKey: string
  expiresInSeconds: number
}

export async function presignPut(opts: PresignOptions): Promise<string> {
  const { accountId, bucket, key, contentType, accessKeyId, secretAccessKey, expiresInSeconds } = opts
  const host = `${accountId}.r2.cloudflarestorage.com`
  // 每段单独编码再拼接：canonical URI 与最终 URL 用同一份编码，保证签名与请求一致
  const objectPath = ['', bucket, ...key.split('/')].map(awsUriEncode).join('/')

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const scope = `${dateStamp}/auto/s3/aws4_request`

  // signContentType=false 时只签 host（官方 SDK presign 的默认形态）
  const signedHeaders = contentType === null ? 'host' : 'content-type;host'

  const query = [
    ['X-Amz-Algorithm', 'AWS4-HMAC-SHA256'],
    ['X-Amz-Credential', `${accessKeyId}/${scope}`],
    ['X-Amz-Date', amzDate],
    ['X-Amz-Expires', String(expiresInSeconds)],
    ['X-Amz-SignedHeaders', signedHeaders],
  ]
  // 参数名排序后拼接，签名只覆盖这几个参数
  const canonicalQuery = query
    .map(([k, v]) => `${awsUriEncode(k)}=${awsUriEncode(v)}`)
    .sort()
    .join('&')

  // 参与签名的头必须与浏览器实际发送的完全一致
  const headerLines =
    contentType === null ? `host:${host}\n` : `content-type:${contentType}\nhost:${host}\n`
  const canonicalRequest = [
    'PUT',
    objectPath,
    canonicalQuery,
    headerLines,
    signedHeaders,
    'UNSIGNED-PAYLOAD',
  ].join('\n')

  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonicalRequest)].join('\n')
  const kDate = await hmac(encoder.encode(`AWS4${secretAccessKey}`), dateStamp)
  const kRegion = await hmac(kDate, 'auto')
  const kService = await hmac(kRegion, 's3')
  const kSigning = await hmac(kService, 'aws4_request')
  const signature = toHex(await hmac(kSigning, stringToSign))

  return `https://${host}${objectPath}?${canonicalQuery}&X-Amz-Signature=${signature}`
}

/* ---------- 请求处理 ---------- */

export const onRequestPost = async ({ request, env }: { request: Request; env: AppEnv }): Promise<Response> => {
  // 直传签名所需密钥未配置 → 501，前端降级为代理上传
  if (!env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_ACCOUNT_ID) {
    return jsonReply({ error: 'presign_unavailable' }, 501)
  }

  // 1. 验证令牌并取 uid（sub）
  const auth = request.headers.get('Authorization')
  if (!auth) {
    return jsonReply({ error: 'invalid_token', error_description: '请先登录后再上传' }, 401)
  }
  const user = await fetchUpstream('userinfo', auth)
  if (user.status === 401) {
    return jsonReply({ error: 'invalid_token', error_description: '登录已过期，请重新登录' }, 401)
  }
  if (user.status === 403) {
    return jsonReply(
      { error: 'insufficient_scope', error_description: '当前登录未授权存储空间，请退出后重新登录' },
      403,
    )
  }
  const uid = user.data?.sub
  if (user.status !== 200 || typeof uid !== 'string' || !uid) {
    return jsonReply({ error: 'server_error', error_description: '无法验证登录状态，请稍后重试' }, 502)
  }

  // 2. 请求体：{ content_type, size }
  const body = await readJson(request)
  const contentType = typeof body?.content_type === 'string' ? body.content_type.toLowerCase() : ''
  const ext = extFromMime(contentType)
  const size = typeof body?.size === 'number' ? body.size : 0
  if (!ext) {
    return jsonReply(
      { error: 'invalid_request', error_description: '仅支持图片（jpeg/png/webp/gif 等）与短视频（MP4）' },
      400,
    )
  }
  if (size <= 0) {
    return jsonReply({ error: 'invalid_request', error_description: '文件内容为空' }, 400)
  }
  const maxBytes = maxBytesFor(contentType)
  if (size > maxBytes) {
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
  if (size > remaining) {
    return jsonReply(
      {
        error: 'quota_exceeded',
        error_description: '存储额度不足，请前往一方工具箱充值后重试',
        remaining_bytes: remaining,
        need_bytes: size,
      },
      402,
    )
  }

  // 3.5 预扣额度（原子预留，防止并发签发超传）；工具站侧 402 说明并发
  //     场景下额度已被用掉，同样拒绝。预留端点暂不可用等其他失败不阻塞
  //     上传（与旧的不记账行为一致），预留超时自动失效，不会永久占坑
  let reservationId: string | null = null
  const reserve = await postUpstreamJson('storage-reserve', auth, { bytes: size })
  if (reserve.status === 200 && typeof reserve.data?.reservation_id === 'string') {
    reservationId = reserve.data.reservation_id
  } else if (reserve.status === 402) {
    return quotaExceededReply(reserve.data, size)
  }

  // 4. 生成 key 并签名（key 由服务端随机生成，客户端不能指定）
  const prefix = env.R2_KEY_PREFIX || 'jiance'
  const key = `${prefix}/${uid}/${dateSegment()}/${randomId()}.${ext}`
  const uploadUrl = await presignPut({
    accountId: env.R2_ACCOUNT_ID,
    bucket: env.R2_BUCKET_NAME || 'jiance-photos',
    key,
    contentType,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    expiresInSeconds: TICKET_TTL_SECONDS,
  })

  return jsonReply({
    key,
    url: `/f/${key}`,
    upload: { method: 'PUT', url: uploadUrl, headers: { 'content-type': contentType } },
    reservation_id: reservationId,
    expires_in: TICKET_TTL_SECONDS,
  })
}
