# Express + MySQL + Redis 项目设计

## 概述

纯后端 REST API 服务，JavaScript ES Module，Node 22，mysql2 原生驱动，ioredis。
开发和生产环境各使用独立的 docker-compose 文件。

## 项目结构

```
wei-gif-backend/
├── src/
│   ├── app.js                 # Express 应用配置
│   ├── server.js              # 入口文件
│   ├── config/
│   │   └── index.js           # 统一配置（环境变量）
│   ├── middlewares/
│   │   ├── errorHandler.js    # 统一错误处理
│   │   └── requestLogger.js   # 请求日志
│   ├── routes/
│   │   └── health.js          # 健康检查路由
│   ├── libs/
│   │   ├── db.js              # MySQL 连接池
│   │   └── redis.js           # Redis 客户端
│   └── utils/
│       └── logger.js          # 日志工具（pino）
├── docker-compose.dev.yml
├── docker-compose.prod.yml
├── Dockerfile
├── .dockerignore
├── .env.example
├── .gitignore
├── package.json
└── nodemon.json
```

## Docker 架构

### 开发环境 (`docker-compose.dev.yml`)

- app: `node:22-alpine` + 源码卷挂载 + nodemon 热重载
- mysql: `mysql:8.0`，暴露 3306，named volume 持久化
- redis: `redis:7-alpine`，暴露 6379
- 启动: `docker compose -f docker-compose.dev.yml up`

### 生产环境 (`docker-compose.prod.yml`)

- app: Dockerfile 构建镜像，`node src/server.js` 运行
- mysql: 不暴露端口到宿主机
- redis: 不暴露端口到宿主机
- 启动: `docker compose -f docker-compose.prod.yml up -d`

### Dockerfile

多阶段不需要，单阶段即可：node:22-alpine，npm ci --omit=dev，COPY src，USER node。

## 应用层设计

### 配置

从环境变量读取：PORT, MYSQL_HOST/PORT/USER/PASSWORD/DATABASE, REDIS_HOST/PORT, NODE_ENV。
启动时校验必要变量，缺失 fail fast。

### MySQL (`libs/db.js`)

mysql2/promise 连接池，封装 query() 方法，启动时测试连接。

### Redis (`libs/redis.js`)

ioredis 客户端，启动时测试连接。

### 健康检查 (`GET /health`)

返回 `{ status, mysql, redis, uptime }`，实际 ping MySQL 和 Redis，任一失败返回 503。

### 错误处理

- 未匹配路由 → 404
- 全局错误中间件 → `{ success: false, error: "message" }`
- 生产环境不暴露堆栈

### 日志

pino JSON 格式日志，请求日志中间件记录 method/url/status/耗时。

## 技术栈

- Node.js 22
- Express
- mysql2 (原生驱动)
- ioredis
- pino (日志)
- nodemon (开发热重载)
- Docker + Docker Compose
