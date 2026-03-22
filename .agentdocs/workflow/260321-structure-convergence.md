# 260321 Structure Convergence

## 背景

- 仓库原有 `src/lib/server` 存在按技术平铺、核心文件过大、客户端误依赖服务端内部类型的问题。
- 前端页面壳层与超大控制室组件边界不清，`components/ui` 与页面装配层职责混杂。
- 本轮目标不是完整 FSD，而是做适配当前项目的双轨结构收敛：
  - 服务端先按业务能力与流程职责拆分。
  - 前端再按 `widgets/shared` 做局部边界清理。

## 当前方案

### 第一阶段

- 新增 `src/lib/contracts/*`，承载跨层稳定类型。
- 新增服务端模块目录：
  - `src/lib/server/jobs/`
  - `src/lib/server/runtime/`
  - `src/lib/server/providers/`
  - `src/lib/server/settings/`
  - `src/lib/server/prompt-pack/`
  - `src/lib/server/db/`
- API route 统一收敛到模块公开入口，避免继续 import 服务端内部实现。

### 第二阶段

- 新增前端目录：
  - `src/components/widgets/dashboard/`
  - `src/components/widgets/job-detail/`
  - `src/components/widgets/settings/`
  - `src/components/shared/ui/`
  - `src/components/shared/layout/`
  - `src/components/shared/hooks/`
- `src/app` 直接引用 widgets 页面壳层，旧 `src/components/*.tsx` 页面壳文件只保留桥接职责。

## 过渡层

桥接层已在本轮移除完成。

当前要求：

- 禁止重新引入 `src/components/*` 与 `src/lib/server/*` 的兼容 re-export 文件。
- 页面、widgets、API route、脚本、测试统一直接依赖 `contracts`、`widgets/*`、`shared/*`、`server/*/index.ts`。

## 架构治理例外

本轮已移除 `src/lib/server/jobs/internal.ts` 过渡例外。

## TODO

- [x] 建立 `contracts` 与服务端模块公开入口。
- [x] 建立 `widgets/shared` 新目录并切换主要页面入口。
- [x] 把 API route 切到公开入口。
- [x] 为测试切换到新真实路径并清理硬编码绝对路径。
- [x] 增加 `lint` 与 `check:architecture`。
- [x] 跑通 `typecheck/test/build/lint/check:architecture` 并记录剩余失败。
- [x] 删除已无引用的桥接层。
- [x] 收紧 `jobs/index.ts` 导出面，并新增 `jobs/runtime.ts` 供 worker/runtime 独占使用。
- [x] 物理拆分 `jobs/internal.ts` 为 `repository/shared/mappers + *-internal`，取消内部总线文件。
- [x] 收紧 `providers/index.ts` 导出面，只保留工厂与协议推断；模型目录归一化和 transport/parsers 下沉到模块内部。
- [x] 删除旧 `providers/adapter.ts` 大文件，保留 `providers/index.ts` 作为唯一公共入口。
- [x] 将 `widgets/job-detail/page-shell.tsx` 拆成 query/actions/view-model 编排层，减少页面容器直接承载的加载与 mutation 逻辑。
- [x] 将 `widgets/job-detail/control-room.tsx` 继续拆为 result/stable-rules/runtime-controls/pending-steering/diagnostics section，保留页面顺序与交互语义。
- [x] 将 `goal-anchor` / `goal-anchor-explanation` 从 `src/lib/server` 根级文件收敛为显式模块，避免 `jobs/*` 继续依赖根级隐式能力。

## 关键决策

- 不做完整 FSD 落地，避免和 Next App Router 形成并行页面体系。
- 优先稳定公开边界，再做更细粒度拆分，避免在迁移中反复打穿模块。
- 对超大文件采用“显式登记 + 后续退出”策略，而不是一边过渡一边假装架构已经收敛完成。
- `jobs` 对外分成两类入口：`index.ts` 面向 route/页面用例，`runtime.ts` 面向 worker；runtime-only 能力不再经公共 `index.ts` 暴露。
- `providers` 模块对外唯一入口为 `providers/index.ts`；provider-specific normalize/parser/transport 均视为内部实现。
- `goal-anchor` 视为独立服务端能力模块，统一从 `src/lib/server/goal-anchor/*` 消费；禁止重新引入根级 `goal-anchor*.ts` 文件。
- `job-detail/page-shell.tsx` 只保留页面编排职责；数据加载、动作编排、view-model 计算已拆出独立文件，避免继续在单文件堆积状态机。
- `job-detail/control-room.tsx` 只保留页面级装配；section 组件只接收 view model / UI state / handlers，不直接触碰 server API。
