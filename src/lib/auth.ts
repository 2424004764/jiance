import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import { safeLocalStorage } from './store'
import { refreshTokens, revokeToken, type OAuthUser, type TokenSet } from './oauth'

interface AuthState {
  user: OAuthUser | null
  tokens: TokenSet | null
  signIn: (user: OAuthUser, tokens: TokenSet) => void
  signOut: () => void
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      tokens: null,
      signIn: (user, tokens) => set({ user, tokens }),
      signOut: () => set({ user: null, tokens: null }),
    }),
    {
      name: 'shiguang-auth-v1',
      storage: createJSONStorage(() => safeLocalStorage),
      version: 1,
    },
  ),
)

let refreshing: Promise<string | null> | null = null

/** 获取未过期的 access_token；过期时用 refresh_token 刷新（并发只刷一次，刷新失败清除本地会话） */
export async function getAccessToken(): Promise<string | null> {
  const { tokens } = useAuth.getState()
  if (!tokens) return null
  if (Date.now() < tokens.accessExpiresAt - 60_000) return tokens.accessToken
  if (!tokens.refreshToken) return null

  refreshing ??= refreshTokens(tokens.refreshToken)
    .then((next) => {
      useAuth.setState({ tokens: next })
      return next.accessToken
    })
    .catch(() => {
      // refresh_token 已失效（被轮换/撤销/过期），本地会话随之作废
      useAuth.getState().signOut()
      return null
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

/** 退出登录：清除本地会话，并尽力撤销服务端令牌 */
export async function logout(): Promise<void> {
  const { tokens } = useAuth.getState()
  useAuth.getState().signOut()
  if (!tokens) return
  for (const token of [tokens.refreshToken, tokens.accessToken]) {
    if (token) revokeToken(token).catch(() => {})
  }
}
