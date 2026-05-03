# 内置 Agent 信息维护 — 设计方案与实施步骤

> **本次需求范围**：为内置（builtin）Agent 增加两类**新字段**的可视化维护能力——
> 1. **`install_path`**：agent 程序本体的安装路径（可执行文件 / `.app` 包 / `.exe`）
> 2. **`config_path`**：agent 主配置文件路径（如 `~/.claude/CLAUDE.md`、`~/.codex/config.toml`）
>
> ⚠️ 不在本次范围：`global_skills_dir`（skill 的安装目录）已经由 Settings 的"扫描目录"模块管理，本次**不动它**，也不做迁移逻辑。

---

## 1. 背景与现状盘点

### 1.1 数据模型现状

`agents` 表 (见 [db.rs](../src-tauri/src/db.rs) `Agent` 结构体, L57–L68) 当前字段：

| 字段 | 说明 |
|------|------|
| `id` | 主键，如 `claude-code`、`codex` |
| `display_name` | 展示名 |
| `category` | `coding` / `lobster` / `other`（仅元数据） |
| `global_skills_dir` | **skill 的安装目录**（不在本次范围） |
| `project_skills_dir` | 项目级 skills 目录 |
| `icon_name` | 图标 key |
| `is_detected` | 是否检测到本机已安装 |
| `is_builtin` / `is_enabled` | 内置 / 启用标志 |

**缺口**：

- 没有 agent **程序本体**的安装路径（如 `/Applications/Cursor.app`、`/usr/local/bin/codex`）。
- 没有 agent **主配置文件**的路径。
- `is_detected` 现在是用 `global_skills_dir` 父目录是否存在做的弱判据（[is_agent_detected](../src-tauri/src/commands/agents.rs) L65–L71），容易误判。

### 1.2 字段语义对比（含本次新增）

| 字段 | 语义 | 指向 | 典型值 (macOS) | 谁创建 |
|------|------|------|----------------|--------|
| `global_skills_dir`（已有） | skill 的安装目录 | 目录 | `~/.claude/skills/` | skills-manage 自己 |
| **`install_path`（新）** | agent 程序本体 | 文件 / `.app` 包 | `/Applications/Cursor.app`、`~/.cargo/bin/codex`、`/usr/local/bin/claude` | 用户用包管理器/官方安装包 |
| **`config_path`（新）** | agent 主配置 | 文件 / 目录 | `~/.claude/CLAUDE.md`、`~/.codex/config.toml`、`~/.amp/settings.json` | agent 程序首次启动 |

三者概念并列，**不重叠**。

### 1.3 后端能力现状

- [seed_builtin_agents](../src-tauri/src/db.rs) (L453–L502) 已通过 `ON CONFLICT DO UPDATE` 保留用户改动 `global_skills_dir` 的值（注释 L466–L468）。
- [agents.rs](../src-tauri/src/commands/agents.rs) 暴露的写命令仅 `add/update/remove_custom_agent`，对 builtin 全部拒写（[L611](../src-tauri/src/commands/agents.rs)）。
- 没有任何 IPC 命令可改 builtin 路径。

### 1.4 前端能力现状

- [SettingsView.tsx](../src/pages/SettingsView.tsx) 只有自定义 Agent 维护区（L295）与扫描目录区。
- 没有"内置 Agent 信息维护"入口。

---

## 2. 总体设计

### 2.1 数据模型变更

```diagram
╭─ agents 表（变更后）──────────────────────────────────────╮
│ id (PK)                                                  │
│ display_name, category, icon_name                        │
│ global_skills_dir            ← 不动（skill 安装目录）    │
│ project_skills_dir                                       │
│ + install_path     TEXT NULL ← 新：agent 程序本体        │
│ + config_path      TEXT NULL ← 新：主配置文件            │
│ + is_overridden    INTEGER NOT NULL DEFAULT 0  ← 新       │
│ is_builtin, is_enabled, is_detected                      │
╰──────────────────────────────────────────────────────────╯
```

- **`install_path`**：可执行文件或 `.app` / `.exe`。允许 NULL（用户未提供）。当非空时，**优先**用作 `is_detected` 的依据。
- **`config_path`**：主配置文件路径。允许 NULL。
- **`is_overridden`**：用户是否手工设置过 `install_path` 或 `config_path` 的任一项。reseed 时保留用户值。

### 2.2 builtin 默认值扩展

`Agent` 结构体扩 `install_path: Option<String>` 与 `config_path: Option<String>`。每条 builtin 按 OS 给一组合理默认值：

```rust
Agent {
    id: "claude-code".into(),
    display_name: "Claude Code".into(),
    global_skills_dir: in_home(".claude/skills"),
    install_path: default_install_path("claude-code"),   // 按 OS 推断
    config_path: Some(in_home(".claude/CLAUDE.md")),
    ..
}
```

