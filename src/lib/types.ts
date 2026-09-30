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
}

export interface PhotoInput {
  url: string
  width: number
  height: number
  title: string
}

export type ToastType = 'success' | 'error' | 'info'
