import { forwardRef, useEffect, useImperativeHandle, useRef, useCallback, memo, useState } from 'react';
import { editorViewCtx } from '@milkdown/kit/core';
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener';
import { Milkdown, MilkdownProvider, useEditor, useInstance } from '@milkdown/react';
import { replaceAll, getMarkdown } from '@milkdown/kit/utils';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/frame.css';
import 'katex/dist/katex.min.css';
import { useImageViewer } from './useImageViewer';
import { linkClickPlugin } from './linkPlugin';
import { Eye, Code2 } from 'lucide-react';
import './MarkdownEditor.css';

/** 编辑器模式 */
export type EditorMode = 'wysiwyg' | 'source';

export interface MarkdownEditorProps {
  /** 初始 Markdown 内容 */
  markdown: string;
  /** 源码模式下显示的 Markdown 内容（可选，用于显示原始 URL 而非 base64） */
  sourceMarkdown?: string;
  /** 内容变化回调 */
  onChange?: (markdown: string) => void;
  /** 占位符文本 */
  placeholder?: string;
  /** 是否只读 */
  readOnly?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 是否显示模式切换按钮 */
  showModeSwitch?: boolean;
  /** 初始编辑模式 */
  initialMode?: EditorMode;
}

export interface MarkdownEditorRef {
  /** 获取当前 Markdown 内容 */
  getMarkdown: () => string;
  /** 设置 Markdown 内容 */
  setMarkdown: (markdown: string) => void;
  /** 聚焦编辑器 */
  focus: () => void;
  /** 获取当前编辑模式 */
  getMode: () => EditorMode;
  /** 设置编辑模式 */
  setMode: (mode: EditorMode) => void;
}

/** 内部编辑器 ref 接口（不含模式切换方法） */
interface InternalEditorRef {
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  focus: () => void;
}

interface MilkdownEditorInnerProps {
  markdown: string;
  onChange?: (markdown: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  editorRef: React.MutableRefObject<InternalEditorRef | null>;
}

// 内部编辑器组件
function MilkdownEditorInner({
  markdown,
  onChange,
  placeholder,
  readOnly,
  editorRef,
}: MilkdownEditorInnerProps) {
  const [loading, getInstance] = useInstance();
  const getCrepe = useCallback(() => getInstance() as unknown as Crepe | null, [getInstance]);

  // 使用 ref 存储最新的 onChange 回调，避免闭包陷阱
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // 存储上一次的 markdown 内容，用于比对
  const lastMarkdownRef = useRef(markdown);

  // 防抖 timer
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // 创建编辑器
  const handleUpload = useCallback((file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }, []);

  useEditor((root) => {
    const crepe = new Crepe({
      root,
      defaultValue: markdown,
      features: {
        [CrepeFeature.CodeMirror]: true,
        [CrepeFeature.ListItem]: true,
        [CrepeFeature.LinkTooltip]: true,
        [CrepeFeature.Cursor]: true,
        [CrepeFeature.ImageBlock]: true,
        [CrepeFeature.BlockEdit]: true,
        [CrepeFeature.Toolbar]: true,
        [CrepeFeature.Placeholder]: true,
        [CrepeFeature.Table]: true,
        [CrepeFeature.Latex]: true,
      },
      featureConfigs: {
        [CrepeFeature.Placeholder]: {
          text: placeholder || '开始编辑...',
        },
        [CrepeFeature.ImageBlock]: {
          onUpload: handleUpload,
          inlineOnUpload: handleUpload,
          blockOnUpload: handleUpload,
        },
      },
    });
    crepe.editor.use(listener);
    crepe.editor.use(linkClickPlugin);
    crepe.editor.config((ctx: any) => {
      const listenerManager = ctx.get(listenerCtx);
      listenerManager.markdownUpdated((_: unknown, md: string) => {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
        }

        if (md !== lastMarkdownRef.current) {
          lastMarkdownRef.current = md;
          debounceTimerRef.current = setTimeout(() => {
            onChangeRef.current?.(md);
          }, 50);
        }
      });
    });
    return crepe;
  }, [handleUpload, placeholder]);

