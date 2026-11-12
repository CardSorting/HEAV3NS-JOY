<!-- [LAYER: UI] -->
# HEAV3NS-JOY：架构主权与结构熵控制框架

[English](../../README.md) · [其他语言](README.md) · [入门指南](../GETTING_STARTED.md) · [Agent 协议](../../AGENTS.md)

> *“不要构建另一个让智能体运行的场所。构建可以让智能体学习、带走并在任何地方独立复现的事物。”*

**一句话总结：** HEAV3NS-JOY 通过极简约定与零依赖检查器，防止代码库（无论是人类编写还是 AI 智能体生成）发生架构漂移。

---

## 60 秒核心概念

| 维度 | 说明 |
| :--- | :--- |
| **是什么** | 一个极简约定加上一个零依赖静态分析工具。每个文件在首行声明所属的五个规范区域之一（`DOMAIN`、`CORE`、`INFRASTRUCTURE`、`PLUMBING`、`UI`）。 |
| **为什么** | 架构往往在无声中漂移，而 AI 编码智能体会加速这种漂移。将架构转化为机器可验证的数据，在提交时就能阻止腐化，而不是等到全面重构。 |
| **怎么做** | 将文件放置在对应区域的物理目录中，严格遵循单向依赖流，运行 `node bin/joy-check.mjs .`。退出码 `0` 即为架构健全。 |
| **成本** | **零外部依赖**、无需注册账号、无需联网、默认完全只读。 |

### 餐厅比喻

将代码库想象成一家餐厅：
- **厨房 (`DOMAIN`)**：制作纯正菜品与业务规则，严禁在烹饪中途直接给供应商打电话。
- **调度台 (`CORE`)**：协调菜品出餐流程与用例调度。
- **供应商适配器 (`INFRASTRUCTURE`)**：负责食材采购、网络与数据库 I/O。
- **餐厅大堂 (`UI`)**：接待顾客与渲染界面，绝不能直接走入食材仓库。
- **后勤水暖 (`PLUMBING`)**：纯函数通用工具，完全无状态且不依赖任何区域。

---

## 五大规范区域

| 区域 | 物理目录 | 职责所有权 | 硬性规则 |
| :--- | :--- | :--- | :--- |
| `DOMAIN` | `src/domain/` | 业务规则、实体、值对象、`I*` 正式契约 | **0% I/O 熵**；严禁导入基础设施或 UI |
| `CORE` | `src/core/` | 用例编排、状态机、策略控制器 | 严禁导入 UI；通过接口与基础设施交互 |
| `INFRASTRUCTURE` | `src/infrastructure/` | 文件系统、HTTP、数据库与第三方适配器 | 严禁导入 UI；必须实现 Domain 定义的接口 |
| `PLUMBING` | `src/plumbing/` | 无状态通用工具、加解密算法、路径工具 | 叶子依赖层；严禁导入任何其他区域 |
| `UI` | `src/ui/` | 控制台输出、HTTP 路由、Web 页面呈现 | 捕获用户意图；严禁直接导入基础设施 |

---

## 快速上手（2 分钟）

运行无需安装任何 npm 依赖，只需 Node.js 18+ 与 git：

```bash
git clone https://github.com/CardSorting/HEAV3NS-JOY.git
cd HEAV3NS-JOY

# 1. 运行自测套件（196 个测试全部通过）
npm test

# 2. 运行架构主权审计
npm run joy-check

# 3. 为你的项目安装 Agent 支持（Claude、Cursor、Antigravity 等）
npx heav3ns-joy init
```

---

## 便携式三位一体原语（Portable Trinity）

HEAV3NS-JOY 内置三个零依赖轻量原语，可在任何 Harness 或终端运行：
- **BroccoliQueue**：持久化作业队列。
- **BufferedDb**：防重载写延迟数据库。
- **AgentSwarm**：多专家的协作规划与派发。

```bash
# 验证当前环境是否完全支持 Trinity
node bin/joy-trinity.mjs selftest

# 诊断环境与持久化状态目录
node bin/joy-trinity.mjs doctor

# 基于任务自动规划专家阵型
node bin/joy-trinity.mjs swarm classify --task "重构订单支付流程并解决循环依赖"
```

完整文档请访问 [文档中心](../README.md) 与 [规范标准](../../spec/00-CANONICAL-MODEL.md)。

