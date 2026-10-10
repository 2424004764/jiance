import type { AppEnv } from '../api/_shared'

/* ============================================================
   GET /f/{应用}/{uid}/{日期}/{对象名} —— 从 R2 读取照片
   对象名随机不可枚举，内容不可变，可长缓存
   _ 开头的段是保留命名空间（如 _manifests 画廊清单），不对外服务
   ============================================================ */

function keyFromParams(params: Record<string, string | string[]>): string | null {
  const raw = params.path
  const segments = Array.isArray(raw) ? raw : [raw]
  const parts = segments.filter((s): s is string => typeof s === 'string' && s.length > 0)
  if (!parts.length || parts.some((s) => s.startsWith('_'))) return null
  const key = parts.join('/')
  if (key.includes('..') || key.includes('\\')) return null
  return key
}

/* 直传对象带 Content-Type 元数据；万一缺失时按扩展名兜底，保证浏览器能渲染 */
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  avif: 'image/avif',
  bmp: 'image/bmp',
  heic: 'image/heic',
  heif: 'image/heif',
}

function mimeFromKey(key: string): string | null {
  const ext = key.split('.').pop()?.toLowerCase()
  return ext ? (MIME_BY_EXT[ext] ?? null) : null
}

export const onRequestGet = async ({
  params,
  env,
}: {
  params: Record<string, string | string[]>
  env: AppEnv
}): Promise<Response> => {
  const key = keyFromParams(params)
  if (!key) return new Response('Not Found', { status: 404 })

  const obj = await env.PHOTOS.get(key)
  if (!obj) return new Response('Not Found', { status: 404 })

  const headers = new Headers()
  headers.set('content-type', obj.httpMetadata?.contentType ?? mimeFromKey(key) ?? 'application/octet-stream')
  headers.set('cache-control', 'public, max-age=31536000, immutable')
  headers.set('etag', obj.httpEtag ?? obj.etag)
  return new Response(obj.body, { headers })
}
