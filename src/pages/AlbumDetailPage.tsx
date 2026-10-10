import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowLeft,
  Plus,
  ShareFat,
  PencilSimple,
  TrashSimple,
  Lock,
  ImagesSquare,
  SignIn,
  Checks,
  PushPin,
  DownloadSimple,
  FolderSimple,
} from '@phosphor-icons/react'
import { albumPhotos, useGallery, useToasts } from '../lib/store'
import { useGallerySyncStatus } from '../lib/gallerySync'
import { useAuth } from '../lib/auth'
import { beginLogin, oauthConfigured } from '../lib/oauth'
import { relativeTime } from '../lib/format'
import { useUpload } from '../lib/useUpload'
import { usePhotoDelete } from '../lib/usePhotoDelete'
import { exportWallImage } from '../lib/wallExport'
import { autoArrange } from '../lib/wallLayout'
import { DEFAULT_WALL_BG } from '../lib/wallPresets'
import type { Photo, WallConfig } from '../lib/types'
import { PageTransition } from '../components/PageTransition'
import { MasonryGrid } from '../components/MasonryGrid'
import { PhotoWall } from '../components/PhotoWall'
import { Lightbox } from '../components/Lightbox'
import { EmptyState } from '../components/EmptyState'
import { AlbumFormModal } from '../components/AlbumFormModal'
import { ShareModal } from '../components/ShareModal'
import { ConfirmModal } from '../components/ConfirmModal'
import { SyncFallback } from '../components/SyncFallback'
import { MoveModal } from '../components/MoveModal'
import { useT } from '../lib/i18n'

