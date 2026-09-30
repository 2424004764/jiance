import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Aperture, House, Images, Plus, UploadSimple, Camera, FolderPlus, X } from '@phosphor-icons/react'
import { useUpload } from '../lib/useUpload'

export function Nav() {
  const upload = useUpload()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)

  const createAlbum = () => {
    setSheetOpen(false)
    navigate('/albums?new=1')
  }

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand" aria-label="拾光集 首页">
            <span className="brand-mark">
              <Aperture size={21} weight="bold" />
            </span>
            <span className="brand-name">拾光集</span>
          </Link>

          <nav className="topbar-nav" aria-label="主导航">
            <NavLink to="/" end className="topbar-link">
              首页
            </NavLink>
            <NavLink to="/albums" className="topbar-link">
              相册
            </NavLink>
          </nav>

          <div className="topbar-actions">
            <button className="btn btn-ghost btn-desktop" onClick={() => upload(null)}>
              <UploadSimple size={17} weight="bold" />
              上传照片
            </button>
            <button className="btn btn-primary btn-desktop" onClick={createAlbum}>
              <Plus size={16} weight="bold" />
              新建相册
            </button>
          </div>
        </div>
      </header>

      <nav className="bottombar" aria-label="底部导航">
        <div className="bottombar-inner">
          <NavLink to="/" end className="bottom-link">
            {({ isActive }) => (
              <>
                <House size={22} weight={isActive ? 'fill' : 'regular'} />
                <span>首页</span>
              </>
            )}
          </NavLink>
          <button className="fab" onClick={() => setSheetOpen(true)} aria-label="上传或新建">
            <Plus size={24} weight="bold" />
          </button>
          <NavLink to="/albums" className="bottom-link right">
            {({ isActive }) => (
              <>
                <Images size={22} weight={isActive ? 'fill' : 'regular'} />
                <span>相册</span>
              </>
            )}
          </NavLink>
        </div>
      </nav>

      <AnimatePresence>
        {sheetOpen && (
          <motion.div
            className="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSheetOpen(false)}
          >
            <motion.div
              className="sheet-panel glass"
              role="dialog"
              aria-label="快捷操作"
              initial={{ y: 120, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 120, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 360, damping: 32 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sheet-head">
                <span>快捷操作</span>
                <button className="btn-icon" onClick={() => setSheetOpen(false)} aria-label="关闭">
                  <X size={17} />
                </button>
              </div>
              <button
                className="sheet-action"
                onClick={() => {
                  setSheetOpen(false)
                  upload(null)
                }}
              >
                <span className="sheet-action-icon">
                  <Camera size={20} weight="bold" />
                </span>
                <span className="sheet-action-text">
                  <strong>上传照片</strong>
                  <small>新增照片进入首页时间流</small>
                </span>
              </button>
              <button className="sheet-action" onClick={createAlbum}>
                <span className="sheet-action-icon alt">
                  <FolderPlus size={20} weight="bold" />
                </span>
                <span className="sheet-action-text">
                  <strong>新建相册</strong>
                  <small>整理照片并生成分享链接</small>
                </span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
