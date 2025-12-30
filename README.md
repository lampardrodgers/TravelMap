# TravelMap（高德地图：酒店对比）

一个本地 Web 工具：输入多个酒店 + 多个地点（交通枢纽/公司/景点等），批量计算：

- 打车：距离 / 时间 / 预估价格
- 公交/地铁：多方案的时间 / 价格 / 步行距离（并可在地图上查看选中的方案路线）

## 运行

1. 配置环境变量（已提供 `.env.example`；你也可以直接改 `.env`）

```bash
VITE_AMAP_KEY=你的高德Key
AMAP_WEB_KEY=你的高德Key
# 可选：如果你的 Key 开启了「JSAPI 安全密钥」
# VITE_AMAP_SECURITY_CODE=你的securityJsCode
# 可选：前端访问密码（取消注释后生效）
# functionlock=你的访问密码
# 可选：密码有效时间（小时，允许小数）。仅在 functionlock 启用时生效；0/留空/注释代表每次都要输入
functionlock_hours=12
PORT=5174
```

2. 安装依赖并启动

```bash
npm install
npm run dev
```

- 前端：`http://localhost:5173`
- 后端：`http://localhost:5174`

## 使用方式

- 酒店与地点都支持「每行一个」，也支持直接输入坐标：`lng,lat`
- 点击酒店（H1/H2/...）切换当前酒店；右侧地图会显示该酒店 + 所有地点
- 点击「地图查看打车路线」或「地图查看该方案」在地图上绘制路线

## 用到的高德接口（后端代理）

后端在 `server/` 里做了 WebService 代理，主要调用：

- POI 文本搜索：`place/text`
- 地理编码：`geocode/geo`（兜底）
- 逆地理编码：`geocode/regeo`（坐标输入时补全 citycode/adcode）
- 驾车路径规划：`direction/driving`（用于打车距离/时间/预估费用）
- 公交路径规划：`direction/transit/integrated`（用于多方案公交组合）

## 备注（Key 安全）

JSAPI Key 必然会暴露在前端（浏览器端加载地图脚本），建议到高德控制台配置：

- JSAPI：配置可用域名白名单（Referer）
- WebService：配置可用 IP 白名单（如果部署在服务器上）
