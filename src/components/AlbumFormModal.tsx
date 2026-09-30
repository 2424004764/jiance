import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Eye, EyeSlash, Lock } from '@phosphor-icons/react'
import type { Album } from '../lib/types'
import { useGallery, useToasts } from '../lib/store'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onClose: () => void
  /** 传入则为编辑模式 */
  album?: Album | null
}

export function AlbumFormModal({ open, onClose, album }: Props) {
  const isEdit = !!album
  const createAlbum = useGallery((s) => s.createAlbum)
  const updateAlbum = useGallery((s) => s.updateAlbum)
  const toast = useToasts((s) => s.toast)
  const navigate = useNavigate()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [pwEnabled, setPwEnabled] = useState(false)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [shakeKey, setShakeKey] = useState(0)

  useEffect(() => {
    if (open) {
      setName(album?.name ?? '')
      setDescription(album?.description ?? '')
      setPwEnabled(!!album?.password)
      setPassword(album?.password ?? '')
      setShowPw(false)
      setError('')
    }
  }, [open, album])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const pw = pwEnabled ? password.trim() : ''
    if (!name.trim()) {
      setError('请输入相册名称')
      setShakeKey((k) => k + 1)
      return
    }
    if (pwEnabled && pw.length < 4) {
      setError('密码至少需要 4 位')
      setShakeKey((k) => k + 1)
      return
    }
    if (isEdit && album) {
      updateAlbum(album.id, { name: name.trim(), description: description.trim(), password: pw || null })
      toast('相册已更新')
    } else {
      const created = createAlbum({ name: name.trim(), description: description.trim(), password: pw || null })
      toast('相册已创建')
      navigate(`/album/${created.id}`)
    }
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? '编辑相册' : '新建相册'}>
      <motion.form
        key={shakeKey}
        onSubmit={submit}
        animate={shakeKey ? { x: [0, -9, 9, -5, 5, 0] } : undefined}
        transition={{ duration: 0.4 }}
        noValidate
      >
        <div className="field">
          <label htmlFor="album-name">名称</label>
          <input
            id="album-name"
            className="input"
            placeholder="给这组照片起个名字"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="album-desc">描述（可选）</label>
          <textarea
            id="album-desc"
            className="textarea"
            rows={2}
            placeholder="一句话记录这组照片"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={60}
          />
        </div>

        <div className="field">
          <div className="switch-row">
            <span className="switch-label">
              <Lock size={15} weight={pwEnabled ? 'fill' : 'regular'} />
              密码保护
            </span>
            <button
              type="button"
              className="switch"
              role="switch"
              aria-checked={pwEnabled}
              data-on={pwEnabled}
              onClick={() => setPwEnabled((v) => !v)}
              aria-label="切换密码保护"
            />
          </div>
          {pwEnabled && (
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
          )}
          <small className="field-hint">开启后，通过分享链接访问需要先输入密码</small>
        </div>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button type="submit" className="btn btn-primary">
            {isEdit ? '保存修改' : '创建相册'}
          </button>
        </div>
      </motion.form>
    </Modal>
  )
}
