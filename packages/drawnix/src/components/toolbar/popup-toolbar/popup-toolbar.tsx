import Stack from '../../stack';
import { FontColorIcon } from '../../icons';
import {
  ATTACHED_ELEMENT_CLASS_NAME,
  getRectangleByElements,
  getSelectedElements,
  isDragging,
  isMovingElements,
  isSelectionMoving,
  PlaitBoard,
  PlaitElement,
  RectangleClient,
  toHostPointFromViewBoxPoint,
  toScreenPointFromHostPoint,
  duplicateElements,
  deleteFragment,
} from '@plait/core';
import { useEffect, useRef, useState } from 'react';
import { useBoard } from '@plait-board/react-board';
import { flip, offset, shift, useFloating } from '@floating-ui/react';
import { Island } from '../../island';
import classNames from 'classnames';
import {
  getStrokeColorByElement as getStrokeColorByMindElement,
  MindElement,
} from '@plait/mind';
import './popup-toolbar.scss';
import {
  getStrokeColorByElement as getStrokeColorByDrawElement,
  isClosedCustomGeometry,
  isClosedDrawElement,
  isDrawElementsIncludeText,
  PlaitDrawElement,
} from '@plait/draw';
import { CustomText } from '@plait/common';
import { getTextMarksByElement } from '@plait/text-plugins';
import { PopupFontColorButton } from './font-color-button';
import { PopupFontSizeButton } from './font-size-button';
import { PopupStrokeButton } from './stroke-button';
import { PopupFillButton } from './fill-button';
import { isWhite, removeHexAlpha } from '../../../utils/color';
import { NO_COLOR } from '../../../constants/color';
import { Freehand } from '../../../plugins/freehand/type';
import { PopupLinkButton } from './link-button';
import { AIImageIcon, AIVideoIcon, VideoFrameIcon, DuplicateIcon, TrashIcon } from '../../icons';
import { useDrawnix, DialogType } from '../../../hooks/use-drawnix';
import { useI18n } from '../../../i18n';
import { ToolButton } from '../../tool-button';
import { useGlobalMousePosition } from '../../../hooks/use-global-mouse-position';
import { isVideoElement } from '../../../plugins/with-video';
import { VideoFrameSelector } from '../../video-frame-selector/video-frame-selector';
import { insertVideoFrame } from '../../../utils/video-frame';
import { isToolElement } from '../../../plugins/with-tool';

