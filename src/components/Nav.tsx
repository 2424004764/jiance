import { useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import {
  Aperture,
  CaretDown,
  House,
  Images,
  Plus,
  SignIn,
  SignOut,
  UploadSimple,
  Camera,
  FolderPlus,
  X,
} from '@phosphor-icons/react'
import { useUpload } from '../lib/useUpload'
import { beginLogin, oauthConfigured, type OAuthUser } from '../lib/oauth'
import { logout, useAuth } from '../lib/auth'
import { useToasts } from '../lib/store'

function UserAvatar({ user, size = 26 }: { user: OAuthUser; size?: number }) {
  const [broken, setBroken] = useState(false)
  if (user.avatar && !broken) {
    return (
      <img
        className="user-avatar"
        src={user.avatar}
        alt={user.username}
        width={size}
        height={size}
        onError={() => setBroken(true)}
      />
    )
  }
  return (
    <span
      className="user-avatar user-avatar-fallback"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      aria-hidden="true"
    >
      {(user.username || '?').trim().charAt(0).toUpperCase()}
    </span>
  )
}

export function Nav() {
  const upload = useUpload()
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)
  const user = useAuth((s) => s.user)
  const toast = useToasts((s) => s.toast)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const startLogin = () => {
    if (!oauthConfigured) {
      toast('主站登录尚未配置（缺少 VITE_OAUTH_CLIENT_ID）', 'error')
      return
    }
    void beginLogin()
  }

  const doLogout = () => {
    setMenuOpen(false)
    void logout()
    toast('已退出登录', 'info')
  }

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

            {user ? (
              <div className="user-zone">
                <button
                  className="user-chip"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                >
                  <UserAvatar user={user} />
                  <span className="user-chip-name">{user.username}</span>
                  <CaretDown size={12} className="user-caret" />
                </button>
                <AnimatePresence>
                  {menuOpen && (
                    <>
                      <div className="user-menu-mask" onClick={() => setMenuOpen(false)} />
                      <motion.div
                        className="user-menu glass"
                        role="menu"
                        initial={{ opacity: 0, y: -6, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.97 }}
                        transition={{ duration: 0.18 }}
                      >
                        <div className="user-menu-head">
                          <UserAvatar user={user} size={40} />
                          <div className="user-menu-info">
                            <strong>{user.username}</strong>
                            <span>{user.email || `ID ${user.sub}`}</span>
                          </div>
                        </div>
                        <button className="user-menu-logout" role="menuitem" onClick={doLogout}>
                          <SignOut size={16} weight="bold" />
                          退出登录
                        </button>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <button className="btn btn-ghost login-btn" onClick={startLogin}>
                <SignIn size={16} weight="bold" />
                登录
              </button>
            )}
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