`default_install_path(id)` 在 [src-tauri/src/path_utils.rs](../src-tauri/src/path_utils.rs) 中按 `cfg!(target_os = ...)` 给出多候选优先列表，**取第一个真实存在的**；都不存在则返回 `None`。例如：

```rust
match (id, OS) {
  ("claude-code", "macos") => first_existing(&[
      "/Applications/Claude.app",
      shell_which("claude"),
      "~/.local/bin/claude",
  ]),
  ("codex", _) => first_existing(&[
      shell_which("codex"),
      "~/.cargo/bin/codex",
  ]),
  ...
}
```

> 这只是**推荐默认值**；用户可在 UI 中覆盖。

### 2.3 检测逻辑增强（is_agent_detected）

[is_agent_detected](../src-tauri/src/commands/agents.rs) 改成多维度：

```text
若 install_path != NULL 且其指向的路径存在 → detected
否则若 global_skills_dir 或其父目录存在    → detected (旧逻辑兼容)
否则                                      → not detected
```

`install_path` 给出来后，检测会变得显著更准确（不会因为 `~/.cursor/` 被其他工具创建而误判为 Cursor 已装）。

### 2.4 新增 IPC 命令

在 [src-tauri/src/commands/agents.rs](../src-tauri/src/commands/agents.rs) 新增：

| 命令 | 入参 | 行为 |
|------|------|------|
| `update_builtin_agent_paths` | `agent_id`, `install_path?`, `config_path?` | **白名单字段**，仅允许写这两个新字段；展开 `~`；写入后 `is_overridden = 1`。**不改** `global_skills_dir` / `display_name` / `category` 等。|
| `reset_builtin_agent_paths` | `agent_id` | 还原为 `builtin_agents()` 默认值；`is_overridden = 0`。|
| `set_agent_enabled` | `agent_id`, `enabled` | 启用 / 停用任意 agent（含 builtin），用于 UI 一键禁用。|

返回类型：`AgentWithStatus`（含新字段 `install_path` / `config_path` / `is_overridden`）。

### 2.5 校验规则

- `install_path` / `config_path` 若提供，必须为绝对路径（展开 `~` 后判 `Path::is_absolute()`）。
- 不要求路径必须存在（用户可能先填、稍后安装），但 UI 给一个"路径不存在"的弱提示。
- 不做 install_path 的全局唯一性约束（不同 agent 可指向不同 binary，无冲突场景）。

### 2.6 reseed 策略调整

`seed_builtin_agents` 的 `ON CONFLICT DO UPDATE`：

```sql
install_path = CASE WHEN agents.is_overridden = 1
                    THEN agents.install_path
                    ELSE excluded.install_path END,
config_path  = CASE WHEN agents.is_overridden = 1
                    THEN agents.config_path
                    ELSE excluded.config_path  END
```

效果：

- 升级 builtin 默认（如 vendor 改了官方安装路径）→ 未自定义用户跟随。
- 已自定义用户的值不被覆盖。
- `global_skills_dir` 既有保留逻辑维持不变。

### 2.7 联动效应

- 路径写入后立即调一次 `detect_agents_impl` 刷新 `is_detected`。
- `scan_directories` **不受影响**（本次不动 `global_skills_dir`）。
- 前端 `usePlatformStore` / `useSettingsStore` 完成一次 `loadAgents()` 即可。

---

## 3. 前端设计

### 3.1 类型与 Store 扩展

`AgentWithStatus` TS 类型补 `install_path?: string | null`、`config_path?: string | null`、`is_overridden: boolean`。

[settingsStore.ts](../src/stores/settingsStore.ts) 增补：

```ts
updateBuiltinAgentPaths(agentId, paths: {
  installPath?: string | null;
  configPath?: string | null;
}): Promise<AgentWithStatus>;
resetBuiltinAgentPaths(agentId): Promise<AgentWithStatus>;
setAgentEnabled(agentId, enabled: boolean): Promise<void>;
```

### 3.2 UI 区块（在 SettingsView 中）

在"自定义 Agent"卡片**之上**新增 Section "内置 Agent 信息维护"：

```diagram
╭─ 内置 Agent 信息维护 ───────────────────────────────────────────╮
│ 27 个内置 Agent  · [✓ 仅显示已检测到]  [搜索框]                │
├────────────────────────────────────────────────────────────────┤
│ [icon] Claude Code      [coding]    ● Detected                 │
│        程序路径: /Applications/Claude.app          [改] [打开] │
│        配置文件: /Users/x/.claude/CLAUDE.md        [改] [打开] │
│        [已自定义]                       [重置默认]   [启用 ●]  │
├────────────────────────────────────────────────────────────────┤
│ [icon] Codex CLI        [coding]    ○ Not Detected             │
│        程序路径: (未配置)                                [改]  │
│        配置文件: /Users/x/.codex/config.toml       [改] [打开] │
│        ...                                                     │
╰────────────────────────────────────────────────────────────────╯
```

