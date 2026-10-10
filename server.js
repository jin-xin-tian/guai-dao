const express = require('express');
 const cors = require('cors');
 const Database = require('better-sqlite3');
 const path = require('path');
 const app = express();
 const db = new Database('./phantom.db');
 app.use(cors());
 app.use(express.json());
 app.use(express.static(path.join(__dirname, 'public')));
 // ========== 数据库初始化 ==========
 db.exec(`
   CREATE TABLE IF NOT EXISTS users (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     username TEXT UNIQUE NOT NULL,
     password TEXT NOT NULL,
     role TEXT DEFAULT 'user'
   );
   CREATE TABLE IF NOT EXISTS targets (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     name TEXT NOT NULL,
     yes INTEGER DEFAULT 0,
     no INTEGER DEFAULT 0
   );
   CREATE TABLE IF NOT EXISTS messages (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user TEXT NOT NULL,
     content TEXT NOT NULL,
     time TEXT NOT NULL
   );
   CREATE TABLE IF NOT EXISTS requests (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     user TEXT NOT NULL,
     target TEXT NOT NULL,
     detail TEXT NOT NULL,
     wish TEXT NOT NULL,
     time TEXT NOT NULL,
     status TEXT DEFAULT '待处理'
   );
   CREATE TABLE IF NOT EXISTS votes (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     username TEXT NOT NULL,
     target_id INTEGER NOT NULL,
     type TEXT NOT NULL,
     UNIQUE(username, target_id)
   );
 `);
 // 插入默认管理员账号
 const adminExist = db.prepare('SELECT * FROM users WHERE username = ?').get('admin');
 if (!adminExist) {
   db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)').run('admin', '123456', 'admin');
 }
 // 插入默认目标
 const targetCount = db.prepare('SELECT COUNT(*) as num FROM targets').get().num;
 if (targetCount === 0) {
   const defaultTargets = [
     ['黑心企业经营者', 248, 16],
     ['校园权势霸凌者', 196, 29],
     ['欺诈敛财者', 158, 50],
     ['无良职场上司', 142, 58],
     ['学术造假者', 121, 32],
     ['网络暴力者', 98, 41]
   ];
   const stmt = db.prepare('INSERT INTO targets (name, yes, no) VALUES (?, ?, ?)');
   defaultTargets.forEach(t => stmt.run(...t));
 }
 // ========== 用户接口 ==========
 // 注册
 app.post('/api/register', (req, res) => {
   const { username, password } = req.body;
   if (!username || !password || password.length < 4) {
     return res.json({ success: false, msg: '参数不合法' });
   }
   try {
     db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(username, password);
     res.json({ success: true, msg: '注册成功' });
   } catch (e) {
     res.json({ success: false, msg: '用户名已存在' });
   }
 });
 // 登录
 app.post('/api/login', (req, res) => {
   const { username, password } = req.body;
   const user = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?').get(username, password);
   if (user) {
     res.json({ success: true, user: { username: user.username, role: user.role } });
   } else {
     res.json({ success: false, msg: '用户名或密码错误' });
   }
 });
 // ========== 排行榜接口 ==========
 // 获取排行榜
 app.get('/api/rank', (req, res) => {
   const list = db.prepare('SELECT * FROM targets ORDER BY yes * 1.0 / (yes + no) DESC').all();
   res.json({ success: true, list });
 });
 // 投票
 app.post('/api/vote', (req, res) => {
   const { username, targetId, type } = req.body;
   // 检查是否投过票
   const voted = db.prepare('SELECT * FROM votes WHERE username = ? AND target_id = ?').get(username, targetId);
   if (voted) return res.json({ success: false, msg: '已投过票' });
   const col = type === 'yes' ? 'yes' : 'no';
   db.prepare(`UPDATE targets SET ${col} = ${col} + 1 WHERE id = ?`).run(targetId);
   db.prepare('INSERT INTO votes (username, target_id, type) VALUES (?, ?, ?)').run(username, targetId, type);
   res.json({ success: true });
 });
 // ========== 留言接口 ==========
 app.get('/api/messages', (req, res) => {
   const list = db.prepare('SELECT * FROM messages ORDER BY id DESC').all();
   res.json({ success: true, list });
 });
 app.post('/api/messages', (req, res) => {
   const { user, content, time } = req.body;
   db.prepare('INSERT INTO messages (user, content, time) VALUES (?, ?, ?)').run(user, content, time);
   res.json({ success: true });
 });
 // ========== 请求接口 ==========
 app.post('/api/requests', (req, res) => {
   const { user, target, detail, wish, time } = req.body;
   db.prepare('INSERT INTO requests (user, target, detail, wish, time) VALUES (?, ?, ?, ?, ?)')
     .run(user, target, detail, wish, time);
   res.json({ success: true });
 });
 // ========== 管理员接口 ==========
 // 校验管理员中间件
function checkAdmin(req, res, next) {
   const { username } = req.body;
   const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
   if (user && user.role === 'admin') next();
   else res.json({ success: false, msg: '无权限' });
 }
 // 获取所有请求
 app.post('/api/admin/requests', checkAdmin, (req, res) => {
   const list = db.prepare('SELECT * FROM requests ORDER BY id DESC').all();
   res.json({ success: true, list });
 });
 // 添加目标
 app.post('/api/admin/addTarget', checkAdmin, (req, res) => {
   const { name, yes } = req.body;
   db.prepare('INSERT INTO targets (name, yes, no) VALUES (?, ?, 0)').run(name, yes || 0);
   res.json({ success: true });
 });
 // 删除目标
 app.post('/api/admin/delTarget', checkAdmin, (req, res) => {
   db.prepare('DELETE FROM targets WHERE id = ?').run(req.body.id);
   db.prepare('DELETE FROM votes WHERE target_id = ?').run(req.body.id);
   res.json({ success: true });
 });
 // 删除留言
 app.post('/api/admin/delMsg', checkAdmin, (req, res) => {
   db.prepare('DELETE FROM messages WHERE id = ?').run(req.body.id);
   res.json({ success: true });
 });
 // 删除请求
 app.post('/api/admin/delRequest', checkAdmin, (req, res) => {
   db.prepare('DELETE FROM requests WHERE id = ?').run(req.body.id);
   res.json({ success: true });
 });
 // 启动服务
 const PORT = 3000;
 app.listen(PORT, () => {
   console.log(`怪盗团网站已启动：http://localhost:${PORT}`);
 });