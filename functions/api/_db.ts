import { jsonReply, UPSTREAM } from './oauth/_util'
import { manifestKey, randomId, type AppEnv } from './_shared'

/* ============================================================
   D1 元数据访问层（相册 + 照片记录的唯一事实源）
   - 所有写操作按记录落库，不再有整份清单覆盖推送；
     客户端任何一端的变更都即时全局生效
   - 旧 R2 整份清单（_manifests/{prefix}/{uid}.json）在账号
     首次 GET /api/gallery 时自动迁入 D1，迁完即删
   - functions 目录不参与 tsc 构建，由 wrangler 打包，
     因此这里用最小结构化类型描述 D1
   ============================================================ */

/* ---------- 最小 D1 结构类型 ---------- */

export interface D1Result<T> {
  results?: T[]
  success: boolean
  meta?: { changes?: number } & Record<string, unknown>
}

export interface D1Stmt {
  bind(...values: unknown[]): D1Stmt
  first<T = Record<string, unknown>>(): Promise<T | null>
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>
}

export interface D1Like {
  prepare(sql: string): D1Stmt
  batch<T = Record<string, unknown>>(statements: D1Stmt[]): Promise<D1Result<T>[]>
}

/** 带 D1 绑定的环境（旧 R2/vars 字段沿用 AppEnv） */
export type Env = AppEnv & { DB: D1Like }

/* ---------- 鉴权（与上传凭证/删除同一套：Bearer 到工具站验 uid） ---------- */

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

type UidResult = { ok: true; uid: string } | { ok: false; res: Response }

export async function requireUid(request: Request): Promise<UidResult> {
  const auth = request.headers.get('Authorization')
  if (!auth) {
    return { ok: false, res: jsonReply({ error: 'invalid_token', error_description: '请先登录' }, 401) }
  }
  const user = await fetchUpstream('userinfo', auth)
  if (user.status === 401) {
    return { ok: false, res: jsonReply({ error: 'invalid_token', error_description: '登录已过期，请重新登录' }, 401) }
  }
  if (user.status === 403) {
    return { ok: false, res: jsonReply({ error: 'insufficient_scope', error_description: '登录状态异常，请重新登录' }, 403) }
  }
  const uid = user.data?.sub
  if (user.status !== 200 || typeof uid !== 'string' || !uid) {
    return { ok: false, res: jsonReply({ error: 'server_error', error_description: '无法验证登录状态，请稍后重试' }, 502) }
  }
  return { ok: true, uid }
}

/* ---------- 字段白名单清洗（输入/输出都是前端既有 camelCase 形状） ---------- */

export const MAX_ALBUMS = 1000
export const MAX_PHOTOS = 20000
/** 单条 SQL 绑定参数上限（D1 为 100），IN 列表按此分片 */
export const SQL_VARS_LIMIT = 90

export function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
}

