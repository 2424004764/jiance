/* ============================================================
   i18n · 中英双语
   - 默认语言按 IP 所在国家判断：中国 → 中文，其他 → 英文
     （通过同源 /api/country 读取 Cloudflare 的 CF-IPCountry）
   - 用户手动切换后写入 localStorage，之后不再自动判断
   ============================================================ */

import { useCallback, useEffect } from 'react'
import { create } from 'zustand'
import { safeLocalStorage } from './localStorage'

export type Lang = 'zh' | 'en'

/** 旧品牌名的语言偏好键，启动时一次性迁移 */
const LEGACY_LANG_KEY = 'shiguang-lang'
const LANG_KEY = 'jiance-lang'
if (!safeLocalStorage.getItem(LANG_KEY)) {
  const legacy = safeLocalStorage.getItem(LEGACY_LANG_KEY)
  if (legacy) safeLocalStorage.setItem(LANG_KEY, legacy)
}
safeLocalStorage.removeItem(LEGACY_LANG_KEY)
/** 仅在用户手动切换时写入；自动判断不落盘 */
let manualChoice = false

export const dict = {
  zh: {
    brand: '简册',
    'nav.home': '首页',
    'nav.albums': '相册',
    'nav.upload': '上传照片',
    'nav.newAlbum': '新建相册',
    'nav.login': '登录',
    'nav.logout': '退出登录',
    'nav.quickActions': '快捷操作',
    'nav.uploadAction': '上传照片',
    'nav.uploadActionDesc': '新增照片进入首页时间流',
    'nav.newAlbumAction': '新建相册',
    'nav.newAlbumActionDesc': '整理照片并生成分享链接',
    'nav.close': '关闭',
    'nav.storage': '存储额度',
    'nav.manage': '管理 / 充值',
    'nav.storageLoading': '查询中…',
    'nav.storageScope': '点此授权',
    'nav.storageError': '暂时无法获取',
    'nav.langSwitch': '切换语言',
    'toast.loggedOut': '已退出登录',
    'toast.needConfig': '主站登录尚未配置（缺少 VITE_OAUTH_CLIENT_ID）',
    'toast.loginToCreate': '登录后才能创建相册',
    'toast.loginToUpload': '登录后才能进行此操作',

    'landing.heroPre': '把日子里的',
    'landing.heroAccent': '光',
    'landing.heroPost': '，一张张收好',
    'landing.heroSub': '简册是你的私人照片空间。照片保存在云端，按主题整理成相册，想分享时，生成一条链接就够了。',
    'landing.cta': '使用一方工具箱账号登录',
    'landing.noSignup': '无需单独注册',
    'landing.featTitle': '为私人收藏而做',
    'landing.featSub': '照片是你自己的，空间也是。',
    'landing.featPrivateTitle': '账号私有',
    'landing.featPrivateDesc': '照片和相册只属于登录的账号。换浏览器、换设备，登录就能看到同一份收藏。',
    'landing.cloudTitle': '云端保存',
    'landing.cloudDesc': '上传的照片保存在云端对象存储，不占用手机空间；存储额度来自工具站账号，随时可扩容。',
    'landing.shareTitle': '相册与分享',
    'landing.shareDesc': '按主题整理成相册，可为相册设置访问密码，再生成一条分享链接发给想给的人。',
    'landing.featAltDesk': '书桌上的照片',
    'landing.featAltWall': '照片墙',
    'landing.featAltLake': '湖边风景照',
    'landing.stepsTitle': '用起来很简单',
    'landing.stepLogin': '登录',
    'landing.stepLoginDesc': '用一方工具箱账号一键登录，没有额外注册。',
    'landing.stepUpload': '上传',
    'landing.stepUploadDesc': '挑选照片，原图或压缩后存进云端。',
    'landing.stepOrganize': '整理',
    'landing.stepOrganizeDesc': '归入相册，加上标题，重要的上把锁。',
    'landing.stepShare': '分享',
    'landing.stepShareDesc': '一条链接，把整本相册送给对的人。',
    'landing.ctaTitle': '从今天的第一张照片开始',
    'landing.toolbox': '一方工具箱',

    'home.heroTail': '，把今天收进简册',
    'home.feedMeta': '{n} 张照片，按上传时间排序',
    'home.emptyTitle': '还没有未归类的照片',
    'home.emptyDesc': '上传的照片如果不加入相册，就会按时间排列在这里',
    'home.emptyCta': '上传第一张照片',
    'home.select': '选择',
    'home.selected': '已选 {n} 张',
    'home.selectAll': '全选',
    'home.deselectAll': '取消全选',
    'home.deleteSelected': '删除所选',
    'home.search': '搜索照片或相册…',
    'home.starredOnly': '只看收藏',
    'home.starredMeta': '{n} 张收藏照片',
    'home.searchResults': '找到 {n} 张照片',
    'home.searchEmpty': '没有匹配的照片',
    'home.searchEmptyDesc': '换个关键词试试，搜索范围是全部照片的标题与所属相册',
    'home.starredEmpty': '还没有收藏的照片',
    'home.starredEmptyDesc': '把常用的照片点亮星标，它们会集中在这里',
    'home.moveSelected': '移动到',
    'home.yearNav': '按年份跳转',

    'move.title': '移动 {n} 张照片',
    'move.toFeed': '首页时间流',
    'move.feedHint': '移出相册，回到时间流',
    'move.current': '当前所在',
    'move.done': '已移动 {n} 张照片',
    'move.albumMeta': '{n} 张照片',
    'move.noTarget': '还没有可去的相册，先新建一个吧',

    'albums.meta': '{n} 个相册，收录了 {m} 张照片',
    'albums.loginTitle': '登录后查看你的相册',
    'albums.loginDesc': '相册属于你的私人空间，登录后可以整理照片并生成分享链接',
    'albums.emptyTitle': '创建你的第一个相册',
    'albums.emptyDesc': '把照片整理成集，一键生成分享链接，还能加上密码',

    'detail.back': '相册集',
    'detail.locked': '已加密',
    'detail.meta': '{n} 张照片，{t}更新',
    'detail.add': '添加照片',
    'detail.share': '分享',
    'detail.edit': '编辑相册',
    'detail.delete': '删除相册',
    'detail.notFoundTitle': '相册不存在',
    'detail.notFoundDesc': '它可能已经被删除，链接可能输错了',
    'detail.backToAlbums': '返回相册集',
    'detail.loginTitle': '登录后查看',
    'detail.loginDesc': '相册属于登录用户的私人空间，请先登录再访问',
    'detail.emptyTitle': '相册里还没有照片',
    'detail.emptyDesc': '点上面的「添加照片」，把这一集填满',
    'detail.confirmTitle': '删除相册',
    'detail.confirmDesc': '相册内的照片不会消失，会回到首页时间流继续按时间排列。',
    'detail.notFoundDoc': '相册不存在 · 简册',

    'sync.loadingTitle': '正在同步云端数据…',
    'sync.loadingSub': '正在获取你的相册内容，请稍候',
    'sync.errorTitle': '云端数据加载失败',
    'sync.errorDesc': '网络似乎开小差了，请检查网络后重试',
    'sync.retry': '重新加载',

    'shared.badge': '分享相册',
    'shared.meta': '{n} 张照片，来自简册',
    'shared.footer': '由简册整理分享',
    'shared.likeFail': '点赞没有成功，请稍后重试',
    'shared.loadingTitle': '正在打开分享…',
    'shared.loadingSub': '正在获取相册内容，请稍候',
    'shared.errorTitle': '暂时打不开分享',
    'shared.errorDesc': '网络似乎开小差了，稍后再试试',
    'shared.retry': '重试',
    'shared.notFoundTitle': '分享不存在',
    'shared.notFoundDesc': '链接可能已失效，或相册被重新设置了分享',
    'shared.home': '回到简册',
    'shared.notFoundDoc': '分享不存在 · 简册',

    'gate.title': '这个相册已上锁',
    'gate.sub': '输入「{name}」的访问密码继续查看',
    'gate.placeholder': '访问密码',
    'gate.submit': '解锁相册',
    'gate.error': '密码不正确，请重试',

    'auth.loading': '正在完成登录…',
    'auth.loadingSub': '正在通过一方工具箱账号完成安全验证，请稍候',
    'auth.aria': '正在登录',
    'auth.fail': '登录失败',
    'auth.backHome': '返回首页',
    'auth.retry': '重新登录',
    'auth.welcome': '欢迎回来，{name}',

    'nf.docTitle': '页面不存在 · 简册',
    'nf.title': '走丢了',
    'nf.desc': '这个页面不存在，回到首页继续浏览',
    'nf.cta': '回到首页',

    'form.newTitle': '新建相册',
    'form.editTitle': '编辑相册',
    'form.name': '名称',
    'form.namePh': '给这组照片起个名字',
    'form.desc': '描述（可选）',
    'form.descPh': '一句话记录这组照片',
    'form.pwLock': '密码保护',
    'form.pwPh': '访问密码，至少 4 位',
    'form.pwHint': '开启后，通过分享链接访问需要先输入密码',
    'form.showPw': '显示密码',
    'form.hidePw': '隐藏密码',
    'form.togglePw': '切换密码保护',
    'form.cancel': '取消',
    'form.create': '创建相册',
    'form.save': '保存修改',
    'form.nameError': '请输入相册名称',
    'form.pwError': '密码至少需要 4 位',
    'form.type': '相册类型',
    'form.typeGrid': '平铺网格',
    'form.typeGridDesc': '按时间瀑布流排列',
    'form.typeWall': '照片墙',
    'form.typeWallDesc': '自由摆放照片，可导出大图',
    'form.wallBg': '墙面背景',

    'wall.edit': '编辑布局',
    'wall.editDone': '完成',
    'wall.export': '导出大图',
    'wall.exporting': '正在生成…',
    'wall.exported': '照片墙图片已开始下载',
    'wall.exportFail': '导出失败，请稍后重试',
    'wall.autoArrange': '自动排布',
    'wall.bgTitle': '墙面背景',
    'wall.rotateL': '向左旋转',
    'wall.rotateR': '向右旋转',
    'wall.smaller': '缩小',
    'wall.bigger': '放大',
    'wall.front': '移到最上层',
    'wall.scaleHandle': '拖动角点调整图片大小',
    'wall.rotateHandle': '拖动顶部控制点旋转图片',
    'wall.adjustTitle': '调整照片',
    'wall.size': '图片大小',
    'wall.sizeValue': '图片大小数值',
    'wall.rotation': '图片方向',
    'wall.rotationValue': '图片方向角度',
    'wall.resetTransform': '重置大小和方向',
    'wall.editHint': '拖动照片移动；选中后拖动四角调整大小，拖动顶部控制点旋转',
    'wall.editHintSelected': '拖动照片移动；拖动四角等比例缩放，拖动顶部控制点旋转',
    'form.created': '相册已创建',
    'form.updated': '相册已更新',

    'share.title': '分享相册',
    'share.linkLabel': '分享链接',
    'share.copy': '复制链接',
    'share.copied': '分享链接已复制',
    'share.hint': '任何拿到链接的人都可以访问这个页面',
    'share.reset': '重置链接',
    'share.resetDone': '已生成新链接，旧链接同时失效',
    'share.pwOn': '密码保护已开启',
    'share.pwOff': '密码保护已关闭',
    'share.currentPw': '当前密码：{pw}',
    'share.pwNotSet': '尚未保存',
    'share.pwHint': '未开启时，链接即钥匙；开启后访问者需输入密码',
    'share.pwShort': '密码至少需要 4 位',
    'share.savePw': '保存密码',
    'share.pwAuto': '已自动生成访问密码',
    'share.pwRegen': '重新生成密码',
    'share.pwDirty': '密码已修改，保存后生效',

    'confirm.delete': '删除',
    'confirm.deleting': '删除中…',

    'up.loginFirst': '上传照片需要先登录一方工具箱账号',
    'up.noImages': '未识别到可上传的文件',
  'up.skipLarge': '已跳过 {n} 张超过 20MB 的照片',
  'up.title': '上传照片',
  'up.add': '选择照片',
  'up.addMore': '继续添加',
  'up.emptyHint': '支持 jpg / png / webp / gif / mp4 短视频 · 可 Ctrl+V 粘贴、拖入窗口或一次多选',
  'up.compress': '压缩照片（最长边 1280px）',
  'up.compressHint': '压缩后体积更小，可显著节省存储空间；关闭则原图直传（视频不压缩）',
  'up.selected': '已选 {n} 张 · 约 {size}',
  'up.preparing': '准备中…',
  'up.overLimit': '超过 20MB',
  'up.overLimitVideo': '超过 100MB',
  'up.videoTooLong': '超过 {n} 秒',
  'up.unreadable': '无法读取',
  'up.remove': '移除',
  'up.quotaLine': '已用 {used} / 共 {total}',
  'up.quotaFree': '剩余 {free}',
  'up.overQuota': '超出剩余额度 {size}，可开启压缩或先充值',
  'up.start': '开始上传',
  'up.uploading': '上传中…',
  'up.overall': '总进度 {n}/{m} 张 · {p}%',
    'up.quotaShort': '存储额度不足：还需约 {size}，请到一方工具箱充值后重试（{site}）',
    'up.scopeMissing': '当前登录未授权存储空间，请退出登录后重新登录',
    'up.quotaFail': '存储额度查询失败，请稍后再试',
    'up.quotaDone': '存储额度已用完（剩余 {size}），已上传 {n} 张，请充值后继续',
    'up.partial': '已上传 {n} 张，{m} 张失败',
    'up.done': '已上传 {n} 张照片',
    'up.allFail': '上传失败，请稍后重试',

    'err.loginFirst': '请先登录',
    'err.sessionExpired': '登录已过期，请重新登录',
    'err.quota': '存储额度不足，请前往一方工具箱充值后重试',
    'err.requestFail': '请求失败（{code}）',
    'err.saveFail': '保存失败，请重试',
    'err.quotaData': '额度数据格式异常',
    'err.uploadData': '上传响应格式异常',

    'toast.deleted': '已删除 {n} 张照片',
    'toast.deleteFail': '删除失败，请稍后重试',

    'photo.selectAria': '选择照片 {title}',
    'photo.confirmOneTitle': '删除这张照片',
    'photo.confirmBatchTitle': '删除 {n} 张照片',
    'photo.confirmDesc': '照片将从本设备与云端一并删除，无法恢复。',
    'photo.untitled': '未命名',

    'lb.view': '查看照片 {title}',
    'lb.like': '点赞',
    'lb.unlike': '取消点赞',
    'lb.close': '关闭',
    'lb.prev': '上一张',
    'lb.next': '下一张',
    'lb.remove': '删除这张照片',
    'lb.editTitle': '编辑标题',
    'lb.star': '收藏',
    'lb.unstar': '取消收藏',
    'lb.starred': '已收藏',

    'drop.title': '松手即上传',
    'drop.sub': '支持图片与 MP4 短视频（≤30 秒）',

    'time.justNow': '刚刚',
    'time.minAgo': '{n} 分钟前',
    'time.hourAgo': '{n} 小时前',
    'time.dayAgo': '{n} 天前',
    'time.weekAgo': '{n} 周前',
    'time.monthAgo': '{n} 个月前',
    'time.yearAgo': '{n} 年前',
    'greet.night': '夜深了',
    'greet.morning': '早上好',
    'greet.forenoon': '上午好',
    'greet.noon': '中午好',
    'greet.afternoon': '下午好',
    'greet.evening': '晚上好',
  },
  en: {
    brand: 'Jiance',
    'nav.home': 'Home',
    'nav.albums': 'Albums',
    'nav.upload': 'Upload',
    'nav.newAlbum': 'New album',
    'nav.login': 'Sign in',
    'nav.logout': 'Sign out',
    'nav.quickActions': 'Quick actions',
    'nav.uploadAction': 'Upload photos',
    'nav.uploadActionDesc': 'Add photos to your timeline',
    'nav.newAlbumAction': 'Create album',
    'nav.newAlbumActionDesc': 'Organize photos and share them',
    'nav.close': 'Close',
    'nav.storage': 'Storage',
    'nav.manage': 'Manage / Top up',
    'nav.storageLoading': 'Loading…',
    'nav.storageScope': 'Authorize',
    'nav.storageError': 'Unavailable',
    'nav.langSwitch': 'Switch language',
    'toast.loggedOut': 'Signed out',
    'toast.needConfig': 'Sign-in is not configured (missing VITE_OAUTH_CLIENT_ID)',
    'toast.loginToCreate': 'Sign in to create albums',
    'toast.loginToUpload': 'Sign in first',

    'landing.heroPre': 'Keep the ',
    'landing.heroAccent': 'light',
    'landing.heroPost': ' of your days, one photo at a time',
    'landing.heroSub':
      'Jiance is your private photo space. Photos live in the cloud, organized into albums, and sharing is just one link.',
    'landing.cta': 'Sign in with Yifang Toolbox',
    'landing.noSignup': 'No separate sign-up needed',
    'landing.featTitle': 'Built for private collections',
    'landing.featSub': 'Your photos, your space.',
    'landing.featPrivateTitle': 'Private by default',
    'landing.featPrivateDesc':
      'Photos and albums belong to your account alone. Sign in from any browser or device and your collection is there.',
    'landing.cloudTitle': 'Saved in the cloud',
    'landing.cloudDesc':
      'Uploads are stored in cloud object storage, not on your phone. Storage quota comes with your Toolbox account and can be expanded anytime.',
    'landing.shareTitle': 'Albums and sharing',
    'landing.shareDesc':
      'Organize photos into albums, protect them with a password, and share with a single link.',
    'landing.featAltDesk': 'Photos on a desk',
    'landing.featAltWall': 'Photo wall',
    'landing.featAltLake': 'Lakeside view',
    'landing.stepsTitle': 'Simple to use',
    'landing.stepLogin': 'Sign in',
    'landing.stepLoginDesc': 'One tap with your Toolbox account. No extra sign-up.',
    'landing.stepUpload': 'Upload',
    'landing.stepUploadDesc': 'Pick photos; store originals or compressed copies.',
    'landing.stepOrganize': 'Organize',
    'landing.stepOrganizeDesc': 'Sort into albums, add titles, lock the important ones.',
    'landing.stepShare': 'Share',
    'landing.stepShareDesc': 'One link sends the whole album to the right person.',
    'landing.ctaTitle': "Start with today's first photo",
    'landing.toolbox': 'Yifang Toolbox',

    'home.heroTail': ', tuck today into Jiance',
    'home.feedMeta': '{n} photos, newest first',
    'home.emptyTitle': 'No photos yet',
    'home.emptyDesc': 'Photos that are not in an album will appear here, ordered by time',
    'home.emptyCta': 'Upload your first photo',
    'home.select': 'Select',
    'home.selected': '{n} selected',
    'home.selectAll': 'Select all',
    'home.deselectAll': 'Deselect all',
    'home.deleteSelected': 'Delete selected',
    'home.search': 'Search photos or albums…',
    'home.starredOnly': 'Starred',
    'home.starredMeta': '{n} starred photos',
    'home.searchResults': '{n} photos found',
    'home.searchEmpty': 'No matching photos',
    'home.searchEmptyDesc': 'Try another keyword — search covers photo titles and album names',
    'home.starredEmpty': 'No starred photos yet',
    'home.starredEmptyDesc': 'Tap the star on a photo to keep favorites together here',
    'home.moveSelected': 'Move to',
    'home.yearNav': 'Jump to year',

    'move.title': 'Move {n} photos',
    'move.toFeed': 'Home timeline',
    'move.feedHint': 'Remove from album, back to the timeline',
    'move.current': 'Current',
    'move.done': 'Moved {n} photos',
    'move.albumMeta': '{n} photos',
    'move.noTarget': 'No albums yet — create one first',

    'albums.meta': '{n} albums with {m} photos',
    'albums.loginTitle': 'Sign in to see your albums',
    'albums.loginDesc': 'Albums live in your private space. Sign in to organize photos and create share links',
    'albums.emptyTitle': 'Create your first album',
    'albums.emptyDesc': 'Group photos into albums, share them with a link, and protect them with a password',

    'detail.back': 'Albums',
    'detail.locked': 'Locked',
    'detail.meta': '{n} photos · updated {t}',
    'detail.add': 'Add photos',
    'detail.share': 'Share',
    'detail.edit': 'Edit album',
    'detail.delete': 'Delete album',
    'detail.notFoundTitle': 'Album not found',
    'detail.notFoundDesc': 'It may have been deleted, or the link is wrong',
    'detail.backToAlbums': 'Back to albums',
    'detail.loginTitle': 'Sign in to view',
    'detail.loginDesc': 'Albums belong to signed-in users. Please sign in first',
    'detail.emptyTitle': 'This album is empty',
    'detail.emptyDesc': 'Use "Add photos" above to fill it up',
    'detail.confirmTitle': 'Delete album',
    'detail.confirmDesc':
      "Photos in this album won't be deleted; they'll return to your timeline.",
    'detail.notFoundDoc': 'Album not found · Jiance',

    'sync.loadingTitle': 'Syncing from the cloud…',
    'sync.loadingSub': 'Fetching your albums, one moment',
    'sync.errorTitle': 'Failed to load your library',
    'sync.errorDesc': 'The network seems flaky — check your connection and retry',
    'sync.retry': 'Retry',

    'shared.badge': 'Shared album',
    'shared.meta': '{n} photos · from Jiance',
    'shared.footer': 'Collected and shared with Jiance',
    'shared.likeFail': "Couldn't save your like, try again",
    'shared.loadingTitle': 'Opening the album…',
    'shared.loadingSub': 'Fetching the shared album, one moment',
    'shared.errorTitle': "Couldn't open the share",
    'shared.errorDesc': 'The network seems flaky — give it another try',
    'shared.retry': 'Retry',
    'shared.notFoundTitle': 'Share not found',
    'shared.notFoundDesc': 'The link may have expired, or sharing was reset',
    'shared.home': 'Back to Jiance',
    'shared.notFoundDoc': 'Share not found · Jiance',

    'gate.title': 'This album is locked',
    'gate.sub': 'Enter the password for "{name}" to continue',
    'gate.placeholder': 'Password',
    'gate.submit': 'Unlock album',
    'gate.error': 'Wrong password, try again',

    'auth.loading': 'Signing you in…',
    'auth.loadingSub': 'Verifying with your Yifang Toolbox account, one moment',
    'auth.aria': 'Signing in',
    'auth.fail': 'Sign-in failed',
    'auth.backHome': 'Back home',
    'auth.retry': 'Try again',
    'auth.welcome': 'Welcome back, {name}',

    'nf.docTitle': 'Page not found · Jiance',
    'nf.title': 'Lost your way',
    'nf.desc': "This page doesn't exist. Head back home to keep browsing",
    'nf.cta': 'Back home',

    'form.newTitle': 'New album',
    'form.editTitle': 'Edit album',
    'form.name': 'Name',
    'form.namePh': 'Name this set of photos',
    'form.desc': 'Description (optional)',
    'form.descPh': 'One line about these photos',
    'form.pwLock': 'Password protection',
    'form.pwPh': 'Password, at least 4 characters',
    'form.pwHint': 'When enabled, visitors need the password to open the share link',
    'form.showPw': 'Show password',
    'form.hidePw': 'Hide password',
    'form.togglePw': 'Toggle password protection',
    'form.cancel': 'Cancel',
    'form.create': 'Create album',
    'form.save': 'Save changes',
    'form.nameError': 'Please enter a name',
    'form.pwError': 'Password needs at least 4 characters',
    'form.type': 'Album type',
    'form.typeGrid': 'Grid',
    'form.typeGridDesc': 'Photos flow in a timeline',
    'form.typeWall': 'Photo wall',
    'form.typeWallDesc': 'Arrange freely, export as one image',
    'form.wallBg': 'Wall background',

    'wall.edit': 'Edit layout',
    'wall.editDone': 'Done',
    'wall.export': 'Export image',
    'wall.exporting': 'Rendering…',
    'wall.exported': 'Photo wall image downloaded',
    'wall.exportFail': "Couldn't export, try again later",
    'wall.autoArrange': 'Auto arrange',
    'wall.bgTitle': 'Wall background',
    'wall.rotateL': 'Rotate left',
    'wall.rotateR': 'Rotate right',
    'wall.smaller': 'Smaller',
    'wall.bigger': 'Bigger',
    'wall.front': 'Bring to front',
    'wall.scaleHandle': 'Drag corner to resize photo',
    'wall.rotateHandle': 'Drag top handle to rotate photo',
    'wall.adjustTitle': 'Adjust photo',
    'wall.size': 'Photo size',
    'wall.sizeValue': 'Photo size value',
    'wall.rotation': 'Photo direction',
    'wall.rotationValue': 'Photo direction angle',
    'wall.resetTransform': 'Reset size and direction',
    'wall.editHint': 'Drag photos to move; select one and drag a corner to resize or the top handle to rotate',
    'wall.editHintSelected': 'Drag to move; drag a corner to resize proportionally or the top handle to rotate',
    'form.created': 'Album created',
    'form.updated': 'Album updated',

    'share.title': 'Share album',
    'share.linkLabel': 'Share link',
    'share.copy': 'Copy link',
    'share.copied': 'Link copied',
    'share.hint': 'Anyone with this link can view this page',
    'share.reset': 'Reset link',
    'share.resetDone': 'New link generated; the old one no longer works',
    'share.pwOn': 'Password protection on',
    'share.pwOff': 'Password protection off',
    'share.currentPw': 'Current password: {pw}',
    'share.pwNotSet': 'Not saved yet',
    'share.pwHint': 'Without a password the link itself is the key; enable to require one',
    'share.pwShort': 'Password needs at least 4 characters',
    'share.savePw': 'Save password',
    'share.pwAuto': 'Access password generated automatically',
    'share.pwRegen': 'Regenerate password',
    'share.pwDirty': 'Changed — save to apply',

    'confirm.delete': 'Delete',
    'confirm.deleting': 'Deleting…',

    'up.loginFirst': 'Sign in with your Yifang Toolbox account to upload',
    'up.noImages': 'No uploadable files found',
    'up.skipLarge': 'Skipped {n} photos over 20MB',
    'up.title': 'Upload photos',
    'up.add': 'Choose photos',
    'up.addMore': 'Add more',
    'up.emptyHint': 'JPG / PNG / WebP / GIF / MP4 clips · paste (Ctrl+V), drag & drop, or pick multiple',
    'up.compress': 'Compress photos (max 1280px)',
    'up.compressHint': 'Smaller files save storage space; turn off to keep originals (videos are never compressed)',
    'up.selected': '{n} selected · about {size}',
    'up.preparing': 'Preparing…',
    'up.overLimit': 'Over 20MB',
    'up.overLimitVideo': 'Over 100MB',
    'up.videoTooLong': 'Over {n}s',
    'up.unreadable': "Can't read",
    'up.remove': 'Remove',
    'up.quotaLine': 'Used {used} of {total}',
    'up.quotaFree': '{free} free',
    'up.overQuota': 'Exceeds free space by {size}; compress or top up',
    'up.start': 'Upload',
    'up.uploading': 'Uploading…',
    'up.overall': '{n}/{m} · {p}%',
    'up.quotaShort':
      'Not enough storage: about {size} more needed. Top up at Yifang Toolbox ({site}) and try again',
    'up.scopeMissing': 'Your session lacks storage permission. Please sign in again',
    'up.quotaFail': "Couldn't check storage quota, please try later",
    'up.quotaDone': 'Storage full ({size} left), {n} uploaded. Top up to continue',
    'up.partial': '{n} uploaded, {m} failed',
    'up.done': '{n} photos uploaded',
    'up.allFail': 'Upload failed, please try again',

    'err.loginFirst': 'Please sign in first',
    'err.sessionExpired': 'Session expired, please sign in again',
    'err.quota': 'Not enough storage. Top up at Yifang Toolbox and try again',
    'err.requestFail': 'Request failed ({code})',
    'err.saveFail': 'Save failed, please try again',
    'err.quotaData': 'Unexpected quota data',
    'err.uploadData': 'Unexpected upload response',

    'toast.deleted': 'Deleted {n} photos',
    'toast.deleteFail': "Couldn't delete, try again later",

    'photo.selectAria': 'Select photo {title}',
    'photo.confirmOneTitle': 'Delete this photo',
    'photo.confirmBatchTitle': 'Delete {n} photos',
    'photo.confirmDesc':
      'The photo will be removed from this device and the cloud. This cannot be undone.',
    'photo.untitled': 'Untitled',

    'lb.view': 'View photo {title}',
    'lb.like': 'Like',
    'lb.unlike': 'Unlike',
    'lb.close': 'Close',
    'lb.prev': 'Previous',
    'lb.next': 'Next',
    'lb.remove': 'Delete this photo',
    'lb.editTitle': 'Edit title',
    'lb.star': 'Star',
    'lb.unstar': 'Unstar',
    'lb.starred': 'Starred',

    'drop.title': 'Drop to upload',
    'drop.sub': 'Photos and MP4 clips (up to 30s)',

    'time.justNow': 'just now',
    'time.minAgo': '{n} min ago',
    'time.hourAgo': '{n} hr ago',
    'time.dayAgo': '{n} days ago',
    'time.weekAgo': '{n} wk ago',
    'time.monthAgo': '{n} mo ago',
    'time.yearAgo': '{n} yr ago',
    'greet.night': 'Up late',
    'greet.morning': 'Good morning',
    'greet.forenoon': 'Good morning',
    'greet.noon': 'Good afternoon',
    'greet.afternoon': 'Good afternoon',
    'greet.evening': 'Good evening',
  },
} as const

