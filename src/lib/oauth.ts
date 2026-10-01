/* ============================================================
   主站统一登录 · OAuth2 授权码 + PKCE
   授权服务器：工具站 tool.fologde.com（文档《子站统一登录接入指南》）
   工具站换令牌接口强制要求 client_secret，secret 存放在
   Cloudflare Pages 环境变量（OAUTH_CLIENT_SECRET），由
   functions/api/oauth/* 在服务端代理转发，浏览器只访问同源
   /api/oauth/* 端点，永远接触不到 secret。
   ============================================================ */

const SERVER = (import.meta.env.VITE_OAUTH_SERVER ?? 'https://tool.fologde.com').replace(/\/+$/, '')
const CLIENT_ID = import.meta.env.VITE_OAUTH_CLIENT_ID ?? ''

export const oauthConfigured = CLIENT_ID !== ''

export interface OAuthUser {
  /** 用户唯一 ID，与工具站 user.id 一致，作为本地账号映射键 */
  sub: string
  username: string
  email?: string
  avatar?: string
  created_at?: string
}

export interface TokenSet {
  accessToken: string
  refreshToken: string | null
  /** access_token 过期时间（epoch ms） */
  accessExpiresAt: number
}

export type LoginResult =
  | { ok: true; user: OAuthUser; tokens: TokenSet; returnTo: string }
  | { ok: false; message: string }

interface TokenResponse {
  access_token: string
  token_type?: string
  expires_in?: number
  refresh_token?: string
  scope?: string
}

/** 发起登录到回跳之间的一次性事务（state + code_verifier） */
interface LoginTx {
  state: string
  verifier: string
  returnTo: string
  createdAt: number
}

const TX_KEY = 'shiguang-oauth-tx'
/** 与授权码同寿命：10 分钟 */
const TX_TTL = 10 * 60 * 1000

class OauthError extends Error {}

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: '你拒绝了授权',
  invalid_client: '客户端配置有误（client_id 无效或应用已被停用）',
  invalid_grant: '授权码无效或已过期，请重新发起登录',
  invalid_request: '请求参数不完整',
  unsupported_grant_type: '不支持的授权类型',
}

function friendlyError(code: string, description?: string | null): string {
  return ERROR_MESSAGES[code] ?? description ?? `登录失败（${code}）`
}

function requestError(e: unknown): string {
  if (e instanceof OauthError) return e.message
  if (e instanceof TypeError) return '无法连接登录服务，请检查网络后重试'
  return '登录失败，请稍后再试'
}

