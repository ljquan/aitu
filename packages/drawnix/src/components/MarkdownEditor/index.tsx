import { forwardRef, useEffect, useImperativeHandle, useRef, useCallback, memo, useState } from 'react';
import { editorViewCtx } from '@milkdown/kit/core';
import { replaceAll } from '@milkdown/kit/utils';
import { Crepe, CrepeFeature } from '@milkdown/crepe';
import { Milkdown, MilkdownProvider, useEditor } from '@milkdown/react';
import '@milkdown/crepe/theme/common/style.css';
import '@milkdown/crepe/theme/nord.css';
import 'katex/dist/katex.min.css';
import { Eye, Code2 } from 'lucide-react';
import './MarkdownEditor.css';

/** 编辑器模式 */
export type EditorMode = 'wysiwyg' | 'source';

export interface MarkdownEditorProps {
  /** 初始 Markdown 内容 */
  markdown: string;
  /** 源码模式下显示的 Markdown 内容（可选） */
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
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  focus: () => void;
  getMode: () => EditorMode;
  setMode: (mode: EditorMode) => void;
}

// 图片上传：转 base64
function handleImageUpload(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** 内部编辑器 ref */
interface InternalEditorRef {
  getMarkdown: () => string;
  setMarkdown: (markdown: string) => void;
  focus: () => void;
}

interface CrepeEditorCoreProps {
  markdown: string;
  onChange?: (markdown: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  editorRef: React.MutableRefObject<InternalEditorRef | null>;
}

/**
 * 核心编辑器组件 - 使用 useEditor hook（必须在 MilkdownProvider 内部）
 */
function CrepeEditorCore({ markdown, onChange, placeholder, readOnly, editorRef }: CrepeEditorCoreProps) {
  const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const lastMarkdownRef = useRef(markdown);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const crepeRef = useRef<Crepe | null>(null);

  const { get, loading } = useEditor((root) => {
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
        [CrepeFeature.Placeholder]: { text: placeholder || '开始编辑...' },
        [CrepeFeature.Cursor]: {
          color: '#3b82f6',
          width: 4,
        },
        [CrepeFeature.ImageBlock]: {
          onUpload: handleImageUpload,
          inlineOnUpload: handleImageUpload,
          blockOnUpload: handleImageUpload,
        },
        [CrepeFeature.Latex]: {
          katexOptions: { strict: 'ignore' },
        },
      },
    });

    // 监听 markdown 变化
    crepe.on((listener) => {
      listener.markdownUpdated((_: unknown, md: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        if (md !== lastMarkdownRef.current) {
          lastMarkdownRef.current = md;
          debounceRef.current = setTimeout(() => onChangeRef.current?.(md), 50);
        }
      });
    });

    crepeRef.current = crepe;
    return crepe;
  }, []);

  // 编辑器就绪后暴露方法 & 设置只读
  useEffect(() => {
    if (loading) return;
    const crepe = crepeRef.current;
    if (!crepe) return;

    if (readOnly) {
      try { crepe.setReadonly(true); } catch { /* 忽略 */ }
    }

    editorRef.current = {
      getMarkdown: () => { try { return crepe.getMarkdown?.() ?? ''; } catch { return ''; } },
      setMarkdown: (md: string) => {
        try { lastMarkdownRef.current = md; crepe.editor?.action(replaceAll(md)); } catch { /* 忽略 */ }
      },
      focus: () => {
        try { crepe.editor?.ctx.get(editorViewCtx)?.focus(); } catch { /* 忽略 */ }
      },
    };

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      editorRef.current = null;
    };
  }, [get, readOnly, editorRef, loading]);

  // 同步 readOnly
  useEffect(() => {
    if (loading) return;
    const crepe = crepeRef.current;
    if (crepe) { try { crepe.setReadonly(!!readOnly); } catch { /* 忽略 */ } }
  }, [readOnly, loading]);

  // 外部 markdown prop 变化时同步
  useEffect(() => {
    if (loading) return;
    const crepe = crepeRef.current;
    if (!crepe) return;
    try {
      const cur = crepe.getMarkdown?.();
      if (cur !== undefined && markdown !== cur && markdown !== lastMarkdownRef.current) {
        lastMarkdownRef.current = markdown;
        crepe.editor?.action(replaceAll(markdown));
      }
    } catch { /* 忽略 */ }
  }, [markdown, loading]);

  return <Milkdown />;
}

/**
 * 封装的 Markdown 富文本编辑器组件
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
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [mode, setMode] = useState<EditorMode>(initialMode);
    const [sourceContent, setSourceContent] = useState(sourceMarkdown || markdown);

    const handleModeChange = useCallback((newMode: EditorMode) => {
      if (newMode === mode) return;
      if (newMode === 'source') {
        setSourceContent(sourceMarkdown || editorRef.current?.getMarkdown() || markdown);
      } else if (!sourceMarkdown) {
        // 从源码模式切回 WYSIWYG，同步内容
        editorRef.current?.setMarkdown(sourceContent);
        onChange?.(sourceContent);
      }
      setMode(newMode);
    }, [mode, markdown, sourceContent, sourceMarkdown, onChange]);

    const handleSourceChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const v = e.target.value;
      setSourceContent(v);
      onChange?.(v);
    }, [onChange]);

    useImperativeHandle(ref, () => ({
      getMarkdown: () => mode === 'source' ? sourceContent : (editorRef.current?.getMarkdown() || ''),
      setMarkdown: (md: string) => { setSourceContent(md); editorRef.current?.setMarkdown(md); },
      focus: () => { mode === 'source' ? textareaRef.current?.focus() : editorRef.current?.focus(); },
      getMode: () => mode,
      setMode: handleModeChange,
    }));

    // 外部 markdown prop 变化时同步源码内容
    useEffect(() => {
      const src = sourceMarkdown || markdown;
      if (src !== sourceContent) setSourceContent(src);
    }, [markdown, sourceMarkdown]);

    return (
      <div
        className={`collimind-markdown-editor ${className}`}
        data-readonly={readOnly}
        data-mode={mode}
      >
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
        <div style={{ display: mode === 'wysiwyg' ? 'contents' : 'none' }}>
          <MilkdownProvider>
            <CrepeEditorCore
              markdown={markdown}
              onChange={onChange}
              placeholder={placeholder}
              readOnly={readOnly}
              editorRef={editorRef}
            />
          </MilkdownProvider>
        </div>

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