  // 暴露方法给父组件
  useEffect(() => {
    if (!loading && getInstance()) {
      editorRef.current = {
        getMarkdown: () => {
          const crepe = getCrepe();
          if (crepe?.getMarkdown) {
            return crepe.getMarkdown();
          }
          if (crepe?.editor) {
            return crepe.editor.action(getMarkdown());
          }
          return '';
        },
        setMarkdown: (newMarkdown: string) => {
          const crepe = getCrepe();
          if (crepe) {
            lastMarkdownRef.current = newMarkdown;
            if (crepe.editor) {
              crepe.editor.action(replaceAll(newMarkdown));
            }
          }
        },
        focus: () => {
          const crepe = getCrepe();
          if (crepe?.editor) {
            const view = crepe.editor.ctx.get(editorViewCtx);
            view.focus();
          }
        },
      };
    }
  }, [loading, getInstance, editorRef, getCrepe]);

  useEffect(() => {
    const crepe = getCrepe();
    if (crepe?.setReadonly) {
      crepe.setReadonly(!!readOnly);
    }
  }, [readOnly, getCrepe]);

  // 当外部 markdown prop 变化时，同步更新编辑器
  useEffect(() => {
    if (!loading) {
      const crepe = getCrepe();
      if (crepe) {
        const currentMarkdown = crepe.getMarkdown ? crepe.getMarkdown() : crepe.editor?.action(getMarkdown());
        if (currentMarkdown !== undefined && markdown !== currentMarkdown && markdown !== lastMarkdownRef.current) {
          lastMarkdownRef.current = markdown;
          if (crepe.editor) {
            crepe.editor.action(replaceAll(markdown));
          }
        }
      }
    }
  }, [markdown, loading, getInstance, getCrepe]);

  // 清理防抖 timer
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  return <Milkdown />;
}

/**
 * 封装的 Markdown 富文本编辑器组件
 * 基于 Milkdown 实现统一的编辑和预览体验
 * 支持所见即所得和 Markdown 源码两种编辑模式
 */
