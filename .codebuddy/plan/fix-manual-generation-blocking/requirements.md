# 需求文档

## 引言

在执行 `release:major` 命令（即 `node scripts/deploy-hybrid.js`）时，部署流程会在"步骤 4: 生成用户手册"环节卡住。

**根因分析：**

`stepGenerateManual()` 函数中的截图生成步骤存在以下问题：

1. **Playwright 自动启动开发服务器导致长时间等待**：当端口 7200 未被占用时（release 场景下通常如此），脚本设置 `CI=1`，使得 Playwright 的 `reuseExistingServer` 为 `false`，强制启动 `npx nx serve web` 开发服务器。开发服务器启动超时 120 秒，加上测试超时 300 秒，仅截图步骤就可能等待 7 分钟。
2. **release 流程不应依赖开发服务器**：release 时已有完整的构建产物（`dist/apps/web`），截图应该使用构建产物而非开发服务器，或者在 release 流程中完全跳过截图步骤（使用已有截图）。
3. **`manual:build` 步骤通过 `ts-node` 执行**：`pnpm run manual:build` 调用 `npx ts-node scripts/generate-manual.ts`，在某些环境下可能因 TypeScript 编译配置问题而报错。

本次修复目标是让 release 流程中的手册生成步骤**快速、可靠**地完成，不再因为截图生成或环境问题而卡住。

## 需求

### 需求 1：优化 release 流程中的截图生成策略

**用户故事：** 作为一名开发者，我希望在执行 release 命令时手册生成不会因为截图步骤而卡住，以便 release 流程能快速完成。

#### 验收标准

1. WHEN 执行 `release:major` 或其他 release 命令且端口 7200 未被占用 THEN 系统 SHALL 跳过截图生成步骤，直接使用已有截图构建手册，并输出提示信息。
2. WHEN 执行 `release:major` 且端口 7200 已被占用（开发服务器已运行） THEN 系统 SHALL 复用已有的开发服务器生成截图。
3. WHEN 截图生成被跳过 THEN 系统 SHALL 在日志中明确告知用户"跳过截图生成，使用已有截图"。
4. IF 用户需要在 release 流程中强制生成截图 THEN 系统 SHALL 提供提示说明如何手动生成（如先运行 `pnpm manual:screenshots`）。

### 需求 2：提高 `manual:build` 命令的健壮性

**用户故事：** 作为一名开发者，我希望 `manual:build` 命令在各种环境下都能可靠执行，以便手册生成不因编译问题中断 release 流程。

#### 验收标准

1. WHEN 执行 `manual:build` THEN 系统 SHALL 确保 `ts-node` 能正确解析和编译 `generate-manual.ts`，不因 TypeScript 配置冲突而报错。
2. IF `manual:build` 因编译或依赖问题失败 THEN `deploy-hybrid.js` 中的手册步骤 SHALL 仅输出警告信息，不阻塞整个 release 流程（当前逻辑已有此设计，需确认实际有效）。

### 需求 3：缩短手册生成步骤的总耗时

**用户故事：** 作为一名开发者，我希望 release 流程中手册生成步骤的耗时控制在合理范围内（< 30 秒），以便整体 release 流程更高效。

#### 验收标准

1. WHEN release 流程执行手册生成步骤且不需要生成截图 THEN 整个手册生成步骤 SHALL 在 30 秒内完成。
2. WHEN 截图生成超时 THEN 系统 SHALL 在合理时间内（< 60 秒）放弃截图生成并继续后续步骤。
3. IF Playwright 浏览器未安装或环境不完整 THEN 系统 SHALL 快速失败并使用已有截图，而非长时间等待超时。

### 需求 4：改善手册生成相关命令的用户体验

**用户故事：** 作为一名开发者，我希望手册相关的命令有清晰的日志输出和错误提示，以便我快速定位和解决问题。

#### 验收标准

1. WHEN 手册生成步骤开始执行 THEN 系统 SHALL 输出清晰的步骤说明，包括将要执行的操作（跳过截图/生成截图/仅构建 HTML）。
2. WHEN 手册生成步骤因任何原因失败 THEN 系统 SHALL 输出具体的错误原因和建议的修复命令。
3. WHEN 手册生成成功完成 THEN 系统 SHALL 输出生成的文件数量和耗时信息。