export function str(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.length > 0 && v.length <= max ? v : null
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

function clampNum(v: unknown, min: number, max: number, dflt: number): number {
  const n = num(v)
  return n === null ? dflt : Math.min(max, Math.max(min, n))
}

export interface WallJson {
  background: string
  items: { photoId: string; x: number; y: number; rot: number; w: number }[]
}

export function sanitizeWall(raw: unknown): WallJson | null {
  const rec = asRecord(raw)
  if (!rec) return null
  const itemsRaw = Array.isArray(rec.items) ? rec.items : []
  const items: WallJson['items'] = []
  for (const it of itemsRaw.slice(0, MAX_PHOTOS)) {
    const r = asRecord(it)
    if (!r) continue
    const photoId = str(r.photoId, 100)
    if (!photoId) continue
    items.push({
      photoId,
      x: clampNum(r.x, -10, 110, 50),
      y: clampNum(r.y, -10, 110, 50),
      rot: clampNum(r.rot, -60, 60, 0),
      w: clampNum(r.w, 4, 80, 20),
    })
  }
  return { background: str(rec.background, 32) ?? 'cork', items }
}

/** 相册入参（create/update 共用），null = 该字段本次不更新 */
export interface AlbumPatch {
  name: string | null
  description: string | null
  password: string | null | undefined // undefined = 不更新；null = 清除密码
  type: 'grid' | 'wall' | null
  wall: WallJson | null
  shareId: string | null
}

export function sanitizeAlbumPatch(raw: unknown): AlbumPatch | null {
  const rec = asRecord(raw)
  if (!rec) return null
  const type = rec.type === 'wall' ? 'wall' : rec.type === 'grid' ? 'grid' : null
  return {
    name: str(rec.name, 120),
    description: typeof rec.description === 'string' && rec.description.length <= 500 ? rec.description : null,
    password: rec.password === null ? null : str(rec.password, 100),
    type,
    wall: sanitizeWall(rec.wall),
    shareId: str(rec.shareId, 64),
  }
}

/** 照片入参（add 用，不含 id）；url 只接受 /f/ R2 路径或早期 dataURL */
export interface PhotoInputClean {
  url: string
  width: number
  height: number
  title: string
  albumId: string | null
  kind: 'image' | 'video'
  duration: number | null
}

export function sanitizePhotoInput(raw: unknown): PhotoInputClean | null {
  const rec = asRecord(raw)
  if (!rec) return null
  const url = str(rec.url, 200_000)
  if (!url || !(url.startsWith('/f/') || url.startsWith('data:image/'))) return null
  const isVideo = rec.kind === 'video' && url.startsWith('/f/')
  return {
    url,
    width: Math.max(0, Math.round(num(rec.width) ?? 0)),
    height: Math.max(0, Math.round(num(rec.height) ?? 0)),
    title: str(rec.title, 300) ?? '照片',
    albumId: str(rec.albumId, 100),
    kind: isVideo ? 'video' : 'image',
    duration: isVideo ? Math.min(7200, Math.max(0, Math.round((num(rec.duration) ?? 0) * 10) / 10)) : null,
  }
}

/* ---------- 行形状与行 ↔ JSON 映射 ---------- */

export interface AlbumRow {
  uid: string
  id: string
  name: string
  description: string
  password: string | null
  share_id: string
  type: string
  wall_json: string | null
  created_at: number
  updated_at: number
}

export interface PhotoRow {
  id: string
  url: string
  width: number
  height: number
  title: string
  album_id: string | null
  kind: string | null
  duration: number | null
  starred: number
  likes: number
  liked: number
  created_at: number
  updated_at: number
}

const ALBUM_COLS = 'uid, id, name, description, password, share_id, type, wall_json, created_at, updated_at'
const PHOTO_COLS = 'id, url, width, height, title, album_id, kind, duration, starred, likes, liked, created_at, updated_at'

export function albumJson(row: AlbumRow, photoIds: string[]): Record<string, unknown> {
  let wall: WallJson | null = null
  if (row.wall_json) {
    try {
      wall = sanitizeWall(JSON.parse(row.wall_json))
    } catch {
      wall = null
    }
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    password: row.password,
    shareId: row.share_id,
    photoIds,
    type: row.type === 'wall' ? 'wall' : 'grid',
    ...(wall && row.type === 'wall' ? { wall } : {}),
  }
}

export function photoJson(row: PhotoRow): Record<string, unknown> {
  const isVideo = row.kind === 'video'
  return {
    id: row.id,
    url: row.url,
    width: row.width,
    height: row.height,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    albumId: row.album_id,
    likes: row.likes,
    liked: row.liked === 1,
    ...(row.starred === 1 ? { starred: true } : {}),
    ...(isVideo ? { kind: 'video' as const, duration: row.duration ?? 0 } : {}),
  }
}

/* ---------- 基础查询 ---------- */

export async function listAlbums(db: D1Like, uid: string): Promise<AlbumRow[]> {
  const res = await db.prepare(`SELECT ${ALBUM_COLS} FROM albums WHERE uid = ? ORDER BY updated_at DESC`).bind(uid).all<AlbumRow>()
  return res.results ?? []
}

export async function listPhotos(db: D1Like, uid: string): Promise<PhotoRow[]> {
  const res = await db
    .prepare(`SELECT ${PHOTO_COLS} FROM photos WHERE uid = ? ORDER BY created_at ASC, id ASC`)
    .bind(uid)
    .all<PhotoRow>()
  return res.results ?? []
}

export async function getAlbum(db: D1Like, uid: string, id: string): Promise<AlbumRow | null> {
  return db
    .prepare(`SELECT ${ALBUM_COLS} FROM albums WHERE uid = ? AND id = ?`)
    .bind(uid, id)
    .first<AlbumRow>()
}

export async function countAlbums(db: D1Like, uid: string): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM albums WHERE uid = ?').bind(uid).first<{ n: number }>()
  return row?.n ?? 0
}

