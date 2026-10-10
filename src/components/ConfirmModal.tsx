import { useEffect, useRef, useState } from 'react'
import { SpinnerGap, WarningCircle } from '@phosphor-icons/react'
import { Modal } from './Modal'
import { useT } from '../lib/i18n'

interface Props {
  open: boolean
  onClose: () => void
  /**
   * 同步返回 void：确认后立即关闭（原行为）。
   * 返回 Promise：按钮进入 loading，期间禁止关闭，成功（不返回 false）才自动关闭；
   * resolve false 表示操作失败，弹窗保留供用户重试。
   */
  onConfirm: () => void | Promise<unknown>
  title: string
  desc: string
  confirmText?: string
  /** loading 中的按钮文案（不传沿用 confirmText） */
  busyText?: string
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  desc,
  confirmText,
  busyText,
}: Props) {
  const { t } = useT()
  const [busy, setBusy] = useState(false)
  /** 同步守卫：状态渲染前连点确认不会重复触发 onConfirm */
  const busyRef = useRef(false)

  /* 关闭后复位，避免下次打开残留上一次的 loading 态 */
  useEffect(() => {
    if (!open) {
      busyRef.current = false
      setBusy(false)
    }
  }, [open])

  const handleConfirm = async () => {
    if (busyRef.current) return
    const ret = onConfirm()
    if (!(ret instanceof Promise)) {
      onClose()
      return
    }
    busyRef.current = true
    setBusy(true)
    let ok = true
    try {
      ok = (await ret) !== false
    } catch {
      ok = false
    } finally {
      busyRef.current = false
      setBusy(false)
    }
    if (ok) onClose()
  }

  /* 进行中禁走取消按钮 / 右上角 X / 遮罩 / Esc 关闭，避免误触后看似无事发生 */
  const requestClose = () => {
    if (!busy) onClose()
  }

  return (
    <Modal open={open} onClose={requestClose} title={title} width={400}>
      <div className="confirm-body">
        <span className="confirm-icon">
          <WarningCircle size={24} weight="fill" />
        </span>
        <p>{desc}</p>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={requestClose} disabled={busy}>
          {t('form.cancel')}
        </button>
        <button
          className="btn btn-danger"
          onClick={() => void handleConfirm()}
          disabled={busy}
          aria-busy={busy}
        >
          {busy && <SpinnerGap size={15} className="spin" />}
          {busy ? (busyText ?? confirmText ?? t('confirm.delete')) : (confirmText ?? t('confirm.delete'))}
        </button>
      </div>
    </Modal>
  )
}
