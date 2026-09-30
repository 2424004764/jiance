import { useEffect, useState } from 'react'
import { CopySimple, ShieldCheck, LockOpen, ArrowsClockwise, Eye, EyeSlash } from '@phosphor-icons/react'
import type { Album } from '../lib/types'
import { useGallery, useToasts } from '../lib/store'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onClose: () => void
  album: Album | null
}

export function ShareModal({ open, onClose, album }: Props) {
  const updateAlbum = useGallery((s) => s.updateAlbum)
  const toast = useToasts((s) => s.toast)

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
  }, [open, album])

  if (!album) return null

  const link = `${window.location.origin}/s/${album.shareId}`

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
    toast('分享链接已复制')
    setTimeout(() => setCopied(false), 2000)
  }

  const applyPassword = (enabled: boolean, pw: string) => {
    if (enabled && pw.trim().length < 4) return
    updateAlbum(album.id, { password: enabled ? pw.trim() : null })
    toast(enabled ? '密码保护已开启' : '密码保护已关闭')
  }

  const regenerate = () => {
    const chars = Math.random().toString(36).slice(2, 10)
    updateAlbum(album.id, { shareId: chars })
    toast('已生成新链接，旧链接同时失效')
  }

  const pwInvalid = pwEnabled && password.trim().length < 4

  return (
    <Modal open={open} onClose={onClose} title="分享相册" width={520}>
      <div className="share-block">
        <label className="share-label">分享链接</label>
        <div className="input-affix">
          <input className="input" readOnly value={link} onFocus={(e) => e.target.select()} aria-label="分享链接" />
          <button type="button" className="affix-btn accent" onClick={copyLink} aria-label="复制链接">
            <CopySimple size={17} weight={copied ? 'fill' : 'regular'} />
          </button>
        </div>
        <div className="share-tip-row">
          <small className="field-hint">任何拿到链接的人都可以访问这个页面</small>
          <button type="button" className="link-btn" onClick={regenerate}>
            <ArrowsClockwise size={13} />
            重置链接
          </button>
        </div>
      </div>

      <div className="share-divider" />

      <div className="share-block">
        <div className="switch-row">
          <span className="switch-label">
            {pwEnabled ? <ShieldCheck size={16} weight="fill" /> : <LockOpen size={16} />}
            密码保护
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
              if (!next) applyPassword(false, '')
            }}
            aria-label="切换密码保护"
          />
        </div>

        {pwEnabled ? (
          <div className="input-affix">
            <input
              className="input"
              type={showPw ? 'text' : 'password'}
              placeholder="访问密码，至少 4 位"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={20}
            />
            <button
              type="button"
              className="affix-btn"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? '隐藏密码' : '显示密码'}
            >
              {showPw ? <EyeSlash size={17} /> : <Eye size={17} />}
            </button>
          </div>
        ) : (
          <small className="field-hint">未开启时，链接即钥匙；开启后访问者需输入密码</small>
        )}

        {pwEnabled && (
          <div className="share-tip-row">
            <small className={pwInvalid ? 'field-error' : 'field-hint'}>
              {pwInvalid ? '密码至少需要 4 位' : `当前密码：${album.password ?? '尚未保存'}`}
            </small>
            <button
              type="button"
              className="link-btn"
              disabled={pwInvalid}
              onClick={() => applyPassword(true, password)}
            >
              保存密码
            </button>
          </div>
        )}
      </div>
    </Modal>
  )
}
