import { BaseEditor, BaseRange, Range, Element } from 'slate';
import { ReactEditor, RenderElementProps } from 'slate-react';
import { HistoryEditor } from 'slate-history';
import { CustomElement, CustomText as PlaitCustomText } from '@plait/common';

// 扩展 CustomText 类型，添加缺失的文本属性
export interface ExtendedCustomText extends PlaitCustomText {
  'font-family'?: string;
  'font-weight'?: string;
  'text-shadow'?: string;
  'text-gradient'?: string;
  'line-height'?: string;
  'letter-spacing'?: string;
}

export type CustomEditor = BaseEditor &
  ReactEditor &
  HistoryEditor & {
    nodeToDecorations?: Map<Element, Range[]>;
  };

export type RenderElementPropsFor<T> = RenderElementProps & {
  element: T;
};

declare module 'slate' {
  interface CustomTypes {
    Editor: CustomEditor;
    Element: CustomElement;
    Text: ExtendedCustomText;
    Range: BaseRange & {
      [key: string]: unknown;
    };
  }
}
