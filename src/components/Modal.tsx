import { useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { X } from '@phosphor-icons/react'
import type { ReactNode } from 'react'

interface Props {
  open: boolean
  onClose: () => void
  title: string
  width?: number
  children: ReactNode
}

export function Modal({ open, onClose, title, width = 480, children }: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="modal-panel glass"
            role="dialog"
            aria-modal="true"
            aria-label={title}
            style={{ maxWidth: width }}
            initial={{ opacity: 0, y: 26, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 340, damping: 30 }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-head">
              <h2>{title}</h2>
              <button className="btn-icon" onClick={onClose} aria-label="关闭弹窗">
                <X size={17} />
              </button>
            </header>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
