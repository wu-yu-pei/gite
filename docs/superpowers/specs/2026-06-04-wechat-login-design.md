# 微信小程序登录设计

## 概述

为 wei-gif-backend 添加微信小程序登录功能。小程序端通过 `wx.login` 获取 code，后端换取 openid/session_key，查找或创建用户，返回 JWT token。

## API 接口

### POST /api/auth/login

请求体：
```json
{
  "code": "wx_login_code",
  "nickName": "用户昵称（可选）",
  "avatarUrl": "https://...（可选）"
}
```

逻辑：
1. 用 code 调微信 code2Session 接口换取 openid + session_key
2. 根据 openid 查用户表，存在则更新（如传了昵称头像），不存在则创建
3. 生成 JWT token（payload: { userId, openid }），返回给客户端

响应：
```json
{
  "success": true,
  "data": {
    "token": "eyJhbG...",
    "user": { "id": 1, "nickName": "...", "avatarUrl": "..." }
  }
}
```

### GET /api/auth/me

携带 JWT，返回当前用户信息。未认证返回 401。

### 认证中间件

解析 `Authorization: Bearer <token>` 头，校验 JWT，将 `req.user` 注入请求上下文。

## 数据库

### users 表

```sql
CREATE TABLE users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  openid VARCHAR(64) NOT NULL UNIQUE,
  session_key VARCHAR(128) NOT NULL,
  nick_name VARCHAR(64) DEFAULT '',
  avatar_url VARCHAR(512) DEFAULT '',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## 新增文件

- `src/middlewares/auth.js` — JWT 认证中间件
- `src/routes/auth.js` — 登录路由
- `src/services/wechat.js` — 微信 code2Session 调用
- `src/db/init.sql` — 建表 SQL

## 配置

新增环境变量：
- WX_APPID — 小程序 AppID
- WX_SECRET — 小程序 AppSecret
- JWT_SECRET — JWT 签名密钥
- JWT_EXPIRES_IN — Token 过期时间，默认 7d

## 依赖

- jsonwebtoken — JWT 签发和校验
- 微信接口用 Node 内置 fetch 调用