export const MarkdownEditor = memo(forwardRef<MarkdownEditorRef, MarkdownEditorProps>(
  function MarkdownEditor(
    {
      markdown,
      sourceMarkdown,
      onChange,
      placeholder = '开始编辑...',
      readOnly = false,
      className = '',
      showModeSwitch = true,
      initialMode = 'wysiwyg',
    },
    ref
  ) {
    const editorRef = useRef<InternalEditorRef | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    
    // 编辑模式状态
    const [mode, setMode] = useState<EditorMode>(initialMode);
    // 源码模式下的内容（优先使用 sourceMarkdown）
    const [sourceContent, setSourceContent] = useState(sourceMarkdown || markdown);
    // 用于传递给 WYSIWYG 编辑器的内容（切换模式时更新）
    const [wysiwygContent, setWysiwygContent] = useState(markdown);

    // 图片预览功能
    const { updateViewer } = useImageViewer({
      containerRef,
      enabled: mode === 'wysiwyg',
    });

    // 切换模式时同步内容
    const handleModeChange = useCallback((newMode: EditorMode) => {
      if (newMode === mode) return;

      if (newMode === 'source') {
        // 切换到源码模式：优先使用 sourceMarkdown（原始 URL），否则从编辑器获取
        if (sourceMarkdown) {
          setSourceContent(sourceMarkdown);
        } else {
          const currentMarkdown = editorRef.current?.getMarkdown() || wysiwygContent;
          setSourceContent(currentMarkdown);
        }
      } else {
        // 切换到 WYSIWYG 模式：
        // 如果有 sourceMarkdown（即 base64 和 URL 是分开管理的），
        // 则保持 wysiwygContent 不变（使用 base64 版本）
        // 否则将源码内容同步到编辑器
        if (!sourceMarkdown) {
          setWysiwygContent(sourceContent);
          onChange?.(sourceContent);
        }
        // 有 sourceMarkdown 时，wysiwygContent 保持原样（base64 版本），无需 onChange
      }

      setMode(newMode);
    }, [mode, wysiwygContent, sourceContent, sourceMarkdown, onChange]);

    // 源码模式下的内容变化
    const handleSourceChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newContent = e.target.value;
      setSourceContent(newContent);
      onChange?.(newContent);
    }, [onChange]);

    // 暴露方法给父组件
    useImperativeHandle(ref, () => ({
      getMarkdown: () => {
        if (mode === 'source') {
          return sourceContent;
        }
        return editorRef.current?.getMarkdown() || '';
      },
      setMarkdown: (newMarkdown: string) => {
        setSourceContent(newMarkdown);
        setWysiwygContent(newMarkdown);
        editorRef.current?.setMarkdown(newMarkdown);
      },
      focus: () => {
        if (mode === 'source') {
          textareaRef.current?.focus();
        } else {
          editorRef.current?.focus();
        }
      },
      getMode: () => mode,
      setMode: handleModeChange,
    }));

    // 当外部 markdown prop 变化时，同步更新内容
    useEffect(() => {
      // 同步更新 WYSIWYG 内容
      if (markdown !== wysiwygContent) {
        setWysiwygContent(markdown);
      }
      // 源码内容优先使用 sourceMarkdown
      const newSourceContent = sourceMarkdown || markdown;
      if (newSourceContent !== sourceContent) {
        setSourceContent(newSourceContent);
      }
    }, [markdown, sourceMarkdown]);

    // 当 markdown 内容变化时，更新图片预览器
    useEffect(() => {
      if (mode === 'wysiwyg') {
        // 延迟更新，等待 DOM 渲染完成
        const timer = setTimeout(() => {
          updateViewer();
        }, 100);
        return () => clearTimeout(timer);
      }
    }, [markdown, updateViewer, mode]);

    // 阻止滚动事件冒泡到外层页面（Shadow DOM 中重要）
    const handleWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
      const container = containerRef.current;
      if (!container) return;

      const { scrollTop, scrollHeight, clientHeight } = container;
      const atTop = scrollTop === 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;

      // 如果在顶部向上滚动，或在底部向下滚动，阻止事件
      if ((atTop && e.deltaY < 0) || (atBottom && e.deltaY > 0)) {
        // 已经到达边界，不阻止（让父级可以滚动）
        return;
      }

      // 否则阻止事件冒泡，让编辑器内部滚动
      e.stopPropagation();
    }, []);

    return (
      <div 
        ref={containerRef}
        className={`collimind-markdown-editor ${className}`} 
        data-readonly={readOnly}
        data-mode={mode}
        onWheel={handleWheel}
      >
        {/* 模式切换按钮 - 放在编辑器内部 */}
        {showModeSwitch && (
          <div className="collimind-markdown-editor-mode-switch">
            <button
              type="button"
              className={`collimind-markdown-editor-mode-btn ${mode === 'wysiwyg' ? 'active' : ''}`}
              onClick={() => handleModeChange('wysiwyg')}
              title="所见即所得模式"
            >
              <Eye className="collimind-icon-sm" />
            </button>
            <button
              type="button"
              className={`collimind-markdown-editor-mode-btn ${mode === 'source' ? 'active' : ''}`}
              onClick={() => handleModeChange('source')}
              title="Markdown 源码模式"
            >
              <Code2 className="collimind-icon-sm" />
            </button>
          </div>
        )}

        {/* WYSIWYG 编辑器 */}
        {mode === 'wysiwyg' && (
          <MilkdownProvider>
            <MilkdownEditorInner
              markdown={wysiwygContent}
              onChange={onChange}
              placeholder={placeholder}
              readOnly={readOnly}
              editorRef={editorRef}
            />
          </MilkdownProvider>
        )}

        {/* 源码编辑器 */}
        {mode === 'source' && (
          <textarea
            ref={textareaRef}
            className="collimind-markdown-editor-source"
            value={sourceContent}
            onChange={handleSourceChange}
            placeholder={placeholder}
            readOnly={readOnly || !!sourceMarkdown}
            spellCheck={false}
          />
        )}
      </div>
    );
  }
));

export default MarkdownEditor;