function base64Url(bytes: Uint8Array): string {
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function randomString(byteLen: number): string {
  const bytes = new Uint8Array(byteLen)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

async function sha256Base64Url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return base64Url(new Uint8Array(digest))
}

function callbackUrl(): string {
  return `${location.origin}/auth/callback`
}

/** 发起登录：生成 state + PKCE 并跳转到工具站授权页（需在管理后台将回调地址加入白名单） */
export async function beginLogin(returnTo: string = location.pathname + location.search): Promise<void> {
  if (!oauthConfigured) {
    throw new OauthError('尚未配置 VITE_OAUTH_CLIENT_ID，无法发起登录')
  }
  const tx: LoginTx = {
    state: randomString(18),
    // 48 字节 → 64 字符，符合 code_verifier 43~128 的长度要求
    verifier: randomString(48),
    returnTo,
    createdAt: Date.now(),
  }
  sessionStorage.setItem(TX_KEY, JSON.stringify(tx))

  const url = new URL(`${SERVER}/oauth/authorize`)
  url.searchParams.set('client_id', CLIENT_ID)
  url.searchParams.set('redirect_uri', callbackUrl())
  url.searchParams.set('state', tx.state)
  url.searchParams.set('code_challenge', await sha256Base64Url(tx.verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  location.href = url.toString()
}

/** 处理回跳：校验 state → 用授权码 + code_verifier 换令牌 → 拉取用户资料 */
export function completeLogin(params: URLSearchParams): Promise<LoginResult> {
  // 授权码一次性，模块级单飞避免 React StrictMode 双执行导致第二次必然 invalid_grant
  completeLoginInflight ??= doCompleteLogin(params)
  return completeLoginInflight
}

let completeLoginInflight: Promise<LoginResult> | null = null

async function doCompleteLogin(params: URLSearchParams): Promise<LoginResult> {
  const raw = sessionStorage.getItem(TX_KEY)
  sessionStorage.removeItem(TX_KEY)
  const tx = raw ? (JSON.parse(raw) as LoginTx) : null

  const error = params.get('error')
  if (error) {
    return { ok: false, message: friendlyError(error, params.get('error_description')) }
  }
  const code = params.get('code')
  if (!code) return { ok: false, message: '回跳地址中缺少授权码' }
  if (!tx || Date.now() - tx.createdAt > TX_TTL || tx.state !== params.get('state')) {
    return { ok: false, message: '登录会话校验失败，请重新发起登录' }
  }

  try {
    const tokens = toTokenSet(
      await postToken({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl(),
        client_id: CLIENT_ID,
        code_verifier: tx.verifier,
      }),
    )
    const user = await fetchUserinfo(tokens.accessToken)
    return { ok: true, user, tokens, returnTo: tx.returnTo || '/' }
  } catch (e) {
    return { ok: false, message: requestError(e) }
  }
}

/** 用 refresh_token 换新令牌（服务端会轮换 refresh_token，旧的立即作废） */
export async function refreshTokens(refreshToken: string): Promise<TokenSet> {
  return toTokenSet(
    await postToken({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: CLIENT_ID,
    }),
  )
}

export async function fetchUserinfo(accessToken: string): Promise<OAuthUser> {
  let data: unknown = null
  try {
    const res = await fetch(API_USERINFO, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    data = await res.json()
    if (!res.ok) throw new OauthError(friendlyError('http_' + res.status))
  } catch (e) {
    throw e instanceof OauthError ? e : new OauthError(requestError(e))
  }
  const u = data as Partial<OAuthUser> | null
  if (!u || typeof u.sub !== 'string' || !u.sub) {
    throw new OauthError('用户资料格式异常，请重新登录')
  }
  return {
    sub: u.sub,
    username: u.username || '未命名用户',
    email: u.email,
    avatar: u.avatar,
    created_at: u.created_at,
  }
}

/** 撤销令牌（服务端约定无论成败恒 200，调用方无需处理失败） */
export async function revokeToken(token: string): Promise<void> {
  await fetch(API_REVOKE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token, client_id: CLIENT_ID }),
  })
}

function toTokenSet(t: TokenResponse): TokenSet {
  const expiresIn = t.expires_in && t.expires_in > 0 ? t.expires_in : 7200
  return {
    accessToken: t.access_token,
    refreshToken: t.refresh_token ?? null,
    accessExpiresAt: Date.now() + expiresIn * 1000,
  }
}

/** 同源服务端代理（functions/api/oauth/*），client_secret 在服务端注入 */
const API_TOKEN = '/api/oauth/token'
const API_USERINFO = '/api/oauth/userinfo'
const API_REVOKE = '/api/oauth/revoke'

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  type TokenOrError = { error?: string; error_description?: string } & Partial<TokenResponse>
  let data: TokenOrError | null = null
  let res: Response
  try {
    res = await fetch(API_TOKEN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, client_id: CLIENT_ID }),
    })
    data = (await res.json().catch(() => null)) as TokenOrError | null
  } catch (e) {
    throw e instanceof TypeError ? e : new OauthError(requestError(e))
  }
  if (!res.ok || !data?.access_token) {
    throw new OauthError(friendlyError(data?.error ?? `http_${res.status}`, data?.error_description))
  }
  return data as TokenResponse
}
