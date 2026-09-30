import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { LockKey } from '@phosphor-icons/react'

interface Props {
  albumName: string
  /** 返回是否验证通过 */
  onSubmit: (password: string) => boolean
}

export function PasswordGate({ albumName, onSubmit }: Props) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [shakeKey, setShakeKey] = useState(0)
  const reduce = useReducedMotion()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim()) return
    if (onSubmit(value.trim())) {
      setError('')
    } else {
      setError('密码不正确，请重试')
      setShakeKey((k) => k + 1)
    }
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
          <h1 className="gate-title">这个相册已上锁</h1>
          <p className="gate-sub">输入「{albumName}」的访问密码继续查看</p>
          <input
            className="input gate-input"
            type="password"
            placeholder="访问密码"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            aria-label="访问密码"
          />
          <button type="submit" className="btn btn-primary btn-block">
            解锁相册
          </button>
          <p className="gate-error" role="alert">
            {error}
          </p>
        </motion.form>
      </motion.div>
    </div>
  )
}
