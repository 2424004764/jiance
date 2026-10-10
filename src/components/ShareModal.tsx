import { useEffect, useState } from 'react'
import { CopySimple, ShieldCheck, LockOpen, ArrowsClockwise, Eye, EyeSlash } from '@phosphor-icons/react'
import type { Album } from '../lib/types'
import { useGallery, useToasts } from '../lib/store'
import { Modal } from './Modal'
import { useT } from '../lib/i18n'

/* ---------- 随机访问密码 ---------- */
const PW_LOWER = 'abcdefghjkmnpqrstuvwxyz'
const PW_UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const PW_DIGIT = '23456789'
const PW_ALL = PW_LOWER + PW_UPPER + PW_DIGIT

function randomInt(max: number): number {
  if (globalThis.crypto?.getRandomValues) {
    const buf = new Uint32Array(1)
    globalThis.crypto.getRandomValues(buf)
    return buf[0] % max
  }
  return Math.floor(Math.random() * max)
}

/** 8 位易读密码：至少含大小写与数字，剔除易混淆字符（0/o/1/l/I） */
function generateAccessPassword(): string {
  const chars = [
    PW_LOWER[randomInt(PW_LOWER.length)],
    PW_UPPER[randomInt(PW_UPPER.length)],
    PW_DIGIT[randomInt(PW_DIGIT.length)],
  ]
  while (chars.length < 8) chars.push(PW_ALL[randomInt(PW_ALL.length)])
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1)
    ;[chars[i], chars[j]] = [chars[j], chars[i]]
  }
  return chars.join('')
}

interface Props {
  open: boolean
  onClose: () => void
  album: Album | null
}

export function ShareModal({ open, onClose, album }: Props) {
  const updateAlbum = useGallery((s) => s.updateAlbum)
  const toast = useToasts((s) => s.toast)
  const { t } = useT()

  const [pwEnabled, setPwEnabled] = useState(false)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (open && album) {
      setPwEnabled(!!album.password)
      setPassword(album.password ?? '')
      setShowPw(false)
      setCopied(false)
    }
    // 只在打开/切换相册时初始化；保存密码后 album 引用变化不应打断输入与明文显示
  }, [open, album?.id])

  if (!album) return null

  const link = `${window.location.origin}/s/${album.shareId}`
  const savedPw = album.password ?? ''
  const pwDirty = password.trim() !== savedPw

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = link
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
    }
    setCopied(true)
    toast(t('share.copied'))
    setTimeout(() => setCopied(false), 2000)
  }

  const applyPassword = (enabled: boolean, pw: string) => {
    if (enabled && pw.trim().length < 4) return
    updateAlbum(album.id, { password: enabled ? pw.trim() : null })
    toast(enabled ? t('share.pwOn') : t('share.pwOff'))
  }

  /** 生成新密码并立即生效（开启保护 / 重新生成共用） */
  const autoGenerate = () => {
    const pw = generateAccessPassword()
    setPassword(pw)
    setShowPw(true)
    updateAlbum(album.id, { password: pw })
    toast(t('share.pwAuto'))
  }

  const regenerate = () => {
    const chars = Math.random().toString(36).slice(2, 10)
    updateAlbum(album.id, { shareId: chars })
    toast(t('share.resetDone'))
  }

  const pwInvalid = pwEnabled && password.trim().length < 4

  return (
    <Modal open={open} onClose={onClose} title={t('share.title')} width={520}>
      <div className="share-block">
        <label className="share-label">{t('share.linkLabel')}</label>
        <div className="input-affix">
          <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label={t('share.linkLabel')} />
          <button type="button" className="affix-btn accent" onClick={copyLink} aria-label={t('share.copy')}>
            <CopySimple size={17} weight={copied ? 'fill' : 'regular'} />
          </button>
        </div>
        <div className="share-tip-row">
          <small className="field-hint">{t('share.hint')}</small>
          <button type="button" className="link-btn" onClick={regenerate}>
            <ArrowsClockwise size={13} />
            {t('share.reset')}
          </button>
        </div>
      </div>

      <div className="share-divider" />

      <div className="share-block">
        <div className="switch-row">
          <span className="switch-label">
            {pwEnabled ? <ShieldCheck size={16} weight="fill" /> : <LockOpen size={16} />}
            {t('form.pwLock')}
          </span>
          <button
            type="button"
            className="switch"
            role="switch"
            aria-checked={pwEnabled}
            data-on={pwEnabled}
            onClick={() => {
              const next = !pwEnabled
              setPwEnabled(next)
              if (next) autoGenerate()
              else applyPassword(false, '')
            }}
            aria-label={t('form.togglePw')}
          />
        </div>

        {pwEnabled ? (
          <div className="input-affix duo">
            <input
              className="input"
              type={showPw ? 'text' : 'password'}
              placeholder={t('form.pwPh')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={20}
            />
            <button
              type="button"
              className="affix-btn duo-prev"
              onClick={autoGenerate}
              aria-label={t('share.pwRegen')}
              title={t('share.pwRegen')}
            >
              <ArrowsClockwise size={17} />
            </button>
            <button
              type="button"
              className="affix-btn"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? t('form.hidePw') : t('form.showPw')}
            >
              {showPw ? <EyeSlash size={17} /> : <Eye size={17} />}
            </button>
          </div>
        ) : (
          <small className="field-hint">{t('share.pwHint')}</small>
        )}

        {pwEnabled && (
          <div className="share-tip-row">
            <small className={pwInvalid ? 'field-error' : 'field-hint'}>
              {pwInvalid
                ? t('share.pwShort')
                : pwDirty
                  ? t('share.pwDirty')
                  : t('share.currentPw', { pw: savedPw || t('share.pwNotSet') })}
            </small>
            <button
              type="button"
              className="link-btn"
              disabled={!pwDirty || pwInvalid}
              onClick={() => applyPassword(true, password)}
            >
              {t('share.savePw')}
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