/** 公开分享页按 shareId 定位相册（取代旧 _shares R2 索引） */
export async function findAlbumByShareId(db: D1Like, shareId: string): Promise<AlbumRow | null> {
  return db.prepare(`SELECT ${ALBUM_COLS} FROM albums WHERE share_id = ?`).bind(shareId).first<AlbumRow>()
}

/** 分享页照片列表（时间倒序） */
export async function listAlbumPhotos(db: D1Like, uid: string, albumId: string): Promise<PhotoRow[]> {
  const res = await db
    .prepare(`SELECT ${PHOTO_COLS} FROM photos WHERE uid = ? AND album_id = ? ORDER BY created_at DESC`)
    .bind(uid, albumId)
    .all<PhotoRow>()
  return res.results ?? []
}

export async function getPhoto(db: D1Like, uid: string, id: string): Promise<PhotoRow | null> {
  return db
    .prepare(`SELECT ${PHOTO_COLS} FROM photos WHERE uid = ? AND id = ?`)
    .bind(uid, id)
    .first<PhotoRow>()
}

/** 相册归属校验：move/add 引用 albumId 时必须已存在且属于该账号 */
export async function albumExists(db: D1Like, uid: string, albumId: string): Promise<boolean> {
  return (await getAlbum(db, uid, albumId)) !== null
}

