# 实施计划

- [ ] 1. 定义 Card 元素类型和数据结构
   - 在 `src/types/` 下新建 `card.types.ts`，定义 `PlaitCard` 接口（继承 `PlaitElement`），包含 `type: 'card'`、`title?: string`、`body: string`、`fillColor: string`、`points: Point[]` 字段
   - 在 `src/constants/` 下新建 `card-colors.ts`，定义预设调色板（6 种颜色）和颜色工具函数（主色 → 深色标题区 / 浅色正文区）
   - _需求：1.1、2.1、4.4_

- [ ] 2. 实现 Card 元素的 SVG 渲染器
   - 新建 `src/components/card-element/card.generator.ts`，实现 `canDraw` 和 `draw` 方法
   - 渲染带圆角的卡片：标题区（深色调）+ 正文区（浅色调），`title` 为空时只渲染正文区
   - 正文超出最大高度时截断并显示省略号
   - _需求：2.1、2.2、2.3_

- [ ] 3. 实现 Card 元素的画布组件并注册到插件
   - 新建 `src/components/card-element/card.component.ts`，继承 `CommonElementFlavour`，集成 `ActiveGenerator`（支持选中、拖拽、缩放、删除）
   - 新建 `src/plugins/with-card.ts`，注册 Card 元素类型到 Plait 插件体系
   - 在主插件入口引入 `with-card` 插件
   - _需求：1.2_

- [ ] 4. 在 popup-toolbar 中为 Card 元素添加填充颜色支持
   - 在 `popup-toolbar.tsx` 的 `state` 计算逻辑中，识别选中元素包含 Card 类型时，读取 `fillColor` 字段作为 `fill` 值
   - 在 `transforms/property.ts` 中新增 `setCardFillColor(board, color)` 方法，通过 `Transforms.setNode` 更新 Card 的 `fillColor`
   - 在 `PopupFillButton` 的 `onSolidChange` 回调中，当选中元素为 Card 时调用 `setCardFillColor`
   - _需求：1.4、2.4_

- [ ] 5. 实现 Markdown 解析工具函数
   - 新建 `src/utils/markdown-to-cards.ts`，实现 `parseMarkdownToCards(text: string): CardBlock[]` 函数
   - 按 `#`/`##` 标题分割文本块，提取 `title` 和 `body`，清理列表符号（`-`、`*`、`1.`）
   - 无标题时返回单个 `{ title: undefined, body: text }` 块；无 Markdown 特征时返回 `null`（降级信号）
   - _需求：3.1、3.2、3.3、3.4、3.5_

- [ ] 6. 实现 Card 元素的画布插入工具函数
   - 新建 `src/utils/insert-cards.ts`，实现 `insertCardsToCanvas(board, cards, startPoint?)` 函数
   - 按网格布局（每行最多 3 张，卡片间距 20px）计算每张 Card 的 `points`，循环分配调色板颜色
   - 插入完成后滚动画布至第一张 Card 并选中所有新插入元素
   - _需求：4.1、4.2、4.3、4.4_

- [ ] 7. 修改粘贴插件，支持 Markdown 粘贴为 Card
   - 在 `src/plugins/with-text-paste.ts` 中，拦截粘贴事件
   - 调用 `parseMarkdownToCards`：返回 `null` 时走原有普通文本插入逻辑；返回 Card 块时调用 `insertCardsToCanvas`
   - _需求：3.1、3.5_

- [ ] 8. 修改 `insert_text` MCP 工具，改为插入 Card 元素
   - 找到 `insert_text` MCP 工具实现，将其 `execute` 方法改为：调用 `parseMarkdownToCards` 解析文本，再调用 `insertCardsToCanvas` 插入 Card 元素
   - 无 Markdown 结构时将整段文本作为单张 Card 的 `body` 插入
   - 返回结果中包含插入的 Card 元素数量
   - _需求：5.1、5.2、5.3、5.4_