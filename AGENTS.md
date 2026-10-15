# AGENTS.md

## 项目概览

「手势互动万花筒」——给小朋友在 iPad Safari 上使用的全屏网页应用。

### 产品流程（客户需求）

1. **设计页**：每张预置图案单独配置手势 → 翻转/旋转、放大、缩小、换下一张（握拳 / 张开手掌 / 比耶 / 一根手指；同张内不重复）
2. **运行**：点「运行」开摄像头，按**当前图案**自己的映射现场表演；换图后自动换用下一张配置
3. 配置持久化：`localStorage` key `kaleido-design-v1`（见 `src/lib/design-config.ts`）

视频帧只在本地推理，**不上传**；运行页保留「换一张」按钮兜底。

### 版本技术栈

- Framework: Next.js 15.5（App Router；模板原为 Next 16，已按需求降级，勿再升级）
- Core: React 19 + TypeScript 5（strict）
- Styling: Tailwind CSS 4（`@import 'tailwindcss'`，主题 token 在 `src/app/globals.css`）
- 手势: `@mediapipe/tasks-vision` HandLandmarker（WASM + 本地模型，numHands=1，VIDEO 模式）
- 包管理：**仅 pnpm**

## 常用命令

```bash
pnpm install        # 安装依赖
pnpm dev            # 开发（bash scripts/dev.sh，next dev，端口取 $DEPLOY_RUN_PORT，默认 5000）
pnpm build          # 构建（bash scripts/build.sh：next build + tsup 打包自定义 server）
pnpm start          # 生产启动（node dist/server.js，端口取 $DEPLOY_RUN_PORT）
pnpm ts-check       # TypeScript 类型检查
pnpm lint:build     # ESLint 全量检查
pnpm lint:style     # Stylelint 检查 CSS
```

## 目录结构

```
public/
├── images/patterns/                 # 6 张预置万花筒图案（SVG，可直接同名替换）
└── vendor/mediapipe/
    ├── hand_landmarker.task         # 手部关键点模型（float16，随仓库本地化）
    └── wasm/                        # tasks-vision WASM 运行时（从 npm 包复制）
src/
├── app/
│   ├── layout.tsx                   # metadata + viewport（zh-CN，禁缩放，viewport-fit=cover）
│   ├── page.tsx                     # 仅挂载 <KaleidoscopeApp/>（client 入口）
│   └── globals.css                  # Tailwind + 全部万花筒自定义样式
├── components/
│   ├── kaleidoscope-app.tsx         # 主编排：状态机/摄像头生命周期/旋转循环/UI
│   ├── kaleidoscope-stage.tsx       # Canvas 万花筒（扇形取样+镜像折叠，手势驱动纹理）
│   └── ui/                          # shadcn/ui（本应用暂未直接使用）
└── lib/
    ├── gesture-engine.ts            # HandLandmarker 封装：初始化/GPU→CPU 回退/检测循环/骨架绘制
    ├── gestures.ts                  # 纯几何手势判定 classifyHand + 时序 GestureTracker
    ├── patterns.ts                  # 图案清单（替换/新增图案只改这里与 public 目录）
    └── sound.ts                     # WebAudio 合成「啵」音效（无音频素材）
```

## 核心实现约定

### 摄像头与权限（iPad Safari）

- `getUserMedia` 必须在用户手势调用栈内调用（「开始玩耍」按钮 onClick → `handleStart`），且部署环境必须 HTTPS。
- `<video>` 必须有 `muted playsInline autoPlay`，否则 iOS 会全屏播放器接管。
- video 元素在 `starting` 阶段就挂载（引擎 init 前需要 ref），退出/失败时停止所有 MediaStreamTrack。
- 预览与推理共用同一个 `<video>`；预览 `scaleX(-1)` 镜像，引擎输出的关键点也做了 `x -> 1-x` 镜像，方向一致。

### MediaPipe 本地化（无外部运行时依赖）

- WASM 路径：`/vendor/mediapipe/wasm`（`FilesetResolver.forVisionTasks`）
- 模型路径：`/vendor/mediapipe/hand_landmarker.task`
- 升级 `@mediapipe/tasks-vision` 后必须重新复制 WASM：
  `cp node_modules/@mediapipe/tasks-vision/wasm/* public/vendor/mediapipe/wasm/`
- 检测节流约 25fps（`DETECT_INTERVAL_MS=40`），GPU delegate 失败自动回退 CPU。

### 手势判定

- 手指伸直：`dist(指尖, 手腕) > 1.08 * dist(PIP, 手腕)`（朝向无关）；拇指用拇指尖与食指根距离辅助。
- 张手：≥3 指伸直且拇指张开；握拳：≤1 指伸直；其余为 partial（不触发动作）。
- 握拳需稳定 280ms 触发一次，900ms 冷却；挥动速度取最近 220ms 掌心（关键点 9）镜像横坐标斜率，限幅 ±2.6/s。
- 调参位置：`src/lib/gestures.ts`（阈值/时序）、`kaleidoscope-app.tsx` 顶部（`WAVE_GAIN` 等）。

### 万花筒渲染

- 12 等分扇形（每片 30°），`clip-path: polygon(0 50%, 100% 0, 100% 100%)` 裁成三角形，奇数片水平镜像——这是无缝对称的关键，勿改成矩形切片。
- 旋转通过 rAF 直接写 rotor 的 `transform`（ref 操作，不走 React state）；动画只用 transform/opacity。
- 图案素材的焦点在左缘中点（即扇形顶点=屏幕中心），沿水平中线上下镜像设计，替换素材时请保持这一构图规则。

## 设计规范

视觉、字体、动效、禁忌见 `DESIGN.md`。儿童字体 ZCOOL KuaiLe 经 `fonts.googleapis.cn` 在 globals.css 顶部 `@import`。

## 排障备忘

- 开发/服务日志：`/app/work/logs/bypass/app.log`（`pnpm dev` 输出）
- iPad 上摄像头黑屏：检查 HTTPS、权限、是否有其他 App 占用；页面内错误提示已按 DOMException 类型分类。
- 手势不识别：确认光线充足、手完整入镜；骨架点会实时画在预览窗，可据此判断检测是否正常。
- 沙箱内无头浏览器无法验证摄像头/手势，该链路依赖真机 iPad Safari 验收。
