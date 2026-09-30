import { WarningCircle } from '@phosphor-icons/react'
import { Modal } from './Modal'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  desc: string
  confirmText?: string
}

export function ConfirmModal({ open, onClose, onConfirm, title, desc, confirmText = '删除' }: Props) {
  return (
    <Modal open={open} onClose={onClose} title={title} width={400}>
      <div className="confirm-body">
        <span className="confirm-icon">
          <WarningCircle size={24} weight="fill" />
        </span>
        <p>{desc}</p>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onClose}>
          取消
        </button>
        <button
          className="btn btn-danger"
          onClick={() => {
            onConfirm()
            onClose()
          }}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  )
}
