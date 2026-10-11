/* ============================================================
   工具站存储额度 + R2 上传 · 浏览器端 API 客户端
   额度数据来自工具站 /api/oauth/storage-quota（本站同源代理）。
   上传只走「直传」：向 /api/upload-ticket 申请工具站统一上传
   凭证（key = subsite/{uid}/{upload_id}/{uuid}.{ext}，文件名段由
   服务端随机生成，预扣在凭证签发时原子完成），浏览器直接 PUT
   预签名 URL；任何失败直接抛错，无降级路径。基于 XHR，提供单张
   上传进度；放弃/失败无需释放预扣，随凭证 15 分钟自动失效。
   ============================================================ */

import { getAccessToken } from './auth'
import { tr } from './i18n'

export interface StorageQuota {
  quota_bytes: number
  used_bytes: number
  pending_bytes: number
  remaining_bytes: number
}

/** 未登录 */
export class NotLoggedInError extends Error {
  constructor() {
    super(tr('err.loginFirst'))
  }
}
/** 令牌缺少 storage scope，需要退出重登 */
export class ScopeMissingError extends Error {
  constructor() {
    super(tr('up.scopeMissing'))
  }
}
/** 服务端判定剩余额度不足 */
export class QuotaExceededError extends Error {
  constructor(
    message: string,
    public remainingBytes: number,
    public needBytes: number,
  ) {
    super(message)
  }
}

export interface UploadResult {
  key: string
  url: string
  size: number
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken()
  if (!token) throw new NotLoggedInError()
  return fetch(path, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers ?? {}) },
  })
}

/** 按错误码给出当前语言的提示（服务端描述仅作兜底） */
async function parseError(res: Response): Promise<Error> {
  const data = (await res.json().catch(() => null)) as { error?: string; error_description?: string; remaining_bytes?: number; need_bytes?: number } | null
  if (res.status === 403 && data?.error === 'insufficient_scope') {
    return new ScopeMissingError()
  }
  if (res.status === 402) {
    return new QuotaExceededError(
      tr('err.quota'),
      data?.remaining_bytes ?? 0,
      data?.need_bytes ?? 0,
    )
  }
  if (res.status === 401) {
    return new Error(tr('err.sessionExpired'))
  }
  return new Error(data?.error_description ?? tr('err.requestFail', { code: res.status }))
}

/** 查询当前登录用户的存储额度（走服务端代理，浏览器无 CORS 顾虑） */
export async function fetchStorageQuota(): Promise<StorageQuota> {
  const res = await authedFetch('/api/storage/quota')
  if (!res.ok) throw await parseError(res)
  const data = (await res.json().catch(() => null)) as Partial<StorageQuota> | null
  if (!data || typeof data.remaining_bytes !== 'number' || typeof data.quota_bytes !== 'number') {
    throw new Error(tr('err.quotaData'))
  }
  return {
    quota_bytes: data.quota_bytes,
    used_bytes: data.used_bytes ?? 0,
    pending_bytes: data.pending_bytes ?? 0,
    remaining_bytes: data.remaining_bytes,
  }
}

/** 上传进度回调（loaded / total 字节） */
export type UploadProgressFn = (loaded: number, total: number) => void

interface UploadTicket {
  key: string
  url: string
  upload: { method: 'PUT'; url: string; headers: Record<string, string> }
  expires_in?: number
}

/** 上传单张图片（Blob）到 R2，返回同源取图地址 /f/{key}；onProgress 报告字节进度 */
export async function uploadPhoto(
  blob: Blob,
  filename: string,
  onProgress?: UploadProgressFn,
): Promise<UploadResult> {
  const token = await getAccessToken()
  if (!token) throw new NotLoggedInError()

  // 直传：申请统一凭证后浏览器直接 PUT 预签名 URL，失败直接抛错
  // （Content-Type 必须与签名时完全一致，Content-Length 由浏览器按 blob 大小携带）
  const ticket = await fetchUploadTicket(token, blob, filename)
  await xhrSend(ticket.upload.url, blob, ticket.upload.headers, onProgress)
  return { key: ticket.key, url: ticket.url, size: blob.size }
}

/**
 * 批量删除 R2 中的照片对象（服务端校验 key 归属，单次上限 200 个）。
 * 空数组直接返回（早期 dataURL 照片没有云端对象）；失败抛错，
 * 由调用方决定本地是否回退，避免清单先行移除导致对象成为孤儿。
 */
export async function deletePhotoObjects(keys: string[]): Promise<void> {
  if (keys.length === 0) return
  const res = await authedFetch('/api/photos/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keys }),
  })
  if (!res.ok) throw await parseError(res)
}

/** 申请统一上传凭证；失败直接抛错（额度 / scope / 会话过期已分类） */
async function fetchUploadTicket(
  token: string,
  blob: Blob,
  filename: string,
): Promise<UploadTicket> {
  const res = await fetch('/api/upload-ticket', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: blob.type, size: blob.size, filename }),
  })
  if (!res.ok) throw await parseError(res)
  const data = (await res.json().catch(() => null)) as Partial<UploadTicket> | null
  if (!data?.key || !data.url || !data.upload?.url) throw new Error(tr('err.uploadData'))
  return data as UploadTicket
}

/** XHR 发送（PUT 预签名直传），带上传进度；2xx 视为成功，其余抛错 */
function xhrSend(
  url: string,
  body: Blob,
  headers: Record<string, string>,
  onProgress?: UploadProgressFn,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable || e.total > 0) onProgress(e.loaded, e.total)
      }
    }
    xhr.onerror = () => reject(new Error(tr('err.requestFail', { code: 'network' })))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve()
      } else {
        reject(parseStatusError(xhr.status, xhr.responseText))
      }
    }
    xhr.send(body)
  })
}

/** XHR 错误响应 → 与 fetch 路径一致的错误类型（额度 / scope / 会话过期） */
function parseStatusError(status: number, text: string): Error {
  let data: Record<string, unknown> | null = null
  try {
    data = JSON.parse(text)
  } catch {
    /* 直传 R2 的错误是 XML，按通用失败处理 */
  }
  if (status === 403 && data?.error === 'insufficient_scope') return new ScopeMissingError()
  if (status === 402) {
    return new QuotaExceededError(
      tr('err.quota'),
      typeof data?.remaining_bytes === 'number' ? data.remaining_bytes : 0,
      typeof data?.need_bytes === 'number' ? data.need_bytes : 0,
    )
  }
  if (status === 401) return new Error(tr('err.sessionExpired'))
  return new Error(
    (typeof data?.error_description === 'string' && data.error_description) ||
      tr('err.requestFail', { code: status }),
  )
}