要点：

- 列表分类折叠（coding / lobster），首屏默认展开 coding。
- 搜索框按 `display_name` / `id` 过滤；checkbox 仅显示已检测到。
- "已自定义" 徽章 = `is_overridden`。
- "打开" 按钮：
  - `install_path` 是 `.app` → 在 Finder 中显示 / 启动；
  - 是可执行文件 → Finder 定位；
  - `config_path` 是文件 → 用默认编辑器打开（macOS `open`、Win `start`、Linux `xdg-open`）。
  - 路径不存在则 disabled，hover tooltip "路径不存在"。
- "改" 唤起 `BuiltinAgentEditDialog`（仅含两个新字段输入；display_name / category / icon / global_skills_dir 全只读）。

### 3.3 BuiltinAgentEditDialog

```tsx
<BuiltinAgentEditDialog
  agent={agent}
  open={open}
  onSubmit={({ installPath, configPath }) =>
    updateBuiltinAgentPaths(agent.id, { installPath, configPath })}
  onReset={() => resetBuiltinAgentPaths(agent.id)}
/>
```

字段：

- 程序路径 (Optional, 绝对路径，placeholder = 代码内置默认；输入旁边显示"代码默认值"灰色字以便对比)
- 配置文件 (Optional, 绝对路径)
- 底部按钮：取消 / 重置默认 / 保存

### 3.4 i18n 文案（新增 `settings.builtinAgent.*`）

| key | zh | en |
|-----|----|----|
| `settings.builtinAgent.title` | 内置 Agent 信息维护 | Built-in Agents |
| `settings.builtinAgent.subtitle` | 维护程序路径与配置文件路径 | Manage install paths and config paths |
| `settings.builtinAgent.installPath` | 程序路径 | Install Path |
| `settings.builtinAgent.configPath` | 配置文件 | Config Path |
| `settings.builtinAgent.unset` | 未配置 | Not set |
| `settings.builtinAgent.overridden` | 已自定义 | Customized |
| `settings.builtinAgent.reset` | 重置默认 | Reset to default |
| `settings.builtinAgent.openLocation` | 打开 | Open |
| `settings.builtinAgent.pathNotExist` | 路径不存在 | Path does not exist |

---

## 4. 测试方案

### 4.1 Rust 单元测试

- `test_update_builtin_agent_paths_writes_install_path`
- `test_update_builtin_agent_paths_writes_config_path`
- `test_update_builtin_agent_paths_marks_overridden`
- `test_update_builtin_agent_paths_rejects_other_fields`（白名单：试图改 display_name 不生效）
- `test_update_builtin_agent_paths_expands_tilde`
- `test_reset_builtin_agent_paths_restores_defaults_and_clears_overridden`
- `test_seed_preserves_overridden_paths`
- `test_seed_updates_default_paths_when_not_overridden`
- `test_is_agent_detected_uses_install_path_when_present`
- `test_is_agent_detected_falls_back_to_skills_dir`
- `test_set_agent_enabled_for_builtin_and_custom`

### 4.2 前端测试 (Vitest)

- `settingsStore.builtinAgent.test.ts`：mock `invoke`，验证三个新 action 调用正确命令并更新 store。
- `BuiltinAgentEditDialog.test.tsx`：渲染 + 提交回调 + 重置回调。

### 4.3 手工回归

| 用例 | 预期 |
|------|------|
| 给 cursor 设置 install_path = `/Applications/Cursor.app` | `is_detected=true`，列表实时刷新 |
| 给 codex 设置 config_path → "打开"按钮 | 调起默认编辑器 |
| 改完 install_path 后重启 app | 用户值保留，徽章"已自定义"仍在 |
| "重置默认" | 路径回到 builtin 默认；徽章消失 |
| 试图通过 IPC 改 cursor 的 display_name | 后端 reject |
| 路径填一个不存在的目录 | 保存成功，UI 提示"路径不存在"，不阻塞 |

---

## 5. 实施步骤（按 PR 拆分）

### PR-1：数据模型与 builtin 默认值（后端 only，无 UI）

1. [src-tauri/src/db.rs](../src-tauri/src/db.rs)
   - `Agent` struct 增加 `install_path: Option<String>`、`config_path: Option<String>`、`is_overridden: bool`。
   - `CREATE TABLE agents` 加入新列；增加幂等 `ALTER TABLE` 迁移（`PRAGMA table_info` 判存在后再 ALTER）。
   - `builtin_agents()` 每条记录补 `install_path` / `config_path` 默认值（按 OS）。
   - `seed_builtin_agents` 的 SQL 改为遵守 `is_overridden` 的两列覆盖策略。
