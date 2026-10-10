/* ============================================================
   工具站存储额度 + R2 上传 · 浏览器端 API 客户端
   额度数据来自工具站 /api/oauth/storage-quota（本站同源代理）。
   上传优先「直传」：先向 /api/upload-ticket 申请预签名 URL
   （服务端校验令牌与额度），浏览器直接 PUT 到 R2，照片字节流
   不经过本站后端；直传未配置时自动降级为 /api/upload 代理上传。
   两种路径都基于 XHR，均提供单张上传进度。
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
  /** 上传前预扣的额度预留 id；结算/释放都要带上（工具站未启用预留时缺省） */
  reservation_id?: string | null
}

/** 上传单张图片（Blob）到 R2，返回同源取图地址 /f/{key}；onProgress 报告字节进度 */
export async function uploadPhoto(
  blob: Blob,
  filename: string,
  onProgress?: UploadProgressFn,
): Promise<UploadResult> {
  const token = await getAccessToken()
  if (!token) throw new NotLoggedInError()

  const ticket = await fetchUploadTicket(token, blob)
  if (ticket) {
    // 直传：PUT 预签名 URL，Content-Type 必须与签名时完全一致；失败即失败，不转代理
    try {
      await xhrSend(ticket.upload.url, 'PUT', blob, ticket.upload.headers, onProgress)
    } catch (e) {
      // 上传失败释放预留（尽力而为；超时预留也会自动失效）
      if (ticket.reservation_id) void releaseReservation(ticket.reservation_id)
      throw e
    }
    // 结算实际用量（服务端以 R2 HEAD 核实大小；失败只影响记账展示，不影响上传结果）
    await settleUploadUsage(ticket.key, ticket.reservation_id ?? null)
    return { key: ticket.key, url: ticket.url, size: blob.size }
  }
  // 降级：代理上传（FormData 不手动设 Content-Type，交由浏览器带 multipart 边界）
  const form = new FormData()
  form.append('file', blob, filename)
  const { text } = await xhrSend(
    '/api/upload',
    'POST',
    form,
    { Authorization: `Bearer ${token}` },
    onProgress,
  )
  let data: Partial<UploadResult> | null = null
  try {
    data = JSON.parse(text) as Partial<UploadResult>
  } catch {
    /* 走下方格式校验 */
  }
  if (!data?.key || !data.url) throw new Error(tr('err.uploadData'))
  return { key: data.key, url: data.url, size: data.size ?? blob.size }
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

/** 结算直传用量（真实大小由 /api/storage/settle 以 R2 HEAD 核实）；失败静默，不影响上传结果 */
async function settleUploadUsage(key: string, reservationId: string | null): Promise<void> {
  try {
    await authedFetch('/api/storage/settle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, reservation_id: reservationId }),
    })
  } catch {
    /* 结算失败静默：预留超时自动失效，用量随后续操作对齐 */
  }
}

/** 释放上传预留（放弃上传时调用）；幂等，失败静默 */
async function releaseReservation(reservationId: string): Promise<void> {
  try {
    await authedFetch('/api/storage/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reservation_id: reservationId }),
    })
  } catch {
    /* 释放失败静默：预留超时自动失效 */
  }
}

/** 申请直传凭证；仅「直传未配置」（501）返回 null 走代理，其余失败直接抛错 */
async function fetchUploadTicket(token: string, blob: Blob): Promise<UploadTicket | null> {
  const res = await fetch('/api/upload-ticket', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content_type: blob.type, size: blob.size }),
  })
  if (res.status === 501) return null
  if (!res.ok) throw await parseError(res)
  const data = (await res.json().catch(() => null)) as Partial<UploadTicket> | null
  if (!data?.key || !data.url || !data.upload?.url) throw new Error(tr('err.uploadData'))
  return data as UploadTicket
}

/** XHR 发送（PUT 直传 / POST 代理共用），带上传进度 */
function xhrSend(
  url: string,
  method: 'PUT' | 'POST',
  body: Blob | FormData,
  headers: Record<string, string>,
  onProgress?: UploadProgressFn,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v)
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable || e.total > 0) onProgress(e.loaded, e.total)
      }
    }
    xhr.onerror = () => reject(new Error(tr('err.requestFail', { code: 'network' })))
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve({ status: xhr.status, text: xhr.responseText })
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
