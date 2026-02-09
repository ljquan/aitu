import {
  BoardTransforms,
  PlaitBoard,
  PlaitPointerType,
  getSelectedElements,
} from '@plait/core';
import { BoardCreationMode, setCreationMode } from '@plait/common';
import { MindPointerType } from '@plait/mind';
import { ArrowLineShape, BasicShapes } from '@plait/draw';
import { FreehandShape } from '../../plugins/freehand/type';
import { LassoPointerType } from '../../plugins/with-lasso-selection';
import { PenShape } from '../../plugins/pen/type';
import { saveAsImage } from '../../utils/image';
import { saveAsJSON } from '../../data/json';
import { AlignmentTransforms } from '../../transforms/alignment';
import { DistributeTransforms } from '../../transforms/distribute';
import { BooleanTransforms } from '../../transforms/boolean';
import { CommandItem } from './command-palette.types';
import { Language } from '../../i18n';
import { FramePointerType } from '../../plugins/with-frame';
import { fitFrame } from '../../utils/fit-frame';

export type CommandRegistryUpdater = (appState: Record<string, any>) => void;

export type CommandDialogOpener = (type: string, data?: any) => void;

export function buildDefaultCommands(
  language: Language,
  updateAppState: CommandRegistryUpdater,
  openDialog: CommandDialogOpener,
): CommandItem[] {
  const isZh = language === 'zh';

  const toolCommands: CommandItem[] = [
    {
      id: 'tool-hand',
      label: isZh ? '手形工具' : 'Hand Tool',
      keywords: ['hand', 'pan', 'grab', '手形', '抓手', '移动'],
      category: 'tool',
      shortcut: 'H',
      perform: (board) => {
        BoardTransforms.updatePointerType(board, PlaitPointerType.hand);
        updateAppState({ pointer: PlaitPointerType.hand });
      },
    },
    {
      id: 'tool-selection',
      label: isZh ? '选择工具' : 'Selection Tool',
      keywords: ['select', 'pointer', 'cursor', '选择', '指针'],
      category: 'tool',
      shortcut: 'V',
      perform: (board) => {
        BoardTransforms.updatePointerType(board, PlaitPointerType.selection);
        updateAppState({ pointer: PlaitPointerType.selection });
      },
    },
    {
      id: 'tool-mind',
      label: isZh ? '思维导图' : 'Mind Map',
      keywords: ['mind', 'map', 'mindmap', '思维', '导图'],
      category: 'tool',
      shortcut: 'M',
      perform: (board) => {
        setCreationMode(board, BoardCreationMode.dnd);
        BoardTransforms.updatePointerType(board, MindPointerType.mind);
        updateAppState({ pointer: MindPointerType.mind });
      },
    },
    {
      id: 'tool-rectangle',
      label: isZh ? '矩形' : 'Rectangle',
      keywords: ['rectangle', 'rect', 'square', 'box', '矩形', '方形'],
      category: 'tool',
      shortcut: 'R',
      perform: (board) => {
        setCreationMode(board, BoardCreationMode.drawing);
        BoardTransforms.updatePointerType(board, BasicShapes.rectangle);
        updateAppState({ pointer: BasicShapes.rectangle });
      },
    },
    {
      id: 'tool-ellipse',
      label: isZh ? '椭圆' : 'Ellipse',
      keywords: ['ellipse', 'circle', 'oval', '椭圆', '圆形'],
      category: 'tool',
      shortcut: 'O',
      perform: (board) => {
        setCreationMode(board, BoardCreationMode.drawing);
        BoardTransforms.updatePointerType(board, BasicShapes.ellipse);
        updateAppState({ pointer: BasicShapes.ellipse });
      },
    },
    {
      id: 'tool-text',
      label: isZh ? '文本' : 'Text',
      keywords: ['text', 'type', 'write', '文本', '文字'],
      category: 'tool',
      shortcut: 'T',
      perform: (board) => {
        setCreationMode(board, BoardCreationMode.dnd);
        BoardTransforms.updatePointerType(board, BasicShapes.text);
        updateAppState({ pointer: BasicShapes.text });
      },
    },
    {
      id: 'tool-arrow',
      label: isZh ? '箭头线' : 'Arrow Line',
      keywords: ['arrow', 'line', 'connector', '箭头', '线条', '连接'],
      category: 'tool',
      shortcut: 'A',
      perform: (board) => {
        setCreationMode(board, BoardCreationMode.drawing);
        BoardTransforms.updatePointerType(board, ArrowLineShape.straight);
        updateAppState({ pointer: ArrowLineShape.straight });
      },
    },
    {
      id: 'tool-freehand',
      label: isZh ? '手绘画笔' : 'Freehand Pen',
      keywords: ['freehand', 'draw', 'pen', 'brush', '手绘', '画笔'],
      category: 'tool',
      shortcut: 'P',
      perform: (board) => {
        setCreationMode(board, BoardCreationMode.drawing);
        BoardTransforms.updatePointerType(board, FreehandShape.feltTipPen);
        updateAppState({ pointer: FreehandShape.feltTipPen });
      },
    },
    {
      id: 'tool-vector-pen',
      label: isZh ? '矢量钢笔' : 'Vector Pen',
      keywords: ['vector', 'pen', 'bezier', 'path', '钢笔', '矢量', '路径'],
      category: 'tool',
      shortcut: '⇧P',
      perform: (board) => {
        setCreationMode(board, BoardCreationMode.drawing);
        BoardTransforms.updatePointerType(board, PenShape.pen);
        updateAppState({ pointer: PenShape.pen });
      },
    },
    {
      id: 'tool-eraser',
      label: isZh ? '橡皮擦' : 'Eraser',
      keywords: ['eraser', 'erase', 'delete', '橡皮', '擦除'],
      category: 'tool',
      shortcut: 'E',
      perform: (board) => {
        setCreationMode(board, BoardCreationMode.drawing);
        BoardTransforms.updatePointerType(board, FreehandShape.eraser);
        updateAppState({ pointer: FreehandShape.eraser });
      },
    },
    {
      id: 'tool-laser-pointer',
      label: isZh ? '激光笔' : 'Laser Pointer',
      keywords: ['laser', 'pointer', 'present', '激光', '演示'],
      category: 'tool',
      shortcut: 'L',
      perform: (board) => {
        setCreationMode(board, BoardCreationMode.drawing);
        BoardTransforms.updatePointerType(board, FreehandShape.laserPointer);
        updateAppState({ pointer: FreehandShape.laserPointer });
      },
    },
    {
      id: 'tool-frame',
      label: isZh ? 'Frame 容器' : 'Frame Container',
      keywords: ['frame', 'container', 'group', 'section', '容器', '分区', '框架'],
      category: 'tool',
      shortcut: 'F',
      perform: (board) => {
        setCreationMode(board, BoardCreationMode.drawing);
        BoardTransforms.updatePointerType(board, FramePointerType);
        updateAppState({ pointer: FramePointerType });
      },
    },
    {
      id: 'tool-lasso',
      label: isZh ? '套索选择' : 'Lasso Select',
      keywords: ['lasso', 'select', 'freeform', '套索', '自由选择'],
      category: 'tool',
      shortcut: 'Q',
      perform: (board) => {
        BoardTransforms.updatePointerType(board, LassoPointerType);
        updateAppState({ pointer: LassoPointerType });
      },
    },
  ];

  const editCommands: CommandItem[] = [
    {
      id: 'edit-undo',
      label: isZh ? '撤销' : 'Undo',
      keywords: ['undo', '撤销', '回退'],
      category: 'edit',
      shortcut: '⌘Z',
      perform: (board) => board.undo(),
    },
    {
      id: 'edit-redo',
      label: isZh ? '重做' : 'Redo',
      keywords: ['redo', '重做'],
      category: 'edit',
      shortcut: '⇧⌘Z',
      perform: (board) => board.redo(),
    },
    {
      id: 'edit-align-left',
      label: isZh ? '左对齐' : 'Align Left',
      keywords: ['align', 'left', '左对齐'],
      category: 'edit',
      shortcut: '⌥A',
      predicate: (board) => getSelectedElements(board).length > 1,
      perform: (board) => AlignmentTransforms.alignLeft(board),
    },
    {
      id: 'edit-align-center',
      label: isZh ? '水平居中对齐' : 'Align Center',
      keywords: ['align', 'center', 'horizontal', '水平', '居中'],
      category: 'edit',
      shortcut: '⌥H',
      predicate: (board) => getSelectedElements(board).length > 1,
      perform: (board) => AlignmentTransforms.alignCenter(board),
    },
    {
      id: 'edit-align-right',
      label: isZh ? '右对齐' : 'Align Right',
      keywords: ['align', 'right', '右对齐'],
      category: 'edit',
      shortcut: '⌥D',
      predicate: (board) => getSelectedElements(board).length > 1,
      perform: (board) => AlignmentTransforms.alignRight(board),
    },
    {
      id: 'edit-align-top',
      label: isZh ? '顶部对齐' : 'Align Top',
      keywords: ['align', 'top', '顶部'],
      category: 'edit',
      shortcut: '⌥W',
      predicate: (board) => getSelectedElements(board).length > 1,
      perform: (board) => AlignmentTransforms.alignTop(board),
    },
    {
      id: 'edit-align-middle',
      label: isZh ? '垂直居中对齐' : 'Align Middle',
      keywords: ['align', 'middle', 'vertical', '垂直', '居中'],
      category: 'edit',
      shortcut: '⌥V',
      predicate: (board) => getSelectedElements(board).length > 1,
      perform: (board) => AlignmentTransforms.alignMiddle(board),
    },
    {
      id: 'edit-align-bottom',
      label: isZh ? '底部对齐' : 'Align Bottom',
      keywords: ['align', 'bottom', '底部'],
      category: 'edit',
      shortcut: '⌥S',
      predicate: (board) => getSelectedElements(board).length > 1,
      perform: (board) => AlignmentTransforms.alignBottom(board),
    },
    {
      id: 'edit-distribute-horizontal',
      label: isZh ? '水平等距分布' : 'Distribute Horizontally',
      keywords: ['distribute', 'horizontal', 'space', '水平', '分布', '等距'],
      category: 'edit',
      shortcut: '⇧H',
      predicate: (board) => getSelectedElements(board).length > 1,
      perform: (board) => DistributeTransforms.distributeHorizontal(board),
    },
    {
      id: 'edit-distribute-vertical',
      label: isZh ? '垂直等距分布' : 'Distribute Vertically',
      keywords: ['distribute', 'vertical', 'space', '垂直', '分布', '等距'],
      category: 'edit',
      shortcut: '⇧V',
      predicate: (board) => getSelectedElements(board).length > 1,
      perform: (board) => DistributeTransforms.distributeVertical(board),
    },
    {
      id: 'edit-auto-arrange',
      label: isZh ? '自动排列' : 'Auto Arrange',
      keywords: ['auto', 'arrange', 'layout', '自动', '排列'],
      category: 'edit',
      shortcut: '⇧A',
      predicate: (board) => getSelectedElements(board).length > 1,
      perform: (board) => DistributeTransforms.autoArrange(board),
    },
    {
      id: 'edit-boolean-union',
      label: isZh ? '布尔合并' : 'Boolean Union',
      keywords: ['boolean', 'union', 'merge', '布尔', '合并'],
      category: 'edit',
      shortcut: '⌥⇧U',
      predicate: (board) => getSelectedElements(board).length > 1,
      perform: (board) => BooleanTransforms.union(board, 'zh'),
    },
  ];

  const utilCommands: CommandItem[] = [
    {
      id: 'util-canvas-search',
      label: isZh ? '搜索画布内容' : 'Search Canvas',
      keywords: ['search', 'find', 'text', '搜索', '查找', '文本'],
      category: 'view',
      shortcut: '⌘F',
      perform: () => updateAppState({ openCanvasSearch: true }),
    },
  ];

  const viewCommands: CommandItem[] = [
    {
      id: 'view-zoom-in',
      label: isZh ? '放大' : 'Zoom In',
      keywords: ['zoom', 'in', 'enlarge', '放大'],
      category: 'view',
      shortcut: '⌘+',
      perform: (board) => {
        const currentZoom = board.viewport?.zoom ?? 1;
        BoardTransforms.updateZoom(board, Math.min(currentZoom + 0.1, 4));
      },
    },
    {
      id: 'view-zoom-out',
      label: isZh ? '缩小' : 'Zoom Out',
      keywords: ['zoom', 'out', 'shrink', '缩小'],
      category: 'view',
      shortcut: '⌘-',
      perform: (board) => {
        const currentZoom = board.viewport?.zoom ?? 1;
        BoardTransforms.updateZoom(board, Math.max(currentZoom - 0.1, 0.1));
      },
    },
    {
      id: 'view-zoom-fit',
      label: isZh ? '自适应视口' : 'Fit to Viewport',
      keywords: ['fit', 'viewport', 'auto', '自适应', '视口', '适应'],
      category: 'view',
      perform: (board) => BoardTransforms.fitViewport(board),
    },
    {
      id: 'view-zoom-fit-frame',
      label: isZh ? '自适应 Frame' : 'Fit Frame',
      keywords: ['fit', 'frame', '自适应', '幻灯片', 'ppt', 'slide'],
      category: 'view',
      perform: (board) => fitFrame(board),
    },
    {
      id: 'view-zoom-100',
      label: isZh ? '缩放至 100%' : 'Zoom to 100%',
      keywords: ['zoom', '100', 'reset', '重置', '100%'],
      category: 'view',
      perform: (board) => BoardTransforms.updateZoom(board, 1),
    },
  ];

  const exportCommands: CommandItem[] = [
    {
      id: 'export-image',
      label: isZh ? '导出为图片' : 'Export as Image',
      keywords: ['export', 'image', 'png', 'screenshot', '导出', '图片', '截图'],
      category: 'export',
      shortcut: '⇧⌘E',
      perform: (board) => saveAsImage(board, true),
    },
    {
      id: 'export-json',
      label: isZh ? '保存为 JSON' : 'Save as JSON',
      keywords: ['save', 'json', 'file', '保存', 'JSON'],
      category: 'export',
      shortcut: '⌘S',
      perform: (board) => saveAsJSON(board),
    },
  ];

  const settingsCommands: CommandItem[] = [
    {
      id: 'settings-open',
      label: isZh ? '打开设置' : 'Open Settings',
      keywords: ['settings', 'config', 'preference', '设置', '配置'],
      category: 'settings',
      perform: () => updateAppState({ openSettings: true }),
    },
    {
      id: 'settings-clean',
      label: isZh ? '清除画布' : 'Clear Canvas',
      keywords: ['clean', 'clear', 'reset', '清除', '清空', '画布'],
      category: 'settings',
      shortcut: '⌘⌫',
      perform: () => updateAppState({ openCleanConfirm: true }),
    },
  ];

  const aiCommands: CommandItem[] = [
    {
      id: 'ai-mermaid',
      label: isZh ? 'Mermaid 转流程图' : 'Mermaid to Flowchart',
      keywords: ['mermaid', 'flowchart', 'diagram', '流程图', '序列图'],
      category: 'ai',
      perform: () => openDialog('mermaidToDrawnix'),
    },
    {
      id: 'ai-markdown',
      label: isZh ? 'Markdown 转思维导图' : 'Markdown to Mind Map',
      keywords: ['markdown', 'mindmap', '思维导图'],
      category: 'ai',
      perform: () => openDialog('markdownToDrawnix'),
    },
  ];

  return [
    ...toolCommands,
    ...utilCommands,
    ...editCommands,
    ...viewCommands,
    ...exportCommands,
    ...settingsCommands,
    ...aiCommands,
  ];
}