export const PopupToolbar = () => {
  const board = useBoard();
  const selectedElements = getSelectedElements(board);
  const { openDialog } = useDrawnix();
  const { language, t } = useI18n();
  const [movingOrDragging, setMovingOrDragging] = useState(false);
  const movingOrDraggingRef = useRef(movingOrDragging);
  
  // 视频帧选择弹窗状态
  const [showVideoFrameSelector, setShowVideoFrameSelector] = useState(false);
  const [selectedVideoElement, setSelectedVideoElement] = useState<PlaitElement | null>(null);

  // 初始化全局鼠标位置跟踪
  useGlobalMousePosition();
  const open =
    selectedElements.length > 0 &&
    !isSelectionMoving(board);
  const { viewport, selection, children } = board;
  const { refs, floatingStyles } = useFloating({
    placement: 'top',
    middleware: [
      offset(12), // Close to reference point
      shift({ padding: 16 }), // Ensure it stays within screen bounds
      flip({ fallbackPlacements: ['bottom', 'right', 'left'] }), // Smart fallback positioning
    ],
  });
  let state: {
    fill: string | undefined;
    strokeColor?: string;
    hasFill?: boolean;
    hasText?: boolean;
    fontColor?: string;
    fontSize?: string;
    hasFontColor?: boolean;
    hasFontSize?: boolean;
    hasStroke?: boolean;
    hasStrokeStyle?: boolean;
    marks?: Omit<CustomText, 'text'>;
    hasAIImage?: boolean; // 是否显示AI图像生成按钮
    hasAIVideo?: boolean; // 是否显示AI视频生成按钮
    hasVideoFrame?: boolean; // 是否显示视频帧选择按钮
  } = {
    fill: 'red',
  };
  if (open && !movingOrDragging) {
    const hasFill =
      selectedElements.some((value) => hasFillProperty(board, value)) &&
      !PlaitBoard.hasBeenTextEditing(board);
    const hasText = selectedElements.some((value) =>
      hasTextProperty(board, value)
    );
    const hasStroke =
      selectedElements.some((value) => hasStrokeProperty(board, value)) &&
      !PlaitBoard.hasBeenTextEditing(board);
    const hasStrokeStyle =
      selectedElements.some((value) => hasStrokeStyleProperty(board, value)) &&
      !PlaitBoard.hasBeenTextEditing(board);
    // 检查是否选中了视频元素
    const hasVideoSelected = selectedElements.some(element => isVideoElement(element));

    // 检查是否选中了工具元素(内嵌网页)
    const hasToolSelected = selectedElements.some(element => isToolElement(element));

    // 检查是否选中了包含图片的元素（单个或多个），但排除视频元素
    const hasAIVideo =
      selectedElements.length > 0 &&
      !hasVideoSelected &&
      !hasToolSelected &&
      selectedElements.some(element =>
        PlaitDrawElement.isDrawElement(element) &&
        PlaitDrawElement.isImage(element)
      ) &&
      !PlaitBoard.hasBeenTextEditing(board);

    // 检查是否只选中了一个视频元素
    const hasVideoFrame =
      selectedElements.length === 1 &&
      isVideoElement(selectedElements[0]) &&
      !PlaitBoard.hasBeenTextEditing(board);

    // AI图像生成按钮：排除视频元素和工具元素(内嵌网页)
    const hasAIImage = !hasVideoSelected && !hasToolSelected && !PlaitBoard.hasBeenTextEditing(board);
    
    state = {
      ...getElementState(board),
      hasFill,
      hasFontColor: hasText,
      hasFontSize: hasText,
      hasStroke,
      hasStrokeStyle,
      hasText,
      hasAIImage,
      hasAIVideo,
      hasVideoFrame,
    };
  }
  useEffect(() => {
    if (open) {
      const hasSelected = selectedElements.length > 0;
      if (!movingOrDragging && hasSelected) {
        let referenceX, referenceY;
        
        // 计算选中元素包围盒的顶部边缘中点（与 Figma/Excalidraw 等主流工具一致）
        const elements = getSelectedElements(board);
        const rectangle = getRectangleByElements(board, elements, false);
        const [start, end] = RectangleClient.getPoints(rectangle);
        const screenStart = toScreenPointFromHostPoint(
          board,
          toHostPointFromViewBoxPoint(board, start)
        );
        const screenEnd = toScreenPointFromHostPoint(
          board,
          toHostPointFromViewBoxPoint(board, end)
        );

        // 参考点：顶部边缘的水平中点
        referenceX = screenStart[0] + (screenEnd[0] - screenStart[0]) / 2;
        referenceY = screenStart[1]; // 使用顶部 Y 坐标，而非中心

        refs.setPositionReference({
          getBoundingClientRect() {
            return {
              width: 1,
              height: 1,
              x: referenceX,
              y: referenceY,
              top: referenceY,
              left: referenceX,
              right: referenceX + 1,
              bottom: referenceY + 1,
            };
          },
        });
      }
    }
  }, [viewport, selection, children, movingOrDragging]);

  useEffect(() => {
    movingOrDraggingRef.current = movingOrDragging;
  }, [movingOrDragging]);

  useEffect(() => {
    const { pointerUp, pointerMove } = board;

    board.pointerMove = (event: PointerEvent) => {
      if (
        (isMovingElements(board) || isDragging(board)) &&
        !movingOrDraggingRef.current
      ) {
        setMovingOrDragging(true);
      }
      pointerMove(event);
    };

    board.pointerUp = (event: PointerEvent) => {
      if (
        movingOrDraggingRef.current &&
        (isMovingElements(board) || isDragging(board))
      ) {
        setMovingOrDragging(false);
      }
      pointerUp(event);
    };

    return () => {
      board.pointerUp = pointerUp;
      board.pointerMove = pointerMove;
    };
  }, [board]);

  return (
    <>
      {open && !movingOrDragging && (
        <Island
          padding={1}
          className={classNames('popup-toolbar', ATTACHED_ELEMENT_CLASS_NAME)}
          ref={refs.setFloating}
          style={floatingStyles}
        >
          <Stack.Row gap={1}>
            {state.hasFontColor && (
              <PopupFontColorButton
                board={board}
                key={0}
                currentColor={state.marks?.color}
                title={`Font Color`}
                fontColorIcon={
                  <FontColorIcon currentColor={state.marks?.color} />
                }
              ></PopupFontColorButton>
            )}
            {state.hasFontSize && (
              <PopupFontSizeButton
                board={board}
                key={1}
                currentFontSize={state.fontSize}
                title={`Font Size`}
              ></PopupFontSizeButton>
            )}
            {state.hasStroke && (
              <PopupStrokeButton
                board={board}
                key={2}
                currentColor={state.strokeColor}
                title={`Stroke`}
                hasStrokeStyle={state.hasStrokeStyle || false}
              >
                <label
                  className={classNames('stroke-label', 'color-label')}
                  style={{ borderColor: state.strokeColor }}
                ></label>
              </PopupStrokeButton>
            )}
            {state.hasFill && (
              <PopupFillButton
                board={board}
                key={3}
                currentColor={state.fill}
                title={`Fill Color`}
              >
                <label
                  className={classNames('fill-label', 'color-label', {
                    'color-white':
                      state.fill && isWhite(removeHexAlpha(state.fill)),
                  })}
                  style={{ backgroundColor: state.fill }}
                ></label>
              </PopupFillButton>
            )}
            {state.hasText && (
              <PopupLinkButton
                board={board}
                key={4}
                title={`Link`}
              ></PopupLinkButton>
            )}
            {state.hasAIImage && (
              <ToolButton
                className="ai-image"
                key={5}
                type="icon"
                icon={AIImageIcon}
                visible={true}
                title={language === 'zh' ? 'AI图像生成' : 'AI Image Generation'}
                aria-label={language === 'zh' ? 'AI图像生成' : 'AI Image Generation'}
                onPointerUp={() => {
                  openDialog(DialogType.aiImageGeneration);
                }}
              />
            )}
            {state.hasAIVideo && (
              <ToolButton
                className="ai-video"
                key={6}
                type="icon"
                icon={AIVideoIcon}
                visible={true}
                title={language === 'zh' ? 'AI视频生成' : 'AI Video Generation'}
                aria-label={language === 'zh' ? 'AI视频生成' : 'AI Video Generation'}
                onPointerUp={() => {
                  openDialog(DialogType.aiVideoGeneration);
                }}
              />
            )}
            {state.hasVideoFrame && (
              <ToolButton
                className="video-frame"
                key={7}
                type="icon"
                icon={VideoFrameIcon}
                visible={true}
                title={language === 'zh' ? '视频帧选择' : 'Video Frame Selection'}
                aria-label={language === 'zh' ? '视频帧选择' : 'Video Frame Selection'}
                onPointerUp={() => {
                  // 找到选中的视频元素
                  const videoElement = selectedElements.find(element => isVideoElement(element));
                  if (videoElement) {
                    setSelectedVideoElement(videoElement);
                    setShowVideoFrameSelector(true);
                  }
                }}
              />
            )}
            <ToolButton
              className="duplicate"
              key={8}
              type="icon"
              icon={DuplicateIcon}
              visible={true}
              title={t('general.duplicate')}
              aria-label={t('general.duplicate')}
              onPointerUp={() => {
                duplicateElements(board);
              }}
            />
            <ToolButton
              className="trash"
              key={9}
              type="icon"
              icon={TrashIcon}
              visible={true}
              title={t('general.delete')}
              aria-label={t('general.delete')}
              onPointerUp={() => {
                deleteFragment(board);
              }}
            />
          </Stack.Row>
        </Island>
      )}
      
      {/* 视频帧选择弹窗 */}
      {showVideoFrameSelector && selectedVideoElement && (
        <VideoFrameSelector
          visible={showVideoFrameSelector}
          videoUrl={(selectedVideoElement as any).url || ''}
          onClose={() => {
            setShowVideoFrameSelector(false);
            setSelectedVideoElement(null);
          }}
          onConfirm={async (frameImageDataUrl: string, timestamp: number) => {
            try {
              if (selectedVideoElement) {
                await insertVideoFrame(board, selectedVideoElement, frameImageDataUrl, timestamp);
              }
            } catch (error) {
              console.error('Failed to insert video frame:', error);
              // 可以在这里添加错误提示
            }
          }}
        />
      )}
    </>
  );
};

