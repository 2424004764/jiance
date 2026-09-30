import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Compass } from '@phosphor-icons/react'
import { PageTransition } from '../components/PageTransition'
import { EmptyState } from '../components/EmptyState'

export function NotFoundPage() {
  useEffect(() => {
    document.title = '页面不存在 · 拾光集'
  }, [])

  return (
    <PageTransition>
      <EmptyState
        icon={<Compass size={30} weight="thin" />}
        title="走丢了"
        desc="这个页面不存在，回到首页继续浏览"
        action={
          <Link className="btn btn-primary" to="/">
            回到首页
          </Link>
        }
      />
    </PageTransition>
  )
}
