import type { Album, Photo } from './types'

const DAY = 86_400_000
const now = Date.now()
/** days 可为小数，hours 为额外偏移 */
const at = (days: number, hours = 0) => now - days * DAY - hours * 3_600_000

/** [seed, w, h, 标题, 上传于几天前, 点赞数] */
type Row = [string, number, number, string, number, number]

const feedRows: Row[] = [
  ['sg-dusk-01', 800, 1000, '巷口的黄昏', 0.2, 23],
  ['sg-rain-02', 800, 533, '雨天车窗', 0.5, 41],
  ['sg-desk-03', 800, 1000, '加班夜的桌面', 0.9, 12],
  ['sg-plant-04', 800, 800, '新叶子', 1.4, 8],
  ['sg-street-05', 800, 1200, '天桥夜风', 2.1, 35],
  ['sg-coffee-06', 800, 533, '早八冰美式', 2.6, 19],
  ['sg-sky-07', 800, 600, '积雨云', 3.3, 52],
  ['sg-cat-08', 800, 1000, '楼下的橘猫', 4.0, 67],
  ['sg-lake-09', 800, 1200, '湖面反光', 5.2, 15],
  ['sg-neon-10', 800, 600, '霓虹招牌', 6.1, 29],
  ['sg-mtn-11', 800, 1000, '远山黛色', 7.4, 44],
  ['sg-book-12', 800, 800, '旧书页', 8.2, 6],
  ['sg-train-13', 800, 533, '车窗即景', 9.5, 31],
  ['sg-moon-14', 800, 1000, '月亮很近', 11.8, 58],
  ['sg-park-15', 800, 600, '午后公园', 13.3, 17],
]

const chuanxiRows: Row[] = [
  ['sg-cx-01', 800, 533, '出发前的后备箱', 15.1, 62],
  ['sg-cx-02', 800, 1000, '云海第一眼', 15.6, 88],
  ['sg-cx-03', 800, 800, '垭口风大', 16.2, 45],
  ['sg-cx-04', 800, 1200, '日照金山', 16.5, 96],
  ['sg-cx-05', 800, 800, '星河是真的', 17.0, 73],
  ['sg-cx-06', 800, 533, '牦牛过马路', 17.4, 38],
  ['sg-cx-07', 800, 1000, '冷得清醒', 18.2, 21],
  ['sg-cx-08', 800, 800, '回程的隧道', 19.0, 17],
  ['sg-cx-09', 800, 533, '住在藏寨', 19.8, 33],
  ['sg-cx-10', 800, 1000, '最后一眼雪山', 20.5, 71],
]

const cityRows: Row[] = [
  ['sg-ny-01', 800, 1200, '蓝调时刻', 25.2, 57],
  ['sg-ny-02', 800, 800, '高架车流', 26.0, 64],
  ['sg-ny-03', 800, 1000, '便利店灯', 27.4, 29],
  ['sg-ny-04', 800, 533, '天台', 29.1, 42],
  ['sg-ny-05', 800, 800, '雨夜反射', 31.6, 36],
  ['sg-ny-06', 800, 1200, '末班车', 33.2, 51],
  ['sg-ny-07', 800, 600, '广告牌', 36.0, 18],
  ['sg-ny-08', 800, 1000, '桥洞光带', 38.5, 26],
]

const catsRows: Row[] = [
  ['sg-cat-1', 800, 800, '大橘为重', 30.2, 84],
  ['sg-cat-2', 800, 1000, '三花警惕', 32.5, 67],
  ['sg-cat-3', 800, 533, '卷耳小猫', 35.1, 49],
  ['sg-cat-4', 800, 800, '打哈欠', 38.7, 58],
  ['sg-cat-5', 800, 1000, '巡逻中', 42.3, 37],
  ['sg-cat-6', 800, 533, '晒太阳', 47.9, 62],
  ['sg-cat-7', 800, 800, '偷看你', 52.4, 71],
]

const seaRows: Row[] = [
  ['sg-sea-1', 800, 533, '退潮', 45.2, 43],
  ['sg-sea-2', 800, 1000, '防波堤', 46.8, 55],
  ['sg-sea-3', 800, 800, '海风咸', 48.5, 27],
  ['sg-sea-4', 800, 1200, '日落十分钟', 50.1, 79],
  ['sg-sea-5', 800, 533, '渔船回港', 53.6, 31],
  ['sg-sea-6', 800, 800, '夜潮', 56.2, 22],
]

function mk(rows: Row[], albumId: string | null, prefix: string): Photo[] {
  return rows.map((r, i) => ({
    id: `${prefix}-${String(i + 1).padStart(2, '0')}`,
    url: `https://picsum.photos/seed/${r[0]}/${r[1]}/${r[2]}`,
    width: r[1],
    height: r[2],
    title: r[3],
    createdAt: at(r[4], i),
    albumId,
    likes: r[5],
    liked: false,
  }))
}

const feedPhotos = mk(feedRows, null, 'feed')
const chuanxiPhotos = mk(chuanxiRows, 'a-chuanxi', 'cx')
const cityPhotos = mk(cityRows, 'a-city', 'ny')
const catsPhotos = mk(catsRows, 'a-cats', 'cat')
const seaPhotos = mk(seaRows, 'a-sea', 'sea')

const latest = (photos: Photo[]) => Math.max(...photos.map((p) => p.createdAt))

export const seedAlbums: Album[] = [
  {
    id: 'a-chuanxi',
    name: '川西之行',
    description: '十月，雪山、垭口与星河。',
    createdAt: at(22),
    updatedAt: latest(chuanxiPhotos),
    password: null,
    shareId: 'x7Kp2mAq',
    photoIds: chuanxiPhotos.map((p) => p.id),
  },
  {
    id: 'a-city',
    name: '城市夜色',
    description: '霓虹、车流与深夜的光。',
    createdAt: at(40),
    updatedAt: latest(cityPhotos),
    password: '2026',
    shareId: 'Qm9vT4eR',
    photoIds: cityPhotos.map((p) => p.id),
  },
  {
    id: 'a-cats',
    name: '街猫图鉴',
    description: '小区里的毛孩子们。',
    createdAt: at(56),
    updatedAt: latest(catsPhotos),
    password: null,
    shareId: 'cAt556Kw',
    photoIds: catsPhotos.map((p) => p.id),
  },
  {
    id: 'a-sea',
    name: '暮色与海',
    description: '夏天结束前的海岸线。',
    createdAt: at(60),
    updatedAt: latest(seaPhotos),
    password: null,
    shareId: 'sEa78xJp',
    photoIds: seaPhotos.map((p) => p.id),
  },
]

export const seedPhotos: Photo[] = [
  ...feedPhotos,
  ...chuanxiPhotos,
  ...cityPhotos,
  ...catsPhotos,
  ...seaPhotos,
]