export const getMindElementState = (
  board: PlaitBoard,
  element: MindElement
) => {
  const marks = getTextMarksByElement(element);
  return {
    fill: element.fill,
    strokeColor: getStrokeColorByMindElement(board, element),
    fontSize: marks['font-size'],
    marks,
  };
};

export const getDrawElementState = (
  board: PlaitBoard,
  element: PlaitDrawElement
) => {
  const marks: Omit<CustomText, 'text'> = getTextMarksByElement(element);
  return {
    fill: element.fill,
    strokeColor: getStrokeColorByDrawElement(board, element),
    fontSize: marks['font-size'],
    marks,
  };
};

export const getElementState = (board: PlaitBoard) => {
  const selectedElement = getSelectedElements(board)[0];
  if (MindElement.isMindElement(board, selectedElement)) {
    return getMindElementState(board, selectedElement);
  }
  return getDrawElementState(board, selectedElement as PlaitDrawElement);
};

export const hasFillProperty = (board: PlaitBoard, element: PlaitElement) => {
  if (MindElement.isMindElement(board, element)) {
    return true;
  }
  if (isClosedCustomGeometry(board, element)) {
    return true;
  }
  if (PlaitDrawElement.isDrawElement(element)) {
    return (
      PlaitDrawElement.isShapeElement(element) &&
      !PlaitDrawElement.isImage(element) &&
      !PlaitDrawElement.isText(element) &&
      isClosedDrawElement(element)
    );
  }
  return false;
};

export const hasStrokeProperty = (board: PlaitBoard, element: PlaitElement) => {
  if (MindElement.isMindElement(board, element)) {
    return true;
  }
  if (Freehand.isFreehand(element)) {
    return true;
  }
  if (PlaitDrawElement.isDrawElement(element)) {
    return (
      (PlaitDrawElement.isShapeElement(element) &&
        !PlaitDrawElement.isImage(element) &&
        !PlaitDrawElement.isText(element)) ||
      PlaitDrawElement.isArrowLine(element) ||
      PlaitDrawElement.isVectorLine(element) ||
      PlaitDrawElement.isTable(element)
    );
  }
  return false;
};

export const hasStrokeStyleProperty = (
  board: PlaitBoard,
  element: PlaitElement
) => {
  return hasStrokeProperty(board, element);
};

export const hasTextProperty = (board: PlaitBoard, element: PlaitElement) => {
  if (MindElement.isMindElement(board, element)) {
    return true;
  }
  if (PlaitDrawElement.isDrawElement(element)) {
    return isDrawElementsIncludeText([element]);
  }
  return false;
};

export const getColorPropertyValue = (color: string) => {
  if (color === NO_COLOR) {
    return null;
  } else {
    return color;
  }
};
