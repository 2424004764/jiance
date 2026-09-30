import { useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { Nav } from './components/Nav'
import { ToastHost } from './components/Toast'
import { HomePage } from './pages/HomePage'
import { AlbumsPage } from './pages/AlbumsPage'
import { AlbumDetailPage } from './pages/AlbumDetailPage'
import { SharedAlbumPage } from './pages/SharedAlbumPage'
import { NotFoundPage } from './pages/NotFoundPage'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <div className="app-shell">
      <div className="aurora" aria-hidden="true" />
      <ScrollToTop />
      <Nav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/albums" element={<AlbumsPage />} />
          <Route path="/album/:id" element={<AlbumDetailPage />} />
          <Route path="/s/:shareId" element={<SharedAlbumPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </main>
      <ToastHost />
    </div>
  )
}
