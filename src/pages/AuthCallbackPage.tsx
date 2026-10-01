import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowClockwise, ArrowLeft, WarningCircle } from '@phosphor-icons/react'
import { beginLogin, completeLogin } from '../lib/oauth'
import { useAuth } from '../lib/auth'
import { useToasts } from '../lib/store'

/** 接收工具站授权回跳（?code=&state= 或 ?error=），完成换令牌与资料拉取 */
export function AuthCallbackPage() {
  const navigate = useNavigate()
  const toast = useToasts((s) => s.toast)
  const signIn = useAuth((s) => s.signIn)
  const [error, setError] = useState<string | null>(null)
  // StrictMode 双执行防抖：completeLogin 内部已单飞，这里避免重复 toast/跳转
  const ran = useRef(false)

  useEffect(() => {
    if (ran.current) return
    ran.current = true
    completeLogin(new URLSearchParams(window.location.search)).then((result) => {
      if (result.ok) {
        signIn(result.user, result.tokens)
        toast(`欢迎回来，${result.user.username}`)
        navigate(result.returnTo || '/', { replace: true })
      } else {
        setError(result.message)
      }
    })
  }, [navigate, signIn, toast])

  return (
    <div className="gate-page">
      <div className="gate-card glass auth-card">
        {error ? (
          <>
            <div className="auth-status-icon err">
              <WarningCircle size={26} weight="bold" />
            </div>
            <h1 className="auth-title">登录失败</h1>
            <p className="auth-sub">{error}</p>
            <div className="auth-actions">
              <button className="btn btn-ghost" onClick={() => navigate('/', { replace: true })}>
                <ArrowLeft size={15} weight="bold" />
                返回首页
              </button>
              <button className="btn btn-primary" onClick={() => void beginLogin('/')}>
                <ArrowClockwise size={15} weight="bold" />
                重新登录
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="auth-spinner" role="status" aria-label="正在登录" />
            <h1 className="auth-title">正在完成登录…</h1>
            <p className="auth-sub">正在通过工具箱账号完成安全验证，请稍候</p>
          </>
        )}
      </div>
    </div>
  )
}
