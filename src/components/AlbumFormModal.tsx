import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { Eye, EyeSlash, Lock, PushPin, SquaresFour } from '@phosphor-icons/react'
import type { Album, AlbumType } from '../lib/types'
import { useGallery, useToasts, albumPhotos } from '../lib/store'
import { autoArrange } from '../lib/wallLayout'
import { DEFAULT_WALL_BG, WALL_PRESETS } from '../lib/wallPresets'
import { Modal } from './Modal'
import { useT } from '../lib/i18n'

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
  const { t, lang } = useT()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState<AlbumType>('grid')
  const [background, setBackground] = useState(DEFAULT_WALL_BG)
  const [pwEnabled, setPwEnabled] = useState(false)
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [shakeKey, setShakeKey] = useState(0)

  useEffect(() => {
    if (open) {
      setName(album?.name ?? '')
      setDescription(album?.description ?? '')
      setType(album?.type ?? 'grid')
      setBackground(album?.wall?.background ?? DEFAULT_WALL_BG)
      setPwEnabled(!!album?.password)
      setPassword(album?.password ?? '')
      setShowPw(false)
      setError('')
    }
  }, [open, album])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const pw = pwEnabled ? password.trim() : ''
    if (!name.trim()) {
      setError(t('form.nameError'))
      setShakeKey((k) => k + 1)
      return
    }
    if (pwEnabled && pw.length < 4) {
      setError(t('form.pwError'))
      setShakeKey((k) => k + 1)
      return
    }
    try {
      if (isEdit && album) {
        const patch: Parameters<typeof updateAlbum>[1] = {
          name: name.trim(),
          description: description.trim(),
          password: pw || null,
          type,
        }
        if (type === 'wall') {
          // 已有布局则只换背景；首次切到照片墙时给存量照片生成初始散布
          const existing = album.wall?.items ?? []
          const items =
            existing.length > 0
              ? existing
              : autoArrange(albumPhotos(useGallery.getState().photos, album.id))
          patch.wall = { ...album.wall, background, items }
        }
        updateAlbum(album.id, patch)
        toast(t('form.updated'))
      } else {
        const created = await createAlbum({
          name: name.trim(),
          description: description.trim(),
          password: pw || null,
          type,
          wall: type === 'wall' ? { background, items: [] } : undefined,
        })
        toast(t('form.created'))
        onClose()
        navigate(`/album/${created.id}`)
        return
      }
      onClose()
    } catch (err) {
      toast(err instanceof Error && err.message ? err.message : t('err.saveFail'), 'error')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={isEdit ? t('form.editTitle') : t('form.newTitle')}>
      <motion.form
        key={shakeKey}
        onSubmit={submit}
        animate={shakeKey ? { x: [0, -9, 9, -5, 5, 0] } : undefined}
        transition={{ duration: 0.4 }}
        noValidate
      >
        <div className="field">
          <label htmlFor="album-name">{t('form.name')}</label>
          <input
            id="album-name"
            className="input"
            placeholder={t('form.namePh')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={24}
            autoFocus
          />
        </div>

        <div className="field">
          <label htmlFor="album-desc">{t('form.desc')}</label>
          <textarea
            id="album-desc"
            className="textarea"
            rows={2}
            placeholder={t('form.descPh')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={60}
          />
        </div>

        <div className="field">
          <label>{t('form.type')}</label>
          <div className="type-row" role="radiogroup" aria-label={t('form.type')}>
            <button
              type="button"
              role="radio"
              aria-checked={type === 'grid'}
              className={type === 'grid' ? 'type-card on' : 'type-card'}
              onClick={() => setType('grid')}
            >
              <SquaresFour size={20} weight={type === 'grid' ? 'fill' : 'regular'} />
              <strong>{t('form.typeGrid')}</strong>
              <span>{t('form.typeGridDesc')}</span>
            </button>
            <button
              type="button"
              role="radio"
              aria-checked={type === 'wall'}
              className={type === 'wall' ? 'type-card on' : 'type-card'}
              onClick={() => setType('wall')}
            >
              <PushPin size={20} weight={type === 'wall' ? 'fill' : 'regular'} />
              <strong>{t('form.typeWall')}</strong>
              <span>{t('form.typeWallDesc')}</span>
            </button>
          </div>
        </div>

        {type === 'wall' && (
          <div className="field">
            <label>{t('form.wallBg')}</label>
            <div className="bg-row" role="group" aria-label={t('form.wallBg')}>
              {WALL_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className={background === p.id ? 'bg-dot on' : 'bg-dot'}
                  style={{ background: p.css }}
                  onClick={() => setBackground(p.id)}
                  aria-label={p.name[lang]}
                  aria-pressed={background === p.id}
                  title={p.name[lang]}
                />
              ))}
            </div>
          </div>
        )}

        <div className="field">
          <div className="switch-row">
            <span className="switch-label">
              <Lock size={15} weight={pwEnabled ? 'fill' : 'regular'} />
              {t('form.pwLock')}
            </span>
            <button
              type="button"
              className="switch"
              role="switch"
              aria-checked={pwEnabled}
              data-on={pwEnabled}
              onClick={() => setPwEnabled((v) => !v)}
              aria-label={t('form.togglePw')}
            />
          </div>
          {pwEnabled && (
            <div className="input-affix">
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
                className="affix-btn"
                onClick={() => setShowPw((v) => !v)}
                aria-label={showPw ? t('form.hidePw') : t('form.showPw')}
              >
                {showPw ? <EyeSlash size={17} /> : <Eye size={17} />}
              </button>
            </div>
          )}
          <small className="field-hint">{t('form.pwHint')}</small>
        </div>

        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            {t('form.cancel')}
          </button>
          <button type="submit" className="btn btn-primary">
            {isEdit ? t('form.save') : t('form.create')}
          </button>
        </div>
      </motion.form>
    </Modal>
  )
}
