# 实施计划

- [ ] 1. 重构 `deploy-hybrid.js` 中 `stepGenerateManual` 函数的截图生成逻辑
   - 修改 `scripts/deploy-hybrid.js` 中的 `stepGenerateManual()` 函数
   - 在截图生成步骤开始前，先检查端口 7200 是否被占用
   - **端口未被占用时**：直接跳过截图生成步骤，输出提示 `"⏭️ 开发服务器未运行，跳过截图生成，使用已有截图"` 以及 `"💡 如需更新截图，请先运行: pnpm manual:screenshots"`
   - **端口已被占用时**：设置 `CI=` 环境变量（清除 CI），复用已有的开发服务器执行 Playwright 截图，保留 `timeout: 300000` 的超时设置
   - 删除当前"端口未占用时设置 `CI=1`"自动启动开发服务器的逻辑，这是导致卡住的根本原因
   - _需求：1.1、1.2、1.3、1.4_

- [ ] 2. 为截图生成步骤添加 Playwright 环境预检查
   - 在 `stepGenerateManual()` 函数中，执行 Playwright 截图之前，先检查 Playwright 浏览器是否已安装
   - 通过执行 `npx playwright --version`（或检查 `~/.cache/ms-playwright` 目录是否存在 chromium）进行快速检测
   - 如果浏览器未安装，直接跳过截图并输出提示：`"⚠️ Playwright 浏览器未安装，跳过截图。安装命令: npx playwright install chromium"`
   - 这样可以避免 Playwright 在缺少浏览器时长时间等待后才报错
   - _需求：3.3_

- [ ] 3. 降低截图生成步骤的超时时间
   - 在 `stepGenerateManual()` 中，将截图命令的 `execSync` 超时从 `300000`（5 分钟）降低到 `60000`（1 分钟）
   - 由于修改后只在端口已被占用（开发服务器已运行）时才执行截图，1 分钟足够完成截图任务
   - _需求：3.2_

- [ ] 4. 验证并加固 `manual:build` 的 `ts-node` 执行环境
   - 检查 `scripts/generate-manual.ts` 的 TypeScript 编译是否依赖特定的 `tsconfig` 配置
   - 在 `package.json` 的 `manual:build` 脚本中，为 `ts-node` 添加必要的编译选项（如 `--compiler-options '{"module":"commonjs"}'`），确保在不同环境下都能正确编译
   - 或者考虑将 `manual:build` 改为使用 `npx tsx scripts/generate-manual.ts`（tsx 是 ts-node 的现代替代方案，零配置、更快更稳定）
   - _需求：2.1_

- [ ] 5. 确保 `manual:build` 失败时不阻塞 release 流程
   - 审查 `stepGenerateManual()` 中 `pnpm run manual:build` 的 try-catch 逻辑
   - 确认当前的外层 try-catch 确实能捕获 `execSync` 抛出的异常并返回 `true`（不阻塞部署）
   - 在 catch 块中增加更明确的错误输出：打印具体的错误信息以及建议的修复命令（如 `"手动运行: pnpm manual:build 查看详细错误"`）
   - _需求：2.2、4.2_

- [ ] 6. 增强手册生成步骤的日志输出
   - 在 `stepGenerateManual()` 函数开头添加记录开始时间的逻辑（`const startTime = Date.now()`）
   - 在函数开始时输出将要执行的操作计划（如 `"📖 手册生成：将跳过截图，仅构建 HTML"` 或 `"📖 手册生成：将更新截图并构建 HTML"`）
   - 在函数结束时输出总耗时（如 `"⏱️ 手册生成耗时: 3.2 秒"`）
   - 在截图跳过、截图完成、HTML 构建完成等各个子步骤结束后，输出阶段性的完成信息
   - _需求：4.1、4.3_

- [ ] 7. 端到端验证：模拟 release 场景测试手册生成
   - 在端口 7200 未被占用的情况下，运行 `node scripts/deploy-hybrid.js --skip-build --skip-npm --skip-server --skip-e2e` 验证手册生成步骤能快速完成（< 30 秒）
   - 在端口 7200 已被占用的情况下（先启动 `pnpm start`），运行同样的命令验证截图能正常生成
   - 使用 `--skip-manual` 参数验证跳过手册功能正常工作
   - 确认所有日志输出清晰、无报错
   - _需求：1.1、1.2、3.1_
