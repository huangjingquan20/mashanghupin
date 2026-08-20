# 拼团团

微信群拼团信息聚合小程序 —— 把朋友圈/群聊里的拼多多拼团链接统一收集、OCR 识别、分类展示，一键复制去参团。

基于 **微信原生框架 + 云开发** 构建，零服务器成本。

## 功能特性

- 📷 **图片识别**：上传拼团截图，自动 OCR 提取标题、价格、分类，识别二维码中的商品链接
- 🏷️ **分类浏览**：食品饮料 / 生鲜果蔬 / 家居日用 / 个护美妆 / 服饰鞋包 / 数码家电 / 宠物用品
- 🔍 **搜索与筛选**：关键词搜索 + 24 小时新鲜团过滤
- ⭐ **收藏夹**：收藏感兴趣的拼团，24 小时内有效提醒
- 📤 **分享直达**：分享卡片直达参团页（jump 页），点开即跳拼多多
- 🧹 **自动清理**：定时清理 20 天前的过期数据

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | 微信原生小程序（WXML + WXSS + JS） |
| 后端 | 微信云开发（云函数 + 云数据库 + 云存储） |
| OCR | 微信原生 OCR（cloud.openapi）→ 腾讯云 OCR（可选备用） |

## 目录结构

```
拼团团/
├── miniprogram/           # 小程序前端
│   ├── app.js/json/wxss   # 应用入口
│   ├── pages/             # 页面
│   │   ├── home/          # 首页（搜索 + 分类 + 拼团列表）
│   │   ├── publish/       # 发布（上传图片 → OCR → 发布）
│   │   ├── mine/          # 我的（收藏 / 我发布的 / 反馈）
│   │   ├── jump/          # 分享跳转页（直达参团）
│   │   └── feedback/      # 意见反馈
│   ├── components/group-card/  # 拼团卡片组件
│   └── utils/             # 工具函数
├── cloudfunctions/        # 云函数
│   ├── login/             # 登录
│   ├── getGroups/         # 获取拼团列表（搜索 + 分类 + 24h + 分页）
│   ├── createGroup/       # 创建拼团
│   ├── analyzeImage/      # OCR 识别图片 + 二维码提取
│   ├── getAuthUrl/        # 拼多多授权链接
│   ├── searchByTitle/     # 按标题搜拼多多商品
│   ├── toggleFavorite/    # 收藏 / 取消
│   ├── getMyFavorites/    # 我的收藏
│   ├── getMyGroups/       # 我发布的
│   ├── deleteGroup/       # 删除拼团
│   ├── getTempUrl/        # 云存储临时链接
│   ├── cleanExpired/      # 定时清理过期数据
│   └── ...                # 其余辅助云函数
└── project.config.json    # 项目配置（AppID / 云环境）
```

## 快速开始

### 1. 环境准备

- 微信开发者工具（稳定版即可）
- 一个已注册的微信小程序 AppID

### 2. 配置 AppID 与云环境

1. 用微信开发者工具打开本项目
2. 将 `project.config.json` 中的 `appid` 替换为你的小程序 AppID
3. 开通云开发，创建云环境，将环境 ID 填入：
   - `project.config.json` → `cloud.env`
   - `miniprogram/app.js` → `wx.cloud.init({ env: '你的环境ID' })`
   - `miniprogram/pages/publish/publish.js` → 教程图的 `fileID`（可选）

### 3. 创建数据库集合

| 集合 | 用途 |
|---|---|
| `users` | 用户（openid） |
| `groups` | 拼团记录 |
| `categories` | 预设分类 |
| `favorites` | 收藏关系 |

权限统一设为「所有用户可读，仅创建者可写」。

### 4. 部署云函数

对每个云函数目录右键 → **上传并部署（云端安装依赖）**。

### 5. 配置环境变量（重要）

云开发控制台 → 云函数 → 配置 → 环境变量，为对应函数添加：

**以下 3 个云函数都需要**（`createGroup` / `searchByTitle` / `getAuthUrl`）：

| 变量名 | 说明 |
|---|---|
| `PDD_CLIENT_ID` | 拼多多开放平台 Client ID |
| `PDD_CLIENT_SECRET` | 拼多多开放平台 Client Secret |
| `PDD_PID` | 多多进宝推广位 ID（PID） |

**`analyzeImage` 云函数**（OCR 备用方案）：

| 变量名 | 说明 |
|---|---|
| `TENCENT_SECRET_ID` | 腾讯云 SecretId（OCR 服务） |
| `TENCENT_SECRET_KEY` | 腾讯云 SecretKey（OCR 服务） |

> 🔒 **安全提示**：所有密钥都通过环境变量注入，代码仓库中不包含任何真实密钥。请勿将密钥写入代码或提交到 Git。

## OCR 识别（双重方案）

`analyzeImage` 按以下顺序尝试：

1. **方案 A：微信原生 OCR（cloud.openapi.ocr）**——免配置，默认生效
2. **方案 B：腾讯云 OCR**——需配置上述 `TENCENT_SECRET_*` 环境变量，识别更稳定

两个方案都不可用时，自动降级为默认填写模式。

## 参团流程

- **发布**：上传图片 → 系统 OCR 识别标题/价格/分类 → 选分类 → 发布
- **参团**：点击「立即参团」→ 弹窗确认 → 复制商品标题 → 去拼多多搜索参团

## 许可

本项目仅用于学习交流。使用拼多多开放平台能力请遵守其平台服务协议。
