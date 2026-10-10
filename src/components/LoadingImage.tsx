import { useLayoutEffect, useRef, useState } from 'react'
import type { ImgHTMLAttributes } from 'react'
import { CircleNotch, ImageSquare } from '@phosphor-icons/react'

type State = 'loading' | 'ok' | 'error'

type Props = ImgHTMLAttributes<HTMLImageElement> & {
  /** 图片未加载时的宽高比占位（如 "4 / 3"），用于没有其他高度来源的场景 */
  ratio?: string
}

/**
 * 带加载态的图片：
 * - 外层 .ldimg 负责裁剪，加载中由 .ldimg-ph 显示扫光 + spinner 占位
 * - img 以 data-img-state 驱动淡入（淡入过渡写在各容器 img 规则的 transition 里）
 * - 加载失败显示失效图标占位
 */
export function LoadingImage({ ratio, ...imgProps }: Props) {
  const ref = useRef<HTMLImageElement>(null)
  const [state, setState] = useState<State>('loading')

  /* 缓存命中时 complete 已为 true 且 onLoad 不再触发，提交后同步一次状态 */
  useLayoutEffect(() => {
    const img = ref.current
    if (img?.complete) setState(img.naturalWidth > 0 ? 'ok' : 'error')
    else setState('loading')
  }, [imgProps.src])

  return (
    <span className="ldimg" style={ratio ? { aspectRatio: ratio } : undefined}>
      <img
        {...imgProps}
        ref={ref}
        data-img-state={state}
        onLoad={() => setState('ok')}
        onError={() => setState('error')}
      />
      {state !== 'ok' && (
        <span className={`ldimg-ph${state === 'error' ? ' is-error' : ''}`} aria-hidden="true">
          {state === 'error' ? (
            <ImageSquare size={22} weight="thin" />
          ) : (
            /* 居中 spinner：扫光带处在其周期边缘时仍能有稳定的加载指示 */
            <CircleNotch size={22} weight="bold" className="ldimg-spin" />
          )}
        </span>
      )}
    </span>
  )
}