2. 新增辅助函数 `default_install_path(id)`，`first_existing(&[&str])`。
3. 新增 db 层底层函数：`update_builtin_agent_paths` / `reset_builtin_agent_paths` / `set_agent_enabled`，配套测试。
4. **不暴露 IPC**，仅验证迁移、seed、override 行为。

### PR-2：IPC 命令 + 检测增强 + 测试

1. [src-tauri/src/commands/agents.rs](../src-tauri/src/commands/agents.rs)：
   - 增 3 个 `#[tauri::command]`：`update_builtin_agent_paths`、`reset_builtin_agent_paths`、`set_agent_enabled`。
   - 校验路径是绝对（展开 `~` 后），白名单字段。
   - `is_agent_detected` 增加 install_path 优先分支。
   - `AgentWithStatus` 加新字段。
2. `lib.rs` 注册命令。
3. 单元测试覆盖 §4.1。`cargo test` 通过。

### PR-3：前端 Store / 类型 / i18n

1. `src/types/*` 中 `AgentWithStatus` 加 `install_path` / `config_path` / `is_overridden`。
2. [settingsStore.ts](../src/stores/settingsStore.ts) 加三个 action。
3. 中英 i18n 加 `settings.builtinAgent.*`。
4. Vitest 单元测试覆盖三个 action。

### PR-4：内置 Agent 维护 UI

1. 新建 `src/components/settings/BuiltinAgentEditDialog.tsx`。
2. 在 [SettingsView.tsx](../src/pages/SettingsView.tsx) 自定义 Agent 区上方插入"内置 Agent 信息维护"卡片：搜索 / 过滤 / 折叠分类 / 路径行 / "改" "打开" "重置" "启用" 操作。
3. "打开"按钮使用 `@tauri-apps/plugin-shell` 的 `open()`。
4. 至少 1 个组件测试（dialog 提交回调）。
5. 完成 §4.3 手工回归。

### PR-5（可选体验增强）

- "自动探测"按钮：对 `install_path = NULL` 的 builtin，调用一次 `default_install_path` 重新候选 + 写回（不影响 `is_overridden`）。
- 在 `is_detected` 列旁加 "查看版本"，未来可执行 `<install_path> --version` 显示。

---

## 6. 风险与权衡

| 风险 | 缓解 |
|------|------|
| 用户填错 install_path 导致 `is_detected` 错误 | 提供"重置默认"+"自动探测"；UI 给"路径不存在"提示 |
| seed 升级覆盖了用户期望保留的值 | 通过 `is_overridden` 显式区分；任何主动 update 立刻置 1 |
| 不同 OS 默认路径分支多 | 集中在 `default_install_path` 一个函数；按需扩展，缺省返回 None |
| `is_agent_detected` 行为变化影响左侧导航 | 加单元测试 + 手工回归"路径不存在时回退到旧逻辑" |
| 既有测试断言依赖默认值 | PR-1 同步更新；新字段对原断言无侵入 |

---

## 7. 变更影响矩阵

| 文件 | 改动 | PR |
|------|------|----|
| [src-tauri/src/db.rs](../src-tauri/src/db.rs) | 表结构 + builtin_agents + seed | PR-1 |
| [src-tauri/src/path_utils.rs](../src-tauri/src/path_utils.rs) | `default_install_path` / `first_existing` | PR-1 |
| [src-tauri/src/commands/agents.rs](../src-tauri/src/commands/agents.rs) | 3 个新命令 + 检测增强 + 测试 | PR-2 |
| `src-tauri/src/lib.rs` | 注册命令 | PR-2 |
| [src/stores/settingsStore.ts](../src/stores/settingsStore.ts) | 新增 actions | PR-3 |
| `src/types/*.ts` | AgentWithStatus 字段 | PR-3 |
| `src/i18n/{zh,en}.ts` | 新增文案 | PR-3 |
| `src/components/settings/BuiltinAgentEditDialog.tsx` | 新组件 | PR-4 |
| [src/pages/SettingsView.tsx](../src/pages/SettingsView.tsx) | 新增维护区块 | PR-4 |

---

## 8. Done Definition

1. 用户可在 Settings 中查看任意内置 Agent 的 **程序路径** 与 **配置文件** 路径。
2. 用户可修改并持久化这些路径，重启后保留。
3. 修改 `install_path` 后，`is_detected` 立即按新路径重新计算。
4. 用户可一键"重置默认"。
5. `global_skills_dir` 与 skill 安装/卸载逻辑**完全不受影响**。
6. `cargo test` 与 `pnpm test` 全绿（既有 3 个遗留失败除外）。