export type DictKey = keyof typeof dict.zh

interface LangState {
  lang: Lang
  setLang: (lang: Lang) => void
}

export const useLang = create<LangState>()((set) => ({
  lang: 'zh',
  setLang: (lang) => set({ lang }),
}))

function applySideEffects(lang: Lang) {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en'
}

/** 非组件环境取词条（toast/错误信息等）；组件内请用 useT 以获得响应式更新 */
export function tr(key: DictKey, params?: Record<string, string | number>): string {
  const lang = useLang.getState().lang
  return interpolate(dict[lang][key] ?? dict.zh[key] ?? key, params)
}

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, k: string) =>
    params[k] !== undefined ? String(params[k]) : `{${k}}`,
  )
}

/** 组件内使用：const { t, lang } = useT()；语言切换时自动重渲染 */
export function useT() {
  const lang = useLang((s) => s.lang)
  const setLang = useLang((s) => s.setLang)
  const t = useCallback(
    (key: DictKey, params?: Record<string, string | number>) => interpolate(dict[lang][key] ?? key, params),
    [lang],
  )
  return { t, lang, setLang }
}

/** 语言初始化：读取手动选择 → 默认中文 → 异步按 IP 国家校正（仅一次） */
export function initLang(): void {
  const stored = safeLocalStorage.getItem(LANG_KEY)
  if (stored === 'zh' || stored === 'en') {
    manualChoice = true
    useLang.getState().setLang(stored as Lang)
    applySideEffects(stored as Lang)
    return
  }
  applySideEffects('zh')
  fetch('/api/country')
    .then((r) => r.json())
    .then((d: { country?: string }) => {
      const country = (d.country ?? '').toUpperCase()
      // 探测不到（本地开发等）保持中文；中国 → 中文，其他 → 英文
      if (!country || country === 'CN') return
      if (manualChoice || useLang.getState().lang !== 'zh') return
      useLang.getState().setLang('en')
      applySideEffects('en')
    })
    .catch(() => {})
}

/** 手动切换语言（记忆选择，覆盖 IP 判断） */
export function switchLang(lang: Lang): void {
  manualChoice = true
  safeLocalStorage.setItem(LANG_KEY, lang)
  useLang.getState().setLang(lang)
  applySideEffects(lang)
}

/** App 挂载时调用一次 */
export function useLangInit(): void {
  useEffect(() => {
    initLang()
  }, [])
}
