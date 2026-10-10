import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { LockKey } from '@phosphor-icons/react'
import { useT } from '../lib/i18n'

interface Props {
  albumName: string
  /** 返回是否验证通过（可异步，如通过服务端校验分享密码） */
  onSubmit: (password: string) => boolean | Promise<boolean>
}

export function PasswordGate({ albumName, onSubmit }: Props) {
  const { t } = useT()
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [shakeKey, setShakeKey] = useState(0)
  const reduce = useReducedMotion()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const password = value.trim()
    if (!password || busy) return
    setBusy(true)
    Promise.resolve(onSubmit(password))
      .then((ok) => {
        if (ok) {
          setError('')
        } else {
          setError(t('gate.error'))
          setShakeKey((k) => k + 1)
        }
      })
      .finally(() => setBusy(false))
  }

  return (
    <div className="gate-page">
      <motion.div
        className="gate-card glass"
        initial={reduce ? false : { opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <motion.form
          key={shakeKey}
          onSubmit={submit}
          animate={shakeKey ? { x: [0, -10, 10, -6, 6, 0] } : undefined}
          transition={{ duration: 0.45 }}
          noValidate
        >
          <div className="gate-icon">
            <LockKey size={26} weight="fill" />
          </div>
          <h1 className="gate-title">{t('gate.title')}</h1>
          <p className="gate-sub">{t('gate.sub', { name: albumName })}</p>
          <input
            className="input gate-input"
            type="password"
            placeholder={t('gate.placeholder')}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            aria-label={t('gate.placeholder')}
          />
          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {t('gate.submit')}
          </button>
          <p className="gate-error" role="alert">
            {error}
          </p>
        </motion.form>
      </motion.div>
    </div>
  )
}
