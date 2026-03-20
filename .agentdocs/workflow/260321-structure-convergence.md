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

以下文件当前是显式桥接层，只允许纯 re-export：

- `src/lib/server/types.ts`
- `src/lib/server/jobs.ts`
- `src/lib/server/provider-adapter.ts`
- `src/lib/server/worker.ts`
- `src/lib/server/worker-runtime.ts`
- `src/lib/server/settings.ts`
- `src/lib/server/prompt-pack.ts`
- `src/lib/server/db.ts`
- `src/components/dashboard-control-room.tsx`
- `src/components/dashboard-shell.tsx`
- `src/components/job-detail-control-room.tsx`
- `src/components/job-detail-shell.tsx`
- `src/components/job-round-card.tsx`
- `src/components/settings-control-room.tsx`
- `src/components/settings-shell.tsx`
- `src/components/studio-frame.tsx`
- `src/components/ui/confirm-dialog.tsx`
- `src/components/ui/model-alias-combobox.tsx`
- `src/components/ui/select-field.tsx`
- `src/components/ui/use-hydrated.ts`

退出条件：

- 页面、widgets、API route、运行时、测试不再引用这些桥接文件。
- 相关调用方全部切换到 `contracts`、`widgets/*`、`shared/*`、`server/*/index.ts` 后删除桥接层。

## 架构治理例外

以下超大文件在当前轮先登记为过渡例外，不作为“新增 1000+ 文件”阻断对象：

- `src/lib/server/jobs/internal.ts`

退出条件：

- 下一轮继续把 `jobs/internal.ts` 中的查询、命令、goal-anchor、steering、mapper 逻辑进一步实体拆分，最终取消该例外。

## TODO

- [x] 建立 `contracts` 与服务端模块公开入口。
- [x] 建立 `widgets/shared` 新目录并切换主要页面入口。
- [x] 把 API route 切到公开入口。
- [x] 为测试切换到新真实路径并清理硬编码绝对路径。
- [x] 增加 `lint` 与 `check:architecture`。
- [x] 跑通 `typecheck/test/build/lint/check:architecture` 并记录剩余失败。
- [ ] 删除已无引用的桥接层。

## 关键决策

- 不做完整 FSD 落地，避免和 Next App Router 形成并行页面体系。
- 优先稳定公开边界，再做更细粒度拆分，避免在迁移中反复打穿模块。
- 对超大文件采用“显式登记 + 后续退出”策略，而不是一边过渡一边假装架构已经收敛完成。
