# 更新日志

本文件记录该项目的重要变更。

## 0.9.3 - 2026-04-28

新功能版本：中央技能目录可以在 UI 里直接配置，相关命令都会读取该配置。

### 新功能

- 设置页新增 **中央技能目录** 卡片：输入框 + 保存按钮 + 保存后自动重新扫描。
- 新增 `set_central_skills_dir` 后端命令 + DB 辅助函数 `update_central_skills_dir`。
- 新增 `write_skill_to_central` 命令，用于技能市场预览安装（替换原来的 `BaseDirectory.Home` 写死路径）。

### 改进

- `install_marketplace_skill`、`write_skill_to_central`（技能市场）以及 `start_project_scan`（项目发现）改为从数据库读取配置的中央路径，而不是默认常量。
- 中央库空状态提示与技能市场预览安装路径都会反映当前配置。
- `seed_builtin_agents` 在每次启动时不再覆盖用户自定义的 `central` 路径。

### 测试

- `SettingsView.test.tsx` "saves the github pat from settings" 用例改为先按输入框定位到 GitHub PAT 卡片再在卡片内查找 `保存` 按钮，避免与新的中央目录保存按钮冲突。

## 0.9.2 - 2026-04-27

这是一次维护版本，把中央技能库扫描改为递归扫描。

### 改进

- `scan_directory` 现在会对中央目录做递归扫描，任意层级下的技能都能被识别（例如 `~/skills/src/shared/<skill>/SKILL.md`）。
- 一旦某目录已经是技能（包含 `SKILL.md`），递归会在该目录止步，不会把技能内部子目录再当成独立技能。
- 新增对隐藏目录（`.git`、`.cache` 等）和常见重型目录（`node_modules`、`dist`、`build`、`target`、`__pycache__`）的跳过规则。
- 通过规范化路径的访问集合 + 16 层深度上限来防止 symlink 死循环。

### 测试

- 移除原 `test_scan_directory_is_not_recursive` 断言；新增三项测试覆盖递归发现、技能内部不再下钻、隐藏/重型目录跳过。

## 0.9.1 - 2026-04-23

这是一次以完整路径显示一致性和 README 细节补充为主的小型维护版本。

### 修复

- 中央技能库、平台页、设置页、全局搜索与平台编辑流程统一显示完整绝对路径，不再将路径折叠成 `~`。
- Windows 平台的路径展示统一为带盘符的反斜杠风格。
- 自定义平台的自动生成目录会根据当前平台的 home 目录风格生成对应路径。

### 改进

- 在中英文 README 中补充 `Star History` 小节。
- 补充路径 helper 与相关 UI 断言测试，覆盖新的显示规则。

## 0.9.0 - 2026-04-23

这是一次围绕 Windows 支持、macOS Universal 打包和稳定性修复的跨平台版本。

### 亮点

- 新增 Windows x64 桌面支持，可提供 `.msi` 安装包与 `.zip` 便携包。
- macOS 打包升级为 Universal 方案，可产出 `.dmg`、`.zip` 和 `.tar.gz` 安装产物。

### 新功能

- 为后端命令、扫描目录设置和前端路径展示补充 Windows 友好的 home/path 处理逻辑。
- 新增 Windows 下的安装自动回退：当符号链接创建失败时，可自动改用 copy 方式完成安装。
- 新增面向 Windows x64 与 macOS universal 的 GitHub Actions 打包与发布自动化流程。

### 修复

- 改进 Claude 多来源技能处理，确保平台行、详情操作与解释内容在重载和重扫后仍保持 source-specific 一致性。
- 修复全局重扫后的刷新链路，让 central、platform 与 discover 视图状态同步更稳定。
- 优化路径标签、侧边栏/详情连续性，以及设置页和技能视图中的一批可访问性与交互细节。

## 0.8.0 - 2026-04-20

首个公开发布版本。

### 新功能

- 发布基于 Tauri 的 `skills-manage` 桌面应用，用统一界面管理内置与自定义平台上的 AI agent skills。
- 新增平台视图与中央技能库视图，支持安装、卸载、符号链接状态识别和 canonical skill 管理。
- 新增完整的技能详情体验，包含 Markdown 预览、原位抽屉导航、安装操作与集合相关工作流。
- 新增技能集合管理、自定义平台设置、扫描目录配置、首次使用引导、Toast 反馈与响应式侧边栏。
- 新增中英文界面、Catppuccin 多风格主题系统、强调色切换以及全局命令面板。
- 新增项目级 Discover 扫描，支持递归发现、结果缓存、停止扫描、导入中央技能库以及更好的上下文保留。
- 新增 marketplace 浏览、预览抽屉、自动集中安装，以及 AI 技能解释能力。
- 新增 GitHub 仓库导入流程，支持预览、镜像回退重试、可选鉴权请求、选择状态保持以及导入后安装到平台。

### 性能优化

- 通过延迟查询、懒加载索引、轻量搜索结果卡片和长列表虚拟化，改善全局搜索、中央技能搜索和项目技能浏览性能。

### 修复

- 强化 AI explanation 流程，拒绝空白缓存内容，并在缓存损坏为空时自动重新生成。
- 改进 frontmatter 处理逻辑，稳定提取 `name`、`description`、`version` 等结构化字段，避免原始 YAML 混入 Markdown 预览。
- 在技能详情中展示已加入的集合，并在“加入技能集”时默认选中已存在集合。
- 优化详情抽屉、marketplace 预览和 GitHub 导入界面布局，减少跳转带来的上下文丢失。
