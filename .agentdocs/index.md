# 项目文档索引

## 结构治理

- `workflow/260321-structure-convergence.md`
  - 适用场景：本轮前后端结构收敛、桥接层治理、边界校验与迁移跟踪
  - 关注点：`contracts` 抽离、`server/*/index.ts` 公开入口、`widgets/shared` 收敛、架构校验例外与退出条件

## 本地约束

- 当前项目采用 Next App Router，`src/app` 是唯一页面与路由入口。
- 前端采用局部 FSD 思想，不额外引入真实 `pages/entities/features` 目录层。
- 服务端按业务能力聚合，跨模块调用优先通过 `src/lib/server/<module>/index.ts`。
- 旧桥接层已退出；禁止重新引入 `src/components/*` 与 `src/lib/server/*` 的兼容 re-export 文件。
