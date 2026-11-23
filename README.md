# OpenVeilBoard

一间房，一张实体台面。以 `branch/veilboard` 的自研 WebGPU 引擎重建，账号与房间权限复用 `branch/Hamburger_Protect`。

## 运行

需要 Node.js 22.12 或以上。

```bash
npm ci
npm run dev
```

默认地址：<http://127.0.0.1:5188/>。

本机开发由 Vite 转发投骰请求，携带当前用户的 JWT；生产环境使用 Supabase Edge Function。房间成员权限和投骰结果始终由服务端校验。

- 正常登录：`/`，读取 `.env.local` 的 Supabase 配置。
- 本机演示：`/?demo=1`，演示数据仅保存到浏览器。
- 强制 2D：`/?demo=1&fallback=1`。

演示入口不创建云账号，也不代替登录与权限校验。

```bash
npm run build
npm test
npm run check:browser
```

浏览器检查使用本机 Chrome，支持 `CHROME_PATH`、`BASE_URL`、`OUTPUT_DIR`。截图和检查结果默认写入系统临时目录。

## 结构

| 层 | 入口 | 职责 |
|---|---|---|
| 实体台面 | `src/scene/CounterScene.js` | 石膏材质、树影、骨骼纸卡、绳索、归档槽、印漆时钟、Cannon 骰子 |
| 领域内核 | `src/domain/boardStore.ts` | 对象级乐观写入、顺序保存、冲突检测、归档与投骰 |
| 数据适配 | `src/data/` | Supabase RPC/Realtime；同接口的本机演示仓库 |
| React 浮层 | `src/ui/` | 登录、房间、检视编辑器、能力插件、归档与 2D 降级 |

视觉采用石膏台面、旧纸与红线；工作界面只保留四角入口。动效围绕登录落桌、打印落纸、悬停抬升与拖拽入盒。

便签有四种纸张形态与七类能力。纸面最多显示三个角标，完整操作集中在检视编辑器。清单、事件钟、检定、批注、保密、物资和标签的面板各自独立。

## 数据与权限

实际后端使用 `notes`、`note_links`、`campaign_settings.clock_config`、`dice_rolls`。账号、注册、邀请码申请、GM 审批、站点审核和服务端投骰沿用已上线接口。

新增迁移：`supabase/migrations/20261123000000_veilboard_surface.sql`。

```bash
npm run supabase:push:dry
npm run supabase:push
```

脚本从当前 Supabase URL 选择项目，仅执行这份增量迁移，使用事务与迁移锁。旧字段 `x/y` 仍是像素坐标，新增 `surface_x/surface_y` 是归一化坐标，两套接口双向换算。

机密标题、正文、封面路径和能力数据存入私有表；公开表与 Realtime 只包含封条占位。图片访问同时校验便签受众，未关联的新上传只允许上传者读取。批注由独立 RPC 添加，仅作者可删除。编辑器以打开时的数据为基线检查冲突。

多人共用服务端骰子结果。动画随机源由投骰 ID 派生；不同屏幕的运动轨迹允许有差异，最终骰面与结果一致。物理展示最多 40 颗，公式完整结果保留。

## 验证范围

已覆盖桌面与手机尺寸的登录接口契约、登录恢复、中文便签、清单、连线纸签、归档取回、投骰成签与刷新保留。WebGPU 检查覆盖七种骰体、点击拖拽、绳索休眠和归档恢复。

登录浏览器检查使用明确的 Auth/RPC 测试夹具；不代表真实云账号、邮件注册与双成员联机已实测。Safari、120 Hz 屏幕及大量便签的性能仍需实机验收。

原作品集页面、作品视频、Lab 场景、旧办公室和旧板块 UI 已退出工程。引擎与素材来源见 `THIRD_PARTY_NOTICES.md`。

本次实施与验证明细见 [重构验收记录](docs/rebuild-validation-20261123.md)。
