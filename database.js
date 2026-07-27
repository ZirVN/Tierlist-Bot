const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data.db');
const db = new sqlite3.Database(dbPath);

db.run(`
  CREATE TABLE IF NOT EXISTS verified_users (
    user_id TEXT PRIMARY KEY,
    game_name TEXT NOT NULL,
    is_premium INTEGER NOT NULL,
    region TEXT NOT NULL,
    verified_at INTEGER NOT NULL,
    current_tier TEXT DEFAULT NULL,
    last_tested_at INTEGER DEFAULT NULL
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS mode_tests (
    user_id TEXT NOT NULL,
    mode TEXT NOT NULL,
    tier TEXT DEFAULT NULL,
    last_tested_at INTEGER DEFAULT NULL,
    PRIMARY KEY (user_id, mode)
  )
`);

db.run(`ALTER TABLE verified_users ADD COLUMN current_tier TEXT DEFAULT NULL`, () => {});
db.run(`ALTER TABLE verified_users ADD COLUMN last_tested_at INTEGER DEFAULT NULL`, () => {});

/**
 * Thêm người dùng mới vào database đã xác thực
 * @param {string} userId ID của user trên Discord
 * @param {string} gameName Tên trong game Minecraft
 * @param {boolean} isPremium Là tài khoản Premium hay Crack
 * @param {string} region Khu vực của người chơi
 * @returns {Promise<void>}
 */
function addVerifiedUser(userId, gameName, isPremium, region) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare(
      `INSERT OR REPLACE INTO verified_users (user_id, game_name, is_premium, region, verified_at)
       VALUES (?, ?, ?, ?, ?)`
    );
    stmt.run(userId, gameName, isPremium ? 1 : 0, region, Date.now(), function(err) {
      if (err) reject(err);
      else resolve();
    });
    stmt.finalize();
  });
}

/**
 * Kiểm tra xem người dùng đã xác thực chưa
 * @param {string} userId 
 * @returns {Promise<boolean>}
 */
function isUserVerified(userId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT user_id FROM verified_users WHERE user_id = ?`, [userId], (err, row) => {
      if (err) reject(err);
      else resolve(!!row);
    });
  });
}

/**
 * Lấy thông tin xác thực của người dùng
 * @param {string} userId 
 * @returns {Promise<any>}
 */
function getVerifiedUser(userId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM verified_users WHERE user_id = ?`, [userId], (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

function updateUserTier(userId, newTier) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE verified_users SET current_tier = ?, last_tested_at = ? WHERE user_id = ?`,
      [newTier, Date.now(), userId],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

/**
 * Lấy tier + last_tested_at của 1 người CHO 1 MODE cụ thể
 * @param {string} userId 
 * @param {string} mode 
 * @returns {Promise<any>}
 */
function getModeTest(userId, mode) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM mode_tests WHERE user_id = ? AND mode = ?`,
      [userId, mode],
      (err, row) => {
        if (err) reject(err);
        else resolve(row);
      }
    );
  });
}

/**
 * Cập nhật tier + thời gian test CHO 1 MODE cụ thể (không ảnh hưởng các mode khác)
 * @param {string} userId 
 * @param {string} mode 
 * @param {string} newTier 
 * @returns {Promise<void>}
 */
function updateModeTier(userId, mode, newTier) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO mode_tests (user_id, mode, tier, last_tested_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, mode) DO UPDATE SET tier = excluded.tier, last_tested_at = excluded.last_tested_at`,
      [userId, mode, newTier, Date.now()],
      function (err) {
        if (err) reject(err);
        else resolve();
      }
    );
  });
}

module.exports = {
  db,
  addVerifiedUser,
  isUserVerified,
  getVerifiedUser,
  updateUserTier,
  getModeTest,
  updateModeTier,
};