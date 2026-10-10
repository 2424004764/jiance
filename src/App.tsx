import { useEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { UploadSimple } from '@phosphor-icons/react'
import { Nav } from './components/Nav'
import { ToastHost } from './components/Toast'
import { UploadModal } from './components/UploadModal'
import { HomePage } from './pages/HomePage'
import { AlbumsPage } from './pages/AlbumsPage'
import { AlbumDetailPage } from './pages/AlbumDetailPage'
import { SharedAlbumPage } from './pages/SharedAlbumPage'
import { AuthCallbackPage } from './pages/AuthCallbackPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { useAuth } from './lib/auth'
import { setGalleryUser, useUploadModal } from './lib/store'
import { imagesFromClipboard, isEditableTarget, setPendingPasteFiles, textFollowsImage } from './lib/clipboard'
import { isUploadableMedia } from './lib/upload'
import { pullGallery } from './lib/gallerySync'
import { useLangInit, useT } from './lib/i18n'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

/** 登录态变化 → 切换画廊数据源（本地缓存先上屏，再拉服务端清单合并同步） */
function GallerySync() {
  const uid = useAuth((s) => s.user?.sub ?? null)
  useEffect(() => {
    setGalleryUser(uid)
    if (uid) void pullGallery()
  }, [uid])
  return null
}

export default function App() {
  useLangInit()
  const uid = useAuth((s) => s.user?.sub ?? null)
  const uploadOpen = useUploadModal((s) => s.open)
  const openUpload = useUploadModal((s) => s.openUpload)
  const { t } = useT()
  const { pathname } = useLocation()

  // 全局粘贴图片：未开上传弹窗时 Ctrl+V 直接弹出上传并带入图片；
  // 相册详情页粘贴进当前相册，其他页面进首页时间流。弹窗打开时由 UploadModal 自己接管。
  const routeAlbumId = pathname.match(/^\/album\/([^/]+)/)?.[1] ?? null
  const pasteReady = !!uid && !uploadOpen && !pathname.startsWith('/s/') && !pathname.startsWith('/auth/')
  useEffect(() => {
    if (!pasteReady) return
    const onPaste = (e: ClipboardEvent) => {
      const images = imagesFromClipboard(e.clipboardData)
      if (images.length === 0) return
      const text = e.clipboardData?.getData('text/plain') ?? ''
      if (isEditableTarget(e.target) && text && !textFollowsImage(text)) return
      e.preventDefault()
      setPendingPasteFiles(images)
      openUpload(routeAlbumId)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [pasteReady, openUpload, routeAlbumId])

  // 全局拖拽文件进窗口：显示覆盖层，松手唤起上传（图片与 MP4）。
  // 弹窗已打开时文件经由 pending 交接区 + 自定义事件转交 UploadModal。
  const [dragOver, setDragOver] = useState(false)
  const dragDepth = useRef(0)
  /** 站内发起的拖拽（拖动页面里的图片 / 链接 / 选区）：Chromium 给图片拖拽也标
      Files 类型（为支持拖出到桌面存为文件），按类型判断会误触发上传遮罩，
      因此 dragstart 时记录来源，该拖拽结束前一律不当作外部文件 */
  const internalDrag = useRef(false)
  const dropReady = !!uid && !pathname.startsWith('/s/') && !pathname.startsWith('/auth/')
  useEffect(() => {
    if (!dropReady) return
    const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const onDragStart = () => {
      internalDrag.current = true
    }
    const onDragEnd = () => {
      internalDrag.current = false
    }
    const onDragEnter = (e: DragEvent) => {
      if (internalDrag.current || !hasFiles(e)) return
      e.preventDefault()
      dragDepth.current++
      setDragOver(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (internalDrag.current || !hasFiles(e)) return
      e.preventDefault() // 允许 drop
    }
    const onDragLeave = (e: DragEvent) => {
      if (internalDrag.current || !hasFiles(e)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragOver(false)
    }
    const onDrop = (e: DragEvent) => {
      if (internalDrag.current) {
        /* 站内拖拽落到页面上：只挡住默认行为（如导航到图片地址），不进上传流程 */
        e.preventDefault()
        return
      }
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragOver(false)
      const files = Array.from(e.dataTransfer?.files ?? []).filter(isUploadableMedia)
      if (files.length === 0) return
      setPendingPasteFiles(files)
      if (useUploadModal.getState().open) {
        window.dispatchEvent(new CustomEvent('jiance-drop-files'))
      } else {
        openUpload(routeAlbumId)
      }
    }
    window.addEventListener('dragstart', onDragStart)
    window.addEventListener('dragend', onDragEnd)
    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragstart', onDragStart)
      window.removeEventListener('dragend', onDragEnd)
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [dropReady, openUpload, routeAlbumId])

  return (
    <div className="app-shell">
      <div className="aurora" aria-hidden="true" />
      <ScrollToTop />
      <GallerySync />
      <Nav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/albums" element={<AlbumsPage />} />
          <Route path="/album/:id" element={<AlbumDetailPage />} />
          <Route path="/s/:shareId" element={<SharedAlbumPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <UploadModal />
      {dragOver && (
        <div className="drop-overlay" aria-hidden="true">
          <div className="drop-card">
            <UploadSimple size={32} weight="bold" />
            <strong>{t('drop.title')}</strong>
            <span>{t('drop.sub')}</span>
          </div>
        </div>
      )}
      <ToastHost />
    </div>
  )
}
