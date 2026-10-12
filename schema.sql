-- ============================================================
-- 简册画廊元数据（D1 唯一事实源）
-- 一切以服务端为准：客户端不再持有本地清单，也不再整份推送；
-- 所有写操作按记录落库，删除在服务端同时清 D1 记录与 R2 对象。
-- 时间戳一律毫秒（与前端既有约定一致）。
-- ============================================================

CREATE TABLE IF NOT EXISTS albums (
  uid         TEXT NOT NULL,            -- 属主（工具站 userinfo.sub）
  id          TEXT NOT NULL,            -- 相册 id（服务端随机生成）
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  password    TEXT,                     -- NULL = 无访问密码
  share_id    TEXT NOT NULL,            -- 分享令牌，/s/:shareId 使用
  type        TEXT NOT NULL DEFAULT 'grid',  -- grid | wall
  wall_json   TEXT,                     -- type=wall 时的墙面配置 JSON
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (uid, id)
);

-- 分享定位（公开接口按 share_id 直查，取代旧 _shares R2 索引）
CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_share ON albums (share_id);

CREATE TABLE IF NOT EXISTS photos (
  uid        TEXT NOT NULL,             -- 属主（工具站 userinfo.sub）
  id         TEXT NOT NULL,             -- 照片 id（服务端随机生成）
  url        TEXT NOT NULL,             -- /f/{key}；早期 dataURL 直存照片原样保留
  width      INTEGER NOT NULL DEFAULT 0,
  height     INTEGER NOT NULL DEFAULT 0,
  title      TEXT NOT NULL DEFAULT '',
  album_id   TEXT,                      -- NULL = 在首页时间流
  kind       TEXT,                      -- NULL/'image' = 图片，'video' = 视频
  duration   REAL,                      -- 视频时长（秒）
  starred    INTEGER NOT NULL DEFAULT 0,
  likes      INTEGER NOT NULL DEFAULT 0,-- 属主侧基础计数；访客点赞仍存 R2 _likes
  liked      INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (uid, id)
);

CREATE INDEX IF NOT EXISTS idx_photos_album   ON photos (uid, album_id);
CREATE INDEX IF NOT EXISTS idx_photos_created ON photos (uid, created_at);

-- 每账号一次性状态（旧 R2 清单迁移标记）
CREATE TABLE IF NOT EXISTS sync_state (
  uid         TEXT PRIMARY KEY,
  migrated_at INTEGER                   -- 迁入 D1 完成时间；NULL 行存在表示已核查过无需迁移
);
