import { useMemo } from 'react'
import { ClockCounterClockwise, FolderPlus, ImagesSquare, Lock, Check } from '@phosphor-icons/react'
import { Modal } from './Modal'
import { useGallery, useToasts } from '../lib/store'
import { useT } from '../lib/i18n'
import type { Photo } from '../lib/types'

interface Props {
  open: boolean
  onClose: () => void
  /** 待移动的照片（调用方保证非空） */
  photos: Photo[]
  /** 移动成功后的收尾（退出多选等） */
  onMoved: () => void
}

/**
 * 批量移动照片：选择目标相册，或移出相册回首页时间流。
 * 目标列表 = 全部相册（当前所在相册禁选）+「时间流」（有照片在相册里时才出现）。
 */
export function MoveModal({ open, onClose, photos, onMoved }: Props) {
  const albums = useGallery((s) => s.albums)
  const movePhotos = useGallery((s) => s.movePhotos)
  const toast = useToasts((s) => s.toast)
  const { t } = useT()

  const ids = useMemo(() => photos.map((p) => p.id), [photos])
  /** 目标相册 id 集合：所选照片当前所在的所有相册（都禁选） */
  const currentAlbumIds = useMemo(
    () => new Set(photos.map((p) => p.albumId).filter((v): v is string => !!v)),
    [photos],
  )
  /** 有照片在相册里 → 提供「移出相册」选项 */
  const canMoveToFeed = currentAlbumIds.size > 0

  const move = async (targetAlbumId: string | null) => {
    try {
      await movePhotos(ids, targetAlbumId)
      toast(t('move.done', { n: ids.length }))
      onClose()
      onMoved()
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : t('err.saveFail'), 'error')
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={t('move.title', { n: ids.length })} width={440}>
      <div className="move-list" role="listbox" aria-label={t('move.title', { n: ids.length })}>
        {canMoveToFeed && (
          <button type="button" className="move-item" role="option" onClick={() => void move(null)}>
            <span className="move-item-icon">
              <ClockCounterClockwise size={18} />
            </span>
            <span className="move-item-text">
              <strong>{t('move.toFeed')}</strong>
              <small>{t('move.feedHint')}</small>
            </span>
          </button>
        )}
        {albums.map((a) => {
          const isCurrent = currentAlbumIds.has(a.id)
          return (
            <button
              key={a.id}
              type="button"
              className="move-item"
              role="option"
              disabled={isCurrent}
              aria-selected={isCurrent}
              onClick={() => void move(a.id)}
            >
              <span className="move-item-icon alt">
                {a.type === 'wall' ? <ImagesSquare size={18} /> : <FolderPlus size={18} />}
              </span>
              <span className="move-item-text">
                <strong>
                  {a.name}
                  {a.password && (
                    <span className="move-item-lock">
                      <Lock size={11} weight="fill" />
                    </span>
                  )}
                </strong>
                <small>{t('move.albumMeta', { n: a.photoIds.length })}</small>
              </span>
              {isCurrent && (
                <span className="move-item-current">
                  <Check size={13} weight="bold" />
                  {t('move.current')}
                </span>
              )}
            </button>
          )
        })}
        {albums.length === 0 && !canMoveToFeed && (
          <p className="move-empty">{t('move.noTarget')}</p>
        )}
      </div>
    </Modal>
  )
}
