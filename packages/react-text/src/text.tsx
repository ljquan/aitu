import { createEditor, type Descendant, Range, Transforms } from 'slate';
import { isKeyHotkey } from 'is-hotkey';
import {
  Editable,
  RenderElementProps,
  RenderLeafProps,
  Slate,
  withReact,
} from 'slate-react';
import {
  type CustomElement,
  type CustomText,
  type LinkElement,
  type ParagraphElement,
  type TextProps,
} from '@plait/common';
import React, { useMemo, useCallback, useEffect, CSSProperties } from 'react';
import { withHistory } from 'slate-history';
import { isUrl, LinkEditor } from '@plait/text-plugins';
import { withText } from './plugins/with-text';
import { CustomEditor, RenderElementPropsFor } from './custom-types';

import './styles/index.scss';
import { LinkComponent, withInlineLink } from './plugins/with-link';

export type TextComponentProps = TextProps;

export const Text: React.FC<TextComponentProps> = (
  props: TextComponentProps
) => {
  const { text, readonly, onChange, onComposition, afterInit } = props;

  const renderLeaf = useCallback(
    (props: RenderLeafProps) => <Leaf {...props} />,
    []
  );

  const initialValue: Descendant[] = [text];

  const editor = useMemo(() => {
    const editor = withInlineLink(
      withText(withHistory(withReact(createEditor())))
    );
    afterInit && afterInit(editor);
    return editor;
  }, []);

  useEffect(() => {
    if (text === editor.children[0]) {
      return;
    }
    editor.children = [text];
    editor.onChange();
  }, [text, editor]);

  const onKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    const { selection } = editor;

    // Default left/right behavior is unit:'character'.
    // This fails to distinguish between two cursor positions, such as
    // <inline>foo<cursor/></inline> vs <inline>foo</inline><cursor/>.
    // Here we modify the behavior to unit:'offset'.
    // This lets the user step into and out of the inline without stepping over characters.
    // You may wish to customize this further to only use unit:'offset' in specific cases.
    if (selection && Range.isCollapsed(selection)) {
      const { nativeEvent } = event;
      if (isKeyHotkey('left', nativeEvent)) {
        event.preventDefault();
        Transforms.move(editor, { unit: 'offset', reverse: true });
        return;
      }
      if (isKeyHotkey('right', nativeEvent)) {
        event.preventDefault();
        Transforms.move(editor, { unit: 'offset' });
        return;
      }
    }
  };

  return (
    <Slate
      editor={editor}
      initialValue={initialValue}
      onChange={(value: Descendant[]) => {
        onChange &&
          onChange({
            newText: editor.children[0] as ParagraphElement,
            operations: editor.operations,
          });
      }}
    >
      <Editable
        className="slate-editable-container plait-text-container"
        renderElement={(props) => <Element {...props} />}
        renderLeaf={renderLeaf}
        readOnly={readonly === undefined ? true : readonly}
        onCompositionStart={(event) => {
          if (onComposition) {
            onComposition(event as unknown as CompositionEvent);
          }
        }}
        onCompositionUpdate={(event) => {
          if (onComposition) {
            onComposition(event as unknown as CompositionEvent);
          }
        }}
        onCompositionEnd={(event) => {
          if (onComposition) {
            onComposition(event as unknown as CompositionEvent);
          }
        }}
        onKeyDown={onKeyDown}
      />
    </Slate>
  );
};

const Element = (props: RenderElementProps) => {
  const { attributes, children, element } = props as RenderElementPropsFor<
    CustomElement & { type: string }
  >;
  switch (element.type) {
    case 'link':
      return (
        <LinkComponent {...(props as RenderElementPropsFor<LinkElement>)} />
      );
    default:
      return (
        <ParagraphComponent
          {...(props as RenderElementPropsFor<ParagraphElement>)}
        />
      );
  }
};

const ParagraphComponent = ({
  attributes,
  children,
  element,
}: RenderElementPropsFor<ParagraphElement>) => {
  const style = { textAlign: element.align } as CSSProperties;
  return (
    <div style={style} {...attributes}>
      {children}
    </div>
  );
};

const Leaf: React.FC<RenderLeafProps> = ({ children, leaf, attributes }) => {
  if ((leaf as CustomText).bold) {
    children = <strong>{children}</strong>;
  }

  if ((leaf as CustomText).code) {
    children = <code>{children}</code>;
  }

  if ((leaf as CustomText).italic) {
    children = <em>{children}</em>;
  }

  // 下划线和删除线统一通过 CSS 实现，以支持自定义样式和颜色
  // 不再使用 <u> 和 <s> 标签，避免 DOM 结构变化导致的渲染问题

  // 上标支持
  if ((leaf as any).superscript) {
    children = <sup>{children}</sup>;
  }

  // 下标支持
  if ((leaf as any).subscript) {
    children = <sub>{children}</sub>;
  }

  const customText = leaf as CustomText;
  const fontSize = customText['font-size'];

  // 扩展的自定义样式
  const fontFamily = (leaf as any)['font-family'];
  const fontWeight = (leaf as any)['font-weight'];
  const textShadow = (leaf as any)['text-shadow'];
  const textGradient = (leaf as any)['text-gradient'];
  const lineHeight = (leaf as any)['line-height'];
  const letterSpacing = (leaf as any)['letter-spacing'];
  const backgroundColor = (leaf as any)['background-color'];
  const textTransform = (leaf as any)['text-transform'];
  const textStroke = (leaf as any)['text-stroke'];
  const textStrokeColor = (leaf as any)['text-stroke-color'];
  const textDecorationStyle = (leaf as any)['text-decoration-style'];
  const textDecorationColor = (leaf as any)['text-decoration-color'];

  const style: CSSProperties = {
    color: customText.color,
    fontSize: fontSize ? `${fontSize}px` : undefined,
    // 自定义文本效果样式
    fontFamily: fontFamily || undefined,
    fontWeight: fontWeight || undefined,
    textShadow: textShadow || undefined,
    lineHeight: lineHeight || undefined,
    letterSpacing: letterSpacing || undefined,
    // 新增样式
    backgroundColor: backgroundColor || undefined,
    textTransform: textTransform || undefined,
  };

  // 文字描边
  if (textStroke) {
    (style as any).WebkitTextStroke = `${textStroke}px ${textStrokeColor || '#000000'}`;
  }

  // 下划线/删除线 - 统一使用 CSS 实现
  const isUnderlined = (leaf as CustomText).underlined;
  const isStrikethrough = (leaf as any).strikethrough;
  
  if (isUnderlined || isStrikethrough) {
    const decorations: string[] = [];
    if (isUnderlined) decorations.push('underline');
    if (isStrikethrough) decorations.push('line-through');
    
    style.textDecoration = decorations.join(' ');
    if (textDecorationStyle) {
      style.textDecorationStyle = textDecorationStyle as any;
    }
    if (textDecorationColor) {
      style.textDecorationColor = textDecorationColor;
    }
  }

  // 如果有文字渐变，设置渐变相关样式
  if (textGradient) {
    style.backgroundImage = textGradient;
    style.backgroundClip = 'text';
    style.WebkitBackgroundClip = 'text';
    style.WebkitTextFillColor = 'transparent';
    // 清除可能冲突的 color
    style.color = undefined;
  }

  return (
    <span style={style} {...attributes}>
      {children}
    </span>
  );
};
