-- 冒烟：覆盖各接口用到的 SQL 形状（本地 D1）
INSERT OR IGNORE INTO sync_state (uid, migrated_at) VALUES ('u-test', NULL);
INSERT OR IGNORE INTO albums (uid, id, name, description, password, share_id, type, wall_json, created_at, updated_at)
  VALUES ('u-test', 'a-1', '测试相册', '', NULL, 'shareabcd123', 'grid', NULL, 100, 100);
INSERT OR IGNORE INTO photos (uid, id, url, width, height, title, album_id, kind, duration, starred, likes, liked, created_at, updated_at)
  VALUES ('u-test', 'p-1', '/f/subsite/u-test/20261012/abc.jpg', 100, 100, '照片', 'a-1', NULL, NULL, 0, 0, 0, 100, 100);
INSERT OR IGNORE INTO photos (uid, id, url, width, height, title, album_id, kind, duration, starred, likes, liked, created_at, updated_at)
  VALUES ('u-test', 'p-2', '/f/subsite/u-test/20261012/def.mp4', 1920, 1080, '视频', NULL, 'video', 12.5, 1, 3, 1, 101, 101);
SELECT 'album-by-share' AS step, uid, id FROM albums WHERE share_id = 'shareabcd123';
SELECT 'photos-of-album' AS step, id FROM photos WHERE uid = 'u-test' AND album_id = 'a-1' ORDER BY created_at DESC;
SELECT 'count' AS step, COUNT(*) AS n FROM photos WHERE uid = 'u-test';
UPDATE photos SET updated_at = 200, title = '改名' WHERE uid = 'u-test' AND id = 'p-1';
UPDATE photos SET album_id = 'a-1', updated_at = 200 WHERE uid = 'u-test' AND id IN ('p-2', 'p-missing');
UPDATE albums SET updated_at = 200, name = '改名相册', password = NULL WHERE uid = 'u-test' AND id = 'a-1';
SELECT 'after-update' AS step, id, title, album_id FROM photos WHERE uid = 'u-test' ORDER BY id;
DELETE FROM photos WHERE uid = 'u-test' AND id IN ('p-1');
DELETE FROM albums WHERE uid = 'u-test' AND id = 'a-1';
UPDATE photos SET album_id = NULL, updated_at = 300 WHERE uid = 'u-test' AND album_id = 'a-1';
SELECT 'after-delete' AS step, id, album_id FROM photos WHERE uid = 'u-test';
DELETE FROM photos WHERE uid = 'u-test';
DELETE FROM albums WHERE uid = 'u-test';
DELETE FROM sync_state WHERE uid = 'u-test';
