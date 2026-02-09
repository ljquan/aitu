import React, { useState, useCallback } from 'react';
import { ToolButton } from '../../tool-button';
import classNames from 'classnames';
import { Island } from '../../island';
import { ATTACHED_ELEMENT_CLASS_NAME, PlaitBoard } from '@plait/core';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import { FontSizes, TextTransforms } from '@plait/text-plugins';
import { setTextFontSize, setTextFontWeight } from '../../../transforms/property';
import Stack from '../../stack';
import { PPT_FONT_STYLES, type FontStyleLevel } from '../../../services/ppt';
import { useI18n } from '../../../i18n';

export type PopupFontSizeButtonProps = {
  board: PlaitBoard;
  currentFontSize: string | undefined;
  title: string;
};

/** 字体样式预设 */
interface FontStylePreset {
  key: FontStyleLevel;
  labelZh: string;
  labelEn: string;
  fontSize: number;
  fontWeight: string;
  color: string;
  /** 下拉面板中预览用的字号（避免大标题撑爆面板） */
  previewSize: number;
  divider?: boolean;
}

const fontStylePresets: FontStylePreset[] = [
  { key: 'title',    labelZh: '标题',    labelEn: 'Title',       previewSize: 26, ...PPT_FONT_STYLES.title },
  { key: 'subtitle', labelZh: '副标题',  labelEn: 'Subtitle',    previewSize: 22, ...PPT_FONT_STYLES.subtitle },
  { key: 'h1',       labelZh: '标题 1',  labelEn: 'Heading 1',   previewSize: 20, ...PPT_FONT_STYLES.h1, divider: true },
  { key: 'h2',       labelZh: '标题 2',  labelEn: 'Heading 2',   previewSize: 18, ...PPT_FONT_STYLES.h2 },
  { key: 'h3',       labelZh: '标题 3',  labelEn: 'Heading 3',   previewSize: 16, ...PPT_FONT_STYLES.h3 },
  { key: 'h4',       labelZh: '标题 4',  labelEn: 'Heading 4',   previewSize: 15, ...PPT_FONT_STYLES.h4 },
  { key: 'body',     labelZh: '正文',    labelEn: 'Body',        previewSize: 14, ...PPT_FONT_STYLES.body, divider: true },
  { key: 'caption',  labelZh: '注释',    labelEn: 'Caption',     previewSize: 13, ...PPT_FONT_STYLES.caption },
  { key: 'footnote', labelZh: '脚注',    labelEn: 'Footnote',    previewSize: 12, ...PPT_FONT_STYLES.footnote },
];

/** 根据当前字号匹配最接近的样式 key */
const matchStyleKey = (fontSize: string | undefined): FontStyleLevel | null => {
  if (!fontSize) return null;
  const size = parseInt(fontSize, 10);
  if (isNaN(size)) return null;
  for (const preset of fontStylePresets) {
    if (preset.fontSize === size) return preset.key;
  }
  return null;
};

export const PopupFontSizeButton: React.FC<PopupFontSizeButtonProps> = ({
  board,
  currentFontSize,
  title,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const { language } = useI18n();
  const container = PlaitBoard.getBoardContainer(board);
  const activeKey = matchStyleKey(currentFontSize);

  const handleStyleClick = useCallback((preset: FontStylePreset) => {
    setTextFontSize(board, String(preset.fontSize) as FontSizes);
    setTextFontWeight(board, preset.fontWeight);
    TextTransforms.setTextColor(board, preset.color);
    setIsOpen(false);
  }, [board]);

  const displayLabel = (() => {
    if (activeKey) {
      const preset = fontStylePresets.find(p => p.key === activeKey);
      if (preset) return language === 'zh' ? preset.labelZh : preset.labelEn;
    }
    return currentFontSize || '16';
  })();

  return (
    <Popover
      sideOffset={12}
      open={isOpen}
      onOpenChange={setIsOpen}
      placement={'bottom'}
    >
      <PopoverTrigger asChild>
        <ToolButton
          className={classNames(`property-button`)}
          selected={isOpen}
          visible={true}
          type="button"
          title={title}
          aria-label={title}
          onPointerUp={() => setIsOpen(!isOpen)}
        >
          <div style={{ fontSize: '12px', fontWeight: 'bold', minWidth: '20px' }}>
            {displayLabel}
          </div>
        </ToolButton>
      </PopoverTrigger>
      <PopoverContent container={container}>
        <Island
          padding={4}
          className={classNames(`${ATTACHED_ELEMENT_CLASS_NAME}`)}
        >
          <Stack.Col gap={0} style={{ minWidth: '200px' }}>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '2px', padding: '4px 10px 0' }}>
              {language === 'zh' ? '字体样式' : 'Font Style'}
            </div>

            <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
              {fontStylePresets.map((preset) => {
                const isActive = activeKey === preset.key;
                return (
                  <React.Fragment key={preset.key}>
                    {preset.divider && (
                      <div style={{ height: '1px', backgroundColor: '#e8e8e8', margin: '4px 10px' }} />
                    )}
                    <div
                      onClick={() => handleStyleClick(preset)}
                      style={{
                        padding: '6px 10px',
                        cursor: 'pointer',
                        backgroundColor: isActive ? '#f0f7ff' : 'transparent',
                        borderLeft: isActive ? '3px solid #0052d9' : '3px solid transparent',
                        borderRadius: '2px',
                        transition: 'background-color 0.15s',
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        gap: '8px',
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = '#f5f5f5';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent';
                        }
                      }}
                    >
                      <span
                        style={{
                          fontSize: `${preset.previewSize}px`,
                          fontWeight: preset.fontWeight,
                          color: preset.color,
                          lineHeight: 1.4,
                        }}
                      >
                        {language === 'zh' ? preset.labelZh : preset.labelEn}
                      </span>
                      <span style={{ fontSize: '11px', color: '#bbb', flexShrink: 0 }}>
                        {preset.fontSize}px
                      </span>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </Stack.Col>
        </Island>
      </PopoverContent>
    </Popover>
  );
};