export function AlbumDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const album = useGallery((s) => s.albums.find((a) => a.id === id))
  const photos = useGallery((s) => s.photos)
  const deleteAlbum = useGallery((s) => s.deleteAlbum)
  const updateAlbum = useGallery((s) => s.updateAlbum)
  const removePhotos = usePhotoDelete()
  const upload = useUpload()
  const user = useAuth((s) => s.user)
  const syncStatus = useGallerySyncStatus((s) => s.status)
  const toast = useToasts((s) => s.toast)
  const { t, lang } = useT()

  /** 未登录只读：改动类操作要求先登录 */
  const requireLogin = (action: () => void) => {
    if (!user) {
      toast(t('toast.loginToUpload'), 'error')
      return
    }
    action()
  }

  const [lbIndex, setLbIndex] = useState<number | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [confirmPhoto, setConfirmPhoto] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [confirmBatch, setConfirmBatch] = useState(false)
  const [deleting, setDeleting] = useState(false)
  /** 照片墙：布局编辑态与导出状态（仅 wall 类型相册使用） */
  const [wallEdit, setWallEdit] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [moveOpen, setMoveOpen] = useState(false)

  const list: Photo[] = useMemo(
    () => (album ? albumPhotos(photos, album.id) : []),
    [photos, album],
  )
  const isWall = album?.type === 'wall'

  const handleWallChange = useCallback(
    (wall: WallConfig) => {
      if (album) updateAlbum(album.id, { wall })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [album?.id],
  )

  const doExportWall = async () => {
    if (exporting || !album || list.length === 0) return
    // 布局缺失（旧数据/尚未整理）时按当前照片临时散布一张
    const wall = album.wall ?? { background: DEFAULT_WALL_BG, items: autoArrange(list) }
    setExporting(true)
    try {
      await exportWallImage(album.name, wall, list)
      toast(t('wall.exported'))
    } catch {
      toast(t('wall.exportFail'), 'error')
    } finally {
      setExporting(false)
    }
  }

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const exitSelect = () => {
    setSelectMode(false)
    setSelected(new Set())
  }

  const allSelected = list.length > 0 && list.every((p) => selected.has(p.id))
  const selectedPhotos = list.filter((p) => selected.has(p.id))

  /** 确认后的实际删除：先删云端 R2 对象，成功才移除本地记录并收尾 UI；返回值供确认弹窗决定是否关闭 */
  const performDelete = async (targets: Photo[]): Promise<boolean> => {
    if (deleting || targets.length === 0) return false
    setDeleting(true)
    const ok = await removePhotos(targets)
    setDeleting(false)
    if (ok) {
      setLbIndex(null)
      exitSelect()
    }
    return ok
  }

  useEffect(() => {
    document.title = album
      ? `${album.name} · ${t('brand')}`
      : syncStatus === 'ready'
        ? t('detail.notFoundDoc')
        : t('brand')
  }, [album, t, lang, syncStatus])

  const startLogin = () => {
    if (!oauthConfigured) {
      toast(t('toast.needConfig'), 'error')
      return
    }
    void beginLogin()
  }

  if (!album) {
    /* 未登录：私人空间不对外展示，引导登录 */
    if (!user) {
      return (
        <PageTransition>
          <EmptyState
            icon={<SignIn size={30} weight="thin" />}
            title={t('detail.loginTitle')}
            desc={t('detail.loginDesc')}
            action={
              <button className="btn btn-primary" onClick={startLogin}>
                <SignIn size={16} weight="bold" />
                {t('landing.cta')}
              </button>
            }
          />
        </PageTransition>
      )
    }
    /* 云端首次同步未完成：本地没有 ≠ 不存在，先 loading / 失败重试，同步结束再判断 */
    if (syncStatus !== 'ready') {
      return (
        <PageTransition>
          <SyncFallback />
        </PageTransition>
      )
    }
    return (
      <PageTransition>
        <EmptyState
          icon={<ImagesSquare size={30} weight="thin" />}
          title={t('detail.notFoundTitle')}
          desc={t('detail.notFoundDesc')}
          action={
            <Link className="btn btn-ghost" to="/albums">
              <ArrowLeft size={16} />
              {t('detail.backToAlbums')}
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
          {t('detail.back')}
        </Link>

        <div className="detail-head">
          <div className="detail-title-wrap">
            <h1 className="detail-title">{album.name}</h1>
            {album.password && (
              <span className="chip chip-lock">
                <Lock size={12} weight="fill" />
                {t('detail.locked')}
              </span>
            )}
          </div>
          {album.description && <p className="detail-desc">{album.description}</p>}
          <p className="hero-meta">
            {t('detail.meta', { n: list.length, t: relativeTime(album.updatedAt) })}
          </p>

          {!selectMode && (
            <div className="detail-actions">
              <button className="btn btn-primary" onClick={() => upload(album.id)}>
                <Plus size={16} weight="bold" />
                {t('detail.add')}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => requireLogin(() => setShareOpen(true))}
              >
                <ShareFat size={16} weight="fill" />
                {t('detail.share')}
              </button>
              {list.length > 0 && (
                <button
                  className="btn btn-ghost"
                  onClick={() => requireLogin(() => setSelectMode(true))}
                >
                  <Checks size={16} weight="bold" />
                  {t('home.select')}
                </button>
              )}
              {isWall && list.length > 0 && (
                <>
                  <button
                    className="btn btn-ghost"
                    disabled={exporting}
                    onClick={() => void doExportWall()}
                  >
                    <DownloadSimple size={16} weight="bold" />
                    {exporting ? t('wall.exporting') : t('wall.export')}
                  </button>
                  {user && (
                    <button className="btn btn-ghost" onClick={() => setWallEdit((v) => !v)}>
                      <PushPin size={16} weight={wallEdit ? 'fill' : 'regular'} />
                      {wallEdit ? t('wall.editDone') : t('wall.edit')}
                    </button>
                  )}
                </>
              )}
              <button
                className="btn-icon"
                onClick={() => requireLogin(() => setEditOpen(true))}
                aria-label={t('detail.edit')}
              >
                <PencilSimple size={17} />
              </button>
              <button
                className="btn-icon danger"
                onClick={() => requireLogin(() => setDeleteOpen(true))}
                aria-label={t('detail.delete')}
              >
                <TrashSimple size={17} />
              </button>
            </div>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <EmptyState
          icon={<ImagesSquare size={30} weight="thin" />}
          title={t('detail.emptyTitle')}
          desc={t('detail.emptyDesc')}
          action={
            <button className="btn btn-primary" onClick={() => upload(album.id)}>
              <Plus size={16} weight="bold" />
              {t('detail.add')}
            </button>
          }
        />
      ) : isWall && !selectMode ? (
        /* 照片墙相册：自由摆放视图（多选批量删除时仍走瀑布流勾选） */
        <PhotoWall
          wall={album.wall}
          photos={list}
          editable={!!user}
          editing={wallEdit}
          onEditingChange={setWallEdit}
          onWallChange={handleWallChange}
          onOpenPhoto={setLbIndex}
        />
      ) : (
        <MasonryGrid
          photos={list}
          onOpen={selectMode ? (i) => toggleSelect(list[i].id) : setLbIndex}
          selectMode={selectMode}
          selectedIds={selected}
          showStar={!!user}
        />
      )}

      <AnimatePresence>
        {lbIndex !== null && (
          <Lightbox
            photos={list}
            index={lbIndex}
            owner={!!user}
            onClose={() => setLbIndex(null)}
            onNavigate={setLbIndex}
            onRemove={user ? () => setConfirmPhoto(true) : undefined}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {selectMode && (
          <motion.div
            className="select-bar glass"
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 26 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          >
            <button
              className="select-bar-text"
              onClick={() => setSelected(allSelected ? new Set() : new Set(list.map((p) => p.id)))}
            >
              {allSelected ? t('home.deselectAll') : t('home.selectAll')}
            </button>
            <span className="select-bar-count">{t('home.selected', { n: selected.size })}</span>
            <button className="select-bar-text" onClick={exitSelect}>
              {t('form.cancel')}
            </button>
            <button
              className="btn btn-ghost select-bar-move"
              disabled={selected.size === 0}
              onClick={() => setMoveOpen(true)}
            >
              <FolderSimple size={15} weight="bold" />
              {t('home.moveSelected')}
            </button>
            <button
              className="btn btn-danger"
              disabled={selected.size === 0 || deleting}
              onClick={() => setConfirmBatch(true)}
            >
              <TrashSimple size={15} weight="bold" />
              {t('home.deleteSelected')}
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <MoveModal
        open={moveOpen}
        onClose={() => setMoveOpen(false)}
        photos={selectedPhotos}
        onMoved={exitSelect}
      />

      <AlbumFormModal open={editOpen} onClose={() => setEditOpen(false)} album={album} />
      <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} album={album} />
      <ConfirmModal
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => {
          deleteAlbum(album.id)
          navigate('/albums')
        }}
        title={t('detail.confirmTitle')}
        desc={t('detail.confirmDesc')}
      />
      <ConfirmModal
        open={confirmPhoto}
        onClose={() => setConfirmPhoto(false)}
        onConfirm={() => {
          const photo = lbIndex !== null ? list[lbIndex] : undefined
          return photo ? performDelete([photo]) : undefined
        }}
        busyText={t('confirm.deleting')}
        title={t('photo.confirmOneTitle')}
        desc={t('photo.confirmDesc')}
      />
      <ConfirmModal
        open={confirmBatch}
        onClose={() => setConfirmBatch(false)}
        onConfirm={() => performDelete(selectedPhotos)}
        busyText={t('confirm.deleting')}
        title={t('photo.confirmBatchTitle', { n: selectedPhotos.length })}
        desc={t('photo.confirmDesc')}
      />
    </PageTransition>
  )
}
