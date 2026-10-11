/* ============================================================
   Pages Functions 共用的环境类型与小工具
   （functions 目录不参与 tsc 构建，由 wrangler 打包，
   因此这里用最小结构化类型描述 R2，不依赖 workers-types）
   ============================================================ */

export interface R2ObjectLike {
  body: ReadableStream
  size: number
  etag: string
  httpEtag?: string
  uploaded: Date
  httpMetadata?: { contentType?: string }
}

export interface R2ListResult {
  objects: { key: string }[]
  truncated: boolean
  cursor?: string
}

export interface R2BucketLike {
  put(
    key: string,
    value: ArrayBuffer | ReadableStream | Blob | string,
    options?: {
      httpMetadata?: { contentType?: string }
      customMetadata?: Record<string, string>
    },
  ): Promise<R2ObjectLike>
  get(key: string): Promise<R2ObjectLike | null>
  /* 元数据读取（含 size），对象不存在返回 null；删除前量大小用于退还额度 */
  head(key: string): Promise<{ size: number } | null>
  /* R2 原生支持单次最多 1000 个 key 的批量删除 */
  delete(key: string | string[]): Promise<void>
  list(options?: { prefix?: string; limit?: number; cursor?: string }): Promise<R2ListResult>
}

export interface AppEnv {
  PHOTOS: R2BucketLike
  /** 元数据命名空间（_manifests/_shares/_likes）与旧直传照片的应用前缀，默认 jiance；
   *  现行照片统一在 subsite/{uid}/ 下（由工具站凭证端点生成，不经本站变量） */
  R2_KEY_PREFIX?: string
}

/** URL 安全的随机对象名 */
export function randomId(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

/** 画廊清单的 R2 Key：_manifests/{prefix}/{uid}.json（按账号私有） */
export function manifestKey(prefix: string, uid: string): string {
  return `_manifests/${prefix}/${uid}.json`
}

/** 分享索引的 R2 Key：_shares/{prefix}/{shareId}，内容为属主 uid（公开接口由此定位清单） */
export function shareKey(prefix: string, shareId: string): string {
  return `_shares/${prefix}/${shareId}`
}

/**
 * 访客点赞计数的 R2 Key：_likes/{prefix}/{shareId}
 * 独立于属主清单存储：清单由属主客户端整份 last-write-wins 推送，
 * 混进去的访客点赞会被覆盖丢失，因此单独记账、分享读取时合并
 */
export function likesKey(prefix: string, shareId: string): string {
  return `_likes/${prefix}/${shareId}`
}

/** 当天日期段（东八区），用于按日期隔离 */
export function dateSegment(now = new Date()): string {
  const utc8 = new Date(now.getTime() + 8 * 3_600_000)
  return utc8.toISOString().slice(0, 10)
}

/** image/jpeg -> jpeg；未知类型返回 null */
export function extFromMime(mime: string): string | null {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/avif': 'avif',
    'image/bmp': 'bmp',
    'image/heic': 'heic',
    'image/heif': 'heif',
    /* 视频只收 MP4（H.264）：与前端白名单一致，避免 HEVC .mov 传上去却无法播放 */
    'video/mp4': 'mp4',
  }
  return map[mime.toLowerCase()] ?? null
}

/** 单张限额：视频放宽到 100MB，图片维持 20MB */
export function maxBytesFor(mime: string): number {
  return mime.toLowerCase().startsWith('video/') ? 100 * 1024 * 1024 : 20 * 1024 * 1024
}
