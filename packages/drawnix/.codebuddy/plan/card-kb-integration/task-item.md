# 实施计划

- [x] 1. 移除画布内联编辑，恢复 Card 只读展示
   - 删除 `with-card-edit.ts` 插件文件
   - 从 `drawnix.tsx` 中移除 `withCardEdit` 插件注册
   - 从 `card.generator.ts` 中移除编辑状态相关逻辑（`setEditing`、`isEditing` 等），恢复 `pointer-events: none`
   - 从 `CardElement.tsx` 中移除编辑模式 props 和 onChange 回调，保持只读渲染
   - _需求：1.1、1.2、1.3_

- [x] 2. Card 类型新增 noteId 字段
   - 在 `src/types/card.types.ts` 的 `PlaitCard` 接口中新增 `noteId?: string` 可选字段
   - _需求：2.1_

- [x] 3. 为 KnowledgeBaseContent 暴露外部导航接口
   - 在 `KnowledgeBaseContent.tsx` 中新增 `initialNoteId` prop，组件挂载后自动调用 `handleSelectNote(initialNoteId)` 定位到指定笔记
   - 新增 `kb:open-note` 事件监听，支持从外部动态导航到指定笔记
   - 在 `KnowledgeBaseDrawer.tsx` 中透传 `initialNoteId` prop 给 `KnowledgeBaseContent`
   - _需求：3.2、3.3_

- [x] 4. popup-toolbar 新增 Card 编辑按钮，点击打开知识库
   - 在 `popup-toolbar.tsx` 中检测选中元素是否为单个 Card（`isCardElement`）
   - 若是，显示编辑（铅笔）图标按钮
   - 点击时：若 Card 有 `noteId`，直接打开知识库抽屉并定位到该笔记；若无 `noteId`，先调用 `knowledgeBaseService.createNote` 在"笔记"目录下创建新笔记（标题取 Card `title`，内容取 Card `body`），再通过 `Transforms.setNode` 将新笔记 ID 写回 Card 的 `noteId` 字段，最后打开知识库抽屉定位到新笔记
   - 通过 `kb:open` 自定义事件打开知识库抽屉并传入 `noteId`
   - _需求：3.1、3.2、3.3_

- [x] 5. 知识库笔记保存时同步更新画布 Card
   - 在 `KnowledgeBaseContent.tsx` 的 `handleUpdateNote` 回调中，保存完成后通过 `window.__drawnixBoard` 遍历 `board.children`，找到 `noteId` 匹配的 Card 元素
   - 若找到，调用 `Transforms.setNode` 更新 Card 的 `title` 和 `body` 字段，不改变位置、尺寸和颜色
   - 在 `drawnix.tsx` 中将 board 实例挂载到 `window.__drawnixBoard`
   - _需求：5.1、5.2、5.3_

- [x] 6. KBUnifiedTree 笔记右键菜单新增"插入到画布"选项
   - 在 `KBUnifiedTree.tsx` 的 `KBUnifiedTreeProps` 接口中新增 `onInsertNoteToCanvas?: (note: KBNoteMeta) => void` 回调 prop
   - 在笔记行的右键上下文菜单中新增"插入到画布"菜单项，点击时调用 `onInsertNoteToCanvas`
   - _需求：4.1_

- [x] 7. KnowledgeBaseContent 实现"插入到画布"逻辑并传递给 KBUnifiedTree
   - 在 `KnowledgeBaseContent.tsx` 中实现 `handleInsertNoteToCanvas` 函数：
     - 获取笔记完整内容（`knowledgeBaseService.getNoteById`）
     - 检查当前 board 中是否已存在 `noteId` 相同的 Card，若存在则弹出确认对话框
     - 调用 `Transforms.insertNode` 在画布可视区域中央插入新 Card，设置 `title`、`body`、`noteId`、默认尺寸（240×180）和默认填充色
   - 将 `handleInsertNoteToCanvas` 作为 `onInsertNoteToCanvas` prop 传给 `KBUnifiedTree`
   - _需求：4.2、4.3、4.4_
