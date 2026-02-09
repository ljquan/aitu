/**
 * Markdown 编辑器链接增强插件
 * 功能：Ctrl/Cmd + 点击链接在新标签页打开
 */

import type { MilkdownPlugin } from '@milkdown/kit/ctx';
import { Plugin, PluginKey } from '@milkdown/kit/prose/state';

export const linkClickPlugin: MilkdownPlugin = (ctx) => {
  return async () => {
    // 创建 ProseMirror 插件
    const plugin = new Plugin({
      key: new PluginKey('linkClick'),
      props: {
        handleClick(view, pos, event) {
          // 检查是否按住了 Ctrl (Windows/Linux) 或 Cmd (Mac) 键
          if (!event.ctrlKey && !event.metaKey) {
            return false;
          }

          // 获取点击位置的节点
          const { doc } = view.state;
          const resolvedPos = doc.resolve(pos);

          // 检查当前节点或父节点是否包含链接 mark
          const marks = resolvedPos.marks();
          const linkMark = marks.find((mark) => mark.type.name === 'link');

          if (linkMark && linkMark.attrs.href) {
            // 阻止默认行为
            event.preventDefault();

            // 在新标签页打开链接并立即切换（使用 Chrome API 确保切换生效）
            if (typeof chrome !== 'undefined' && chrome.tabs) {
              chrome.tabs.create({ url: linkMark.attrs.href, active: true });
            } else {
              // 降级方案：使用 window.open
              const newWindow = window.open(linkMark.attrs.href, '_blank', 'noopener,noreferrer');
              if (newWindow) {
                newWindow.focus();
              }
            }
            return true;
          }

          return false;
        },

        // 添加鼠标悬停时的视觉反馈
        handleDOMEvents: {
          mouseover(view, event) {
            const target = event.target as HTMLElement;

            // 检查是否是链接元素
            if (target.tagName === 'A') {
              target.style.cursor = 'pointer';
              target.title = `${target.getAttribute('href') || ''}\n\nCtrl/Cmd + 点击打开`;
            }

            return false;
          },
        },
      },
    });

    // 将插件添加到 prosePlugins
    ctx.update('prosePlugins', (plugins) => (plugins as Plugin[]).concat(plugin));
  };
};
