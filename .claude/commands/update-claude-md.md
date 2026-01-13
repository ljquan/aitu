# Update CLAUDE.md

Intelligently update the CLAUDE.md documentation file when new features, plugins, or significant changes are added to the project.

## Instructions

You are tasked with updating the CLAUDE.md documentation to reflect new features or changes. Follow these steps:

1. **Understand the change**:
   - Identify what was added/modified (new plugin, feature, component, etc.)
   - Determine the scope and impact of the change
   - Locate relevant documentation files (if any)

2. **Read CLAUDE.md structure**:
   - Read the entire CLAUDE.md file to understand its structure
   - Identify which sections need to be updated
   - Note the existing documentation style and format

3. **Update relevant sections**:

   **For new plugins** (`packages/drawnix/src/plugins/`):
   - Add to the plugin list in "功能插件 (plugins/)" section
   - Add to the "编辑器插件系统" flow diagram
   - Create a dedicated subsection under "核心功能流程" if it's a major feature
   - Update the plugin count if mentioned

   **For new components** (`packages/drawnix/src/components/`):
   - Add to the appropriate component category
   - Include file path and brief description
   - Add subsection if it's a major UI component

   **For new hooks** (`packages/drawnix/src/hooks/`):
   - Add to the "React Hooks" section
   - Include brief description of purpose

   **For new utilities** (`packages/drawnix/src/utils/`):
   - Add to the "工具函数" section
   - Group with related utilities

   **For new documentation**:
   - Add link to "相关文档" section
   - Use format: `- /path/to/doc.md - Brief description`

4. **Create feature documentation section** (if major feature):
   - Add a new subsection under "核心功能流程"
   - Include:
     - Brief overview
     - Core files (with paths)
     - Key features (bullet points)
     - Usage example or workflow
     - Configuration (if applicable)
     - Link to detailed documentation

   Example structure:
   ```markdown
   ### Feature Name

   Brief description of what this feature does.

   **核心文件**：
   - `path/to/file.ts` - Description
   - `path/to/component.tsx` - Description

   **功能特点**：
   - Feature 1
   - Feature 2
   - Feature 3

   **使用方法**：
   1. Step 1
   2. Step 2
   3. Step 3

   **配置参数** (if applicable):
   ```typescript
   const CONFIG = {
     PARAM1: value,
     PARAM2: value,
   };
   ```

   详细文档：`/docs/FEATURE_NAME.md`
   ```

5. **Maintain consistency**:
   - Follow existing formatting and style
   - Use Chinese for descriptions (project uses Chinese documentation)
   - Keep code examples in English
   - Maintain alphabetical or logical ordering
   - Use consistent indentation and spacing
   - Preserve existing section structure

6. **Verify updates**:
   - Ensure all cross-references are correct
   - Check that file paths are accurate
   - Verify that the documentation is clear and complete
   - Make sure no duplicate entries exist

## Documentation Style Guidelines

- **Language**: Use Chinese for descriptions, English for code
- **File paths**: Use relative paths from project root
- **Code blocks**: Use triple backticks with language identifier
- **Lists**: Use `-` for unordered lists, numbers for ordered lists
- **Emphasis**: Use `**bold**` for section headers, `code` for file/function names
- **Structure**: Follow the existing hierarchy and organization

## Common Update Patterns

### Adding a Plugin
1. Update `plugins/` directory listing
2. Add to plugin flow diagram
3. Create feature section if major
4. Add to related documentation list

### Adding a Component
1. Update appropriate component category
2. Add file path and description
3. Create subsection if it's a major UI feature

### Adding Documentation
1. Add to "相关文档" section
2. Link from relevant feature sections
3. Ensure consistent formatting

## Important Notes

- NEVER remove existing content unless explicitly asked
- ALWAYS preserve the existing structure and formatting
- DO NOT add content that is not directly related to the change
- Keep descriptions concise but informative
- Use the same terminology as existing documentation
- Verify all file paths are correct before updating

## Example Usage

When a new text paste plugin is added:
1. Add `with-text-paste.ts` to plugins list
2. Update plugin flow diagram
3. Create "文本粘贴功能" subsection
4. Add `/docs/TEXT_PASTE_FEATURE.md` to related docs
5. Update `with-common.tsx` description to note it registers both plugins

## Post-Development Cleanup

**在需求开发完成后，必须执行以下清理步骤：**

### 注释掉所有 console 日志

开发完成后，需要注释掉项目中所有的 `console.log`、`console.debug`、`console.info` 日志（保留 `console.warn` 和 `console.error`）。

**执行命令：**
```bash
# 批量注释 console.log/debug/info
find packages/ apps/web/src/ -type f \( -name "*.ts" -o -name "*.tsx" \) \
  ! -name "*.test.*" ! -path "*/node_modules/*" \
  -exec sed -i '' 's/^\([[:space:]]*\)\(console\.\(log\|debug\|info\)\)/\1\/\/ \2/g' {} \;
```

**排除的文件：**
- `packages/utils/src/logger/index.ts` - 日志工具本身
- `packages/utils/src/async/index.ts` - 文档注释中的示例
- 测试文件 (`*.test.*`)

**注意事项：**
- 保留 `console.warn` 和 `console.error`（这些是有意义的警告和错误）
- 对于在语句中间的 console（如 `isDev && console.log`），需要手动处理
- 处理完后运行 TypeScript 检查确保没有语法错误

## Safety Checks

- Read CLAUDE.md before making changes
- Verify the change is significant enough to document
- Check for existing documentation of similar features
- Ensure updates don't break existing cross-references
- Preview changes mentally before writing
- **开发完成后，确保所有 console 日志已被注释**
