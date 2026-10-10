import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowClockwise, ArrowLeft, WarningCircle } from '@phosphor-icons/react'
import { beginLogin, completeLogin } from '../lib/oauth'
import { useAuth } from '../lib/auth'
import { useToasts } from '../lib/store'
import { tr, useT } from '../lib/i18n'

/** 接收工具站授权回跳（?code=&state= 或 ?error=），完成换令牌与资料拉取 */
export function AuthCallbackPage() {
  const navigate = useNavigate()
  const toast = useToasts((s) => s.toast)
  const { t } = useT()
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
        toast(tr('auth.welcome', { name: result.user.username }))
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
            <h1 className="auth-title">{t('auth.fail')}</h1>
            <p className="auth-sub">{error}</p>
            <div className="auth-actions">
              <button className="btn btn-ghost" onClick={() => navigate('/', { replace: true })}>
                <ArrowLeft size={15} weight="bold" />
                {t('auth.backHome')}
              </button>
              <button className="btn btn-primary" onClick={() => void beginLogin('/')}>
                <ArrowClockwise size={15} weight="bold" />
                {t('auth.retry')}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="auth-spinner" role="status" aria-label={t('auth.aria')} />
            <h1 className="auth-title">{t('auth.loading')}</h1>
            <p className="auth-sub">{t('auth.loadingSub')}</p>
          </>
        )}
      </div>
    </div>
  )
}