/** INSERT 语句（OR IGNORE 供迁移幂等导入使用） */
export function insertAlbumStmt(db: D1Like, uid: string, row: AlbumRow, orIgnore = false): D1Stmt {
  return db
    .prepare(
      `INSERT ${orIgnore ? 'OR IGNORE ' : ''}INTO albums (${ALBUM_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(uid, row.id, row.name, row.description, row.password, row.share_id, row.type, row.wall_json, row.created_at, row.updated_at)
}

export function insertPhotoStmt(db: D1Like, uid: string, row: PhotoRow, orIgnore = false): D1Stmt {
  return db
    .prepare(
      `INSERT ${orIgnore ? 'OR IGNORE ' : ''}INTO photos (${PHOTO_COLS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      uid,
      row.id,
      row.url,
      row.width,
      row.height,
      row.title,
      row.album_id,
      row.kind,
      row.duration,
      row.starred,
      row.likes,
      row.liked,
      row.created_at,
      row.updated_at,
    )
}

/* ---------- 旧 R2 清单自动迁移 ---------- */

const MANIFEST_CHUNK = 100

interface LegacyManifest {
  albums: Record<string, unknown>[]
  photos: Record<string, unknown>[]
}

/** 把旧 manifest 的 JSON 记录清洗为行（photoIds/wall 引用的 id 保持原样） */
function manifestRows(data: unknown): { albums: AlbumRow[]; photos: PhotoRow[] } {
  const rec = asRecord(data)
  const albumsRaw = rec && Array.isArray(rec.albums) ? rec.albums : []
  const photosRaw = rec && Array.isArray(rec.photos) ? rec.photos : []
  const albums: AlbumRow[] = []
  for (const a of albumsRaw.slice(0, MAX_ALBUMS)) {
    const r = asRecord(a)
    if (!r) continue
    const id = str(r.id, 100)
    if (!id) continue
    const createdAt = num(r.createdAt) ?? Date.now()
    const wall = sanitizeWall(r.wall)
    const type = r.type === 'wall' ? 'wall' : 'grid'
    albums.push({
      uid: '',
      id,
      name: str(r.name, 120) ?? '未命名相册',
      description: typeof r.description === 'string' && r.description.length <= 500 ? r.description : '',
      password: str(r.password, 100),
      // shareId 缺失/非法时补随机，保持 UNIQUE 不冲突
      share_id: str(r.shareId, 64) ?? randomId(),
      type,
      wall_json: wall && type === 'wall' ? JSON.stringify(wall) : null,
      created_at: createdAt,
      updated_at: num(r.updatedAt) ?? createdAt,
    })
  }
  const photos: PhotoRow[] = []
  for (const p of photosRaw.slice(0, MAX_PHOTOS)) {
    const r = asRecord(p)
    if (!r) continue
    const id = str(r.id, 100)
    const url = str(r.url, 200_000)
    // 历史 mock 残留（非 /f/、非 data:image）直接丢弃
    if (!id || !url || !(url.startsWith('/f/') || url.startsWith('data:image/'))) continue
    const createdAt = num(r.createdAt) ?? Date.now()
    const isVideo = r.kind === 'video' && url.startsWith('/f/')
    photos.push({
      id,
      url,
      width: Math.max(0, Math.round(num(r.width) ?? 0)),
      height: Math.max(0, Math.round(num(r.height) ?? 0)),
      title: str(r.title, 300) ?? '照片',
      album_id: str(r.albumId, 100),
      kind: isVideo ? 'video' : null,
      duration: isVideo ? Math.min(7200, Math.max(0, Math.round((num(r.duration) ?? 0) * 10) / 10)) : null,
      starred: r.starred === true ? 1 : 0,
      likes: Math.max(0, Math.trunc(num(r.likes) ?? 0)),
      liked: r.liked === true ? 1 : 0,
      created_at: createdAt,
      updated_at: num(r.updatedAt) ?? createdAt,
    })
  }
  return { albums, photos }
}

/**
 * 账号首次访问时把旧 R2 整份清单迁入 D1（幂等）：
 * 逐批 INSERT OR IGNORE（与迁移期间产生的并发写入不冲突），
 * 全部落库后写迁移标记并删除旧清单，此后 D1 是唯一数据源。
 * 任一批失败则保留清单、不写标记，下次访问自动重试。
 */
export async function ensureMigrated(env: Env, prefix: string, uid: string): Promise<void> {
  const marker = await env.DB.prepare('SELECT migrated_at FROM sync_state WHERE uid = ?').bind(uid).first()
  if (marker) return

  const obj = await env.PHOTOS.get(manifestKey(prefix, uid))
  if (!obj) {
    await env.DB.prepare('INSERT OR IGNORE INTO sync_state (uid, migrated_at) VALUES (?, NULL)').bind(uid).run()
    return
  }
  const body = await new Response(obj.body).text()
  let data: unknown = null
  try {
    data = JSON.parse(body)
  } catch {
    /* 损坏清单按空处理：只写标记，旧对象一并清理 */
  }
  const { albums, photos } = manifestRows(data)

  const stmts: D1Stmt[] = [
    ...albums.map((a) => insertAlbumStmt(env.DB, uid, { ...a, uid }, true)),
    ...photos.map((p) => insertPhotoStmt(env.DB, uid, p, true)),
  ]
  for (let i = 0; i < stmts.length; i += MANIFEST_CHUNK) {
    await env.DB.batch(stmts.slice(i, i + MANIFEST_CHUNK))
  }
  await env.DB.prepare('INSERT OR IGNORE INTO sync_state (uid, migrated_at) VALUES (?, ?)').bind(uid, Date.now()).run()
  // D1 已接管：删除旧清单，防止删除操作被分享兜底扫描从旧数据里"复活"
  await env.PHOTOS.delete(manifestKey(prefix, uid)).catch(() => {})
}

/* ---------- 相册 photoIds 派生 ---------- */

/** 按照片表派生各相册的 photoIds（created_at 升序 = 旧在前，与既有封面行为一致） */
export function groupPhotoIds(photos: PhotoRow[]): Map<string, string[]> {
  const byAlbum = new Map<string, string[]>()
  for (const p of photos) {
    if (!p.album_id) continue
    const list = byAlbum.get(p.album_id)
    if (list) list.push(p.id)
    else byAlbum.set(p.album_id, [p.id])
  }
  return byAlbum
}
