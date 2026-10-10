export interface Photo {
  id: string
  url: string
  width: number
  height: number
  title: string
  createdAt: number
  /** null 表示未加入任何相册，出现在首页时间流 */
  albumId: string | null
  likes: number
  liked: boolean
  /** 记录最后修改时间（跨端合并的 last-write-wins 依据），旧数据可能缺失 */
  updatedAt?: number
  /** 属主的收藏标记（不参与访客点赞，随清单同步） */
  starred?: boolean
  /** 媒体类型；缺省按 image 处理（兼容旧数据） */
  kind?: 'image' | 'video'
  /** 视频时长（秒），仅 kind 为 video 时存在 */
  duration?: number
}

export type AlbumType = 'grid' | 'wall'

/** 照片墙里一张照片的摆放（x/y 为画板百分比，中心点定位；数组顺序即叠放层级） */
export interface WallItem {
  photoId: string
  x: number
  y: number
  /** 旋转角度（度） */
  rot: number
  /** 照片卡宽度，占画板宽度百分比（高度随照片比例自适应） */
  w: number
}

export interface WallConfig {
  /** 背景预设 id，见 lib/wallPresets.ts */
  background: string
  items: WallItem[]
}

export interface Album {
  id: string
  name: string
  description: string
  createdAt: number
  updatedAt: number
  /** 设置后，访问分享链接需要先通过密码验证 */
  password: string | null
  /** 分享令牌，出现在 /s/:shareId 链接里 */
  shareId: string
  photoIds: string[]
  /** 相册展示形态；缺省按 grid（平铺瀑布流）处理，兼容旧数据 */
  type?: AlbumType
  /** type 为 wall 时的墙面配置（背景 + 每张照片的摆放） */
  wall?: WallConfig
}

export interface PhotoInput {
  url: string
  width: number
  height: number
  title: string
  kind?: 'image' | 'video'
  /** 视频时长（秒） */
  duration?: number
}

export type ToastType = 'success' | 'error' | 'info'
