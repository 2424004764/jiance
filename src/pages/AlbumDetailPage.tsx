import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence } from 'motion/react'
import {
  ArrowLeft,
  Plus,
  ShareFat,
  PencilSimple,
  TrashSimple,
  Lock,
  ImagesSquare,
} from '@phosphor-icons/react'
import { albumPhotos, useGallery } from '../lib/store'
import { relativeTime } from '../lib/format'
import { useUpload } from '../lib/useUpload'
import type { Photo } from '../lib/types'
import { PageTransition } from '../components/PageTransition'
import { MasonryGrid } from '../components/MasonryGrid'
import { Lightbox } from '../components/Lightbox'
import { EmptyState } from '../components/EmptyState'
import { AlbumFormModal } from '../components/AlbumFormModal'
import { ShareModal } from '../components/ShareModal'
import { ConfirmModal } from '../components/ConfirmModal'

export function AlbumDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const album = useGallery((s) => s.albums.find((a) => a.id === id))
  const photos = useGallery((s) => s.photos)
  const deleteAlbum = useGallery((s) => s.deleteAlbum)
  const deletePhoto = useGallery((s) => s.deletePhoto)
  const upload = useUpload()

  const [lbIndex, setLbIndex] = useState<number | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const list: Photo[] = useMemo(
    () => (album ? albumPhotos(photos, album.id) : []),
    [photos, album],
  )

  useEffect(() => {
    document.title = album ? `${album.name} · 拾光集` : '相册不存在 · 拾光集'
  }, [album])

  if (!album) {
    return (
      <PageTransition>
        <EmptyState
          icon={<ImagesSquare size={30} weight="thin" />}
          title="相册不存在"
          desc="它可能已经被删除，链接可能输错了"
          action={
            <Link className="btn btn-ghost" to="/albums">
              <ArrowLeft size={16} />
              返回相册集
            </Link>
          }
        />
      </PageTransition>
    )
  }

  return (
    <PageTransition>
      <div className="detail-top">
        <Link to="/albums" className="back-link">
          <ArrowLeft size={15} />
          相册集
        </Link>

        <div className="detail-head">
          <div className="detail-title-wrap">
            <h1 className="detail-title">{album.name}</h1>
            {album.password && (
              <span className="chip chip-lock">
                <Lock size={12} weight="fill" />
                已加密
              </span>
            )}
          </div>
          {album.description && <p className="detail-desc">{album.description}</p>}
          <p className="hero-meta">
            {list.length} 张照片，{relativeTime(album.updatedAt)}更新
          </p>

          <div className="detail-actions">
            <button className="btn btn-primary" onClick={() => upload(album.id)}>
              <Plus size={16} weight="bold" />
              添加照片
            </button>
            <button className="btn btn-ghost" onClick={() => setShareOpen(true)}>
              <ShareFat size={16} weight="fill" />
              分享
            </button>
            <button className="btn-icon" onClick={() => setEditOpen(true)} aria-label="编辑相册">
              <PencilSimple size={17} />
            </button>
            <button
              className="btn-icon danger"
              onClick={() => setDeleteOpen(true)}
              aria-label="删除相册"
            >
              <TrashSimple size={17} />
            </button>
          </div>
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<ImagesSquare size={30} weight="thin" />}
          title="相册里还没有照片"
          desc="点上面的「添加照片」，把这一集填满"
          action={
            <button className="btn btn-primary" onClick={() => upload(album.id)}>
              <Plus size={16} weight="bold" />
              添加照片
            </button>
          }
        />
      ) : (
        <MasonryGrid photos={list} onOpen={setLbIndex} />
      )}

      <AnimatePresence>
        {lbIndex !== null && (
          <Lightbox
            photos={list}
            index={lbIndex}
            onClose={() => setLbIndex(null)}
            onNavigate={setLbIndex}
            onRemove={() => {
              const photo = list[lbIndex]
              if (photo) deletePhoto(photo.id)
              setLbIndex(null)
            }}
          />
        )}
      </AnimatePresence>

      <AlbumFormModal open={editOpen} onClose={() => setEditOpen(false)} album={album} />
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} album={album} />
      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          deleteAlbum(album.id)
          navigate('/albums')
        }}
        title="删除相册"
        desc="相册内的照片不会消失，会回到首页时间流继续按时间排列。"
      />
    </PageTransition>
  )
}
