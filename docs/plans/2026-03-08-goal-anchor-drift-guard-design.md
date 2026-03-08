# Goal Anchor Drift Guard Design

**Context**

当前多轮优化会自然滑向“更安全、更规范、更容易过 reviewer”的方向，但这条路径有时会牺牲用户真正想完成的任务目标。系统缺少一个跨轮次稳定存在、不可被自动改写的“核心目标锚点”，导致提示词可能在高分区间里逐步偏离原始意图。

**Goal**

引入一个轻量但刚性的 `goalAnchor`，确保系统允许专业优化结构和表达，但不允许任务目标和关键交付物发生漂移。

**Confirmed Product Decisions**

- 采用两层模型：
  - `goalAnchor`
  - 优化师专业自由度
- `goalAnchor` 是硬门槛
- 允许系统专业地细化和优化需求
- 但不允许为了规避风险或追求高分而改掉核心目标

**GoalAnchor Shape**

```ts
type GoalAnchor = {
  goal: string
  deliverable: string
  driftGuard: string[]
}
```

语义：
- `goal`: 这条提示词最终要完成什么任务
- `deliverable`: 最关键的输出产物是什么
- `driftGuard`: 2-4 条“什么样的改写算偏题”

**Generation Strategy**

首版不引入新模型调用，避免创建任务时增加额外网络依赖和失败面。系统会在创建任务时基于原始 prompt 生成一个保守初版 `goalAnchor`：

- `goal`：保留原始任务意图的高密度摘要
- `deliverable`：强调原始任务最重要的最终输出
- `driftGuard`：使用通用但硬性的防漂移约束

这个初版的目的不是替代用户，而是提供一个可编辑的稳定锚点。之后用户可以在详情页修订它。

**Prompting Rules**

- `optimizer` 每轮必须看到：
  - 当前完整提示词
  - `goalAnchor`
  - 上一轮精简 patch
  - 下一轮人工引导
- `reviewer` 每轮必须看到：
  - 当前候选完整提示词
  - `goalAnchor`
  - 评分规则
- `reviewer` 仍然不能看到历史聚合问题

**Reviewer Hard Gate**

`reviewer` 评分前必须先判定目标忠实度：

- 如果候选提示词偏离 `goal`
- 或丢失 `deliverable`
- 或触发 `driftGuard`

则必须：
- `hasMaterialIssues = true`
- 分数不能进入高分区
- 反馈中明确指出偏离点

**UI**

任务详情页增加一个 `核心目标锚点` 控制区：
- `goal`
- `deliverable`
- `driftGuard`（每行一条）

该区域允许用户编辑并保存。

**Testing**

- 纯函数测试：
  - 原始 prompt 可生成稳定 `goalAnchor`
  - 序列化/反序列化与归一化正确
- prompting 测试：
  - optimizer 看得到 `goalAnchor`
  - reviewer 也看得到 `goalAnchor`
  - reviewer 提示词包含“目标忠实度为硬门槛”
- 数据测试：
  - 任务创建时自动带 `goalAnchor`
  - 任务详情页可读取/保存 `goalAnchor`

**Non-Goals**

- 不新增独立 drift checker 模型
- 不回到多 judge 并行
- 不让 reviewer 看到历史聚合问题
