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
  toImage,
  addSelectedElement,
  clearSelectedElement,
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
  DrawTransforms,
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
import { PopupPromptButton } from './prompt-button';
import { AIImageIcon, AIVideoIcon, VideoFrameIcon, DuplicateIcon, TrashIcon, SplitImageIcon, DownloadIcon, MergeIcon, VideoMergeIcon } from '../../icons';
import { useDrawnix, DialogType } from '../../../hooks/use-drawnix';
import { useI18n } from '../../../i18n';
import { ToolButton } from '../../tool-button';
import { useGlobalMousePosition } from '../../../hooks/use-global-mouse-position';
import { isVideoElement } from '../../../plugins/with-video';
import { VideoFrameSelector } from '../../video-frame-selector/video-frame-selector';
import { insertVideoFrame } from '../../../utils/video-frame';
import { isToolElement } from '../../../plugins/with-tool';
import { splitAndInsertImages } from '../../../utils/image-splitter';
import { smartDownload, BatchDownloadItem } from '../../../utils/download-utils';
import { MessagePlugin } from 'tdesign-react';
import { mergeVideos } from '../../../services/video-merge-service';

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
    hasSplitImage?: boolean; // 是否显示拆图按钮
    hasDownloadable?: boolean; // 是否显示下载按钮
    hasMergeable?: boolean; // 是否显示合并按钮
    hasVideoMergeable?: boolean; // 是否显示视频合成按钮
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

    // 拆图按钮：只在选中单个图片元素且检测到分割线时显示
    // 排除SVG图片（SVG不能被智能拆分）
    const imageElement = selectedElements[0];
    const isSvgImage = PlaitDrawElement.isDrawElement(imageElement) &&
      PlaitDrawElement.isImage(imageElement) &&
      imageElement.url?.startsWith('data:image/svg+xml');

    const isImageSelected =
      selectedElements.length === 1 &&
      !hasVideoSelected &&
      !hasToolSelected &&
      PlaitDrawElement.isDrawElement(selectedElements[0]) &&
      PlaitDrawElement.isImage(selectedElements[0]) &&
      !isSvgImage && // 排除SVG图片
      !PlaitBoard.hasBeenTextEditing(board);

    // 只有检测到分割线时才显示拆图按钮
    const hasSplitImage = isImageSelected;

    // 下载按钮：选中图片或视频时显示
    const hasDownloadable =
      selectedElements.length > 0 &&
      !hasToolSelected &&
      selectedElements.some(element =>
        (PlaitDrawElement.isDrawElement(element) && PlaitDrawElement.isImage(element)) ||
        isVideoElement(element)
      ) &&
      !PlaitBoard.hasBeenTextEditing(board);

    // 合并按钮：选中多个元素，且只包含图片和文字（排除视频和工具元素）
    const hasMergeable =
      selectedElements.length > 1 &&
      !hasVideoSelected &&
      !hasToolSelected &&
      selectedElements.every(element =>
        (PlaitDrawElement.isDrawElement(element) && PlaitDrawElement.isImage(element)) ||
        (PlaitDrawElement.isDrawElement(element) && isDrawElementsIncludeText([element])) ||
        MindElement.isMindElement(board, element)
      ) &&
      !PlaitBoard.hasBeenTextEditing(board);

    // 视频合成按钮：选中多个视频元素（超过1个）
    const videoElements = selectedElements.filter(element => isVideoElement(element));
    const hasVideoMergeable =
      videoElements.length > 1 &&
      !PlaitBoard.hasBeenTextEditing(board);

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
      hasSplitImage,
      hasDownloadable,
      hasMergeable,
      hasVideoMergeable,
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
            {state.hasText && (
              <PopupPromptButton
                board={board}
                key={'prompt'}
                language={language as 'zh' | 'en'}
                title={language === 'zh' ? '提示词' : 'Prompts'}
              />
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
            {state.hasSplitImage && (
              <ToolButton
                className="split-image"
                key="split-image"
                type="icon"
                icon={SplitImageIcon}
                visible={true}
                title={language === 'zh' ? '智能拆图' : 'Smart Split'}
                aria-label={language === 'zh' ? '智能拆图' : 'Smart Split'}
                onPointerUp={async () => {
                  // 获取选中的图片元素
                  const imageElement = selectedElements[0] as PlaitDrawElement;
                  if (PlaitDrawElement.isImage(imageElement) && imageElement.url) {
                    const loadingInstance = MessagePlugin.loading(language === 'zh' ? '正在分析图片...' : 'Analyzing image...', 0);
                    try {
                      // 获取源图片的位置信息
                      const sourceRect = getRectangleByElements(board, [imageElement], false);
                      const result = await splitAndInsertImages(board, imageElement.url, {
                        sourceRect: {
                          x: sourceRect.x,
                          y: sourceRect.y,
                          width: sourceRect.width,
                          height: sourceRect.height,
                        },
                        scrollToResult: true,
                      });
                      MessagePlugin.close(loadingInstance);
                      if (result.success) {
                        MessagePlugin.success(
                          language === 'zh'
                            ? `成功拆分为 ${result.count} 张图片`
                            : `Split into ${result.count} images`
                        );
                      } else {
                        MessagePlugin.warning(result.error || (language === 'zh' ? '拆图失败' : 'Split failed'));
                      }
                    } catch (error: any) {
                      MessagePlugin.close(loadingInstance);
                      MessagePlugin.error(error.message || (language === 'zh' ? '拆图失败' : 'Split failed'));
                    }
                  }
                }}
              />
            )}
            {state.hasDownloadable && (
              <ToolButton
                className="download"
                key="download"
                type="icon"
                icon={DownloadIcon}
                visible={true}
                title={language === 'zh' ? '下载' : 'Download'}
                aria-label={language === 'zh' ? '下载' : 'Download'}
                onPointerUp={async () => {
                  // 收集可下载的元素
                  const downloadItems: BatchDownloadItem[] = [];
                  for (const element of selectedElements) {
                    if (PlaitDrawElement.isDrawElement(element) && PlaitDrawElement.isImage(element) && element.url) {
                      downloadItems.push({ url: element.url, type: 'image' });
                    } else if (isVideoElement(element) && (element as any).url) {
                      downloadItems.push({ url: (element as any).url, type: 'video' });
                    }
                  }

                  if (downloadItems.length === 0) {
                    MessagePlugin.warning(language === 'zh' ? '没有可下载的内容' : 'No downloadable content');
                    return;
                  }

                  const loadingMsg = downloadItems.length > 1
                    ? (language === 'zh' ? '正在打包下载...' : 'Packaging download...')
                    : (language === 'zh' ? '正在下载...' : 'Downloading...');

                  const loadingInstance = MessagePlugin.loading(loadingMsg, 0);
                  try {
                    await smartDownload(downloadItems);
                    MessagePlugin.close(loadingInstance);
                    MessagePlugin.success(
                      downloadItems.length > 1
                        ? (language === 'zh' ? `已下载 ${downloadItems.length} 个文件` : `Downloaded ${downloadItems.length} files`)
                        : (language === 'zh' ? '下载成功' : 'Download complete')
                    );
                  } catch (error: any) {
                    MessagePlugin.close(loadingInstance);
                    MessagePlugin.error(error.message || (language === 'zh' ? '下载失败' : 'Download failed'));
                  }
                }}
              />
            )}
            {state.hasMergeable && (
              <ToolButton
                className="merge"
                key="merge"
                type="icon"
                icon={MergeIcon}
                visible={true}
                title={language === 'zh' ? '合并为图片' : 'Merge to Image'}
                aria-label={language === 'zh' ? '合并为图片' : 'Merge to Image'}
                onPointerUp={async () => {
                  const loadingInstance = MessagePlugin.loading(language === 'zh' ? '正在合并...' : 'Merging...', 0);
                  try {
                    // 获取选中元素的边界矩形
                    const boundingRect = getRectangleByElements(board, selectedElements, false);

                    // 按照元素在画布中的顺序排序，保持层级
                    const sortedElements = [...selectedElements].sort((a, b) => {
                      const indexA = board.children.findIndex(child => child.id === a.id);
                      const indexB = board.children.findIndex(child => child.id === b.id);
                      return indexA - indexB;
                    });

                    // 使用 toImage 将选中元素转换为图片
                    const imageDataUrl = await toImage(board, {
                      elements: sortedElements,
                      fillStyle: 'transparent',
                      inlineStyleClassNames: '.extend,.emojis,.text',
                      ratio: 2, // 2x 清晰度
                    });

                    if (!imageDataUrl) {
                      throw new Error(language === 'zh' ? '合并失败：无法生成图片' : 'Merge failed: Unable to generate image');
                    }

                    // 创建图片获取实际尺寸
                    const img = new Image();
                    await new Promise<void>((resolve, reject) => {
                      img.onload = () => resolve();
                      img.onerror = () => reject(new Error('Failed to load merged image'));
                      img.src = imageDataUrl;
                    });

                    // 计算插入位置（原位置）
                    const insertX = boundingRect.x;
                    const insertY = boundingRect.y;

                    // 删除原元素
                    deleteFragment(board);

                    // 记录插入前的元素数量
                    const childrenCountBefore = board.children.length;

                    // 插入合并后的图片
                    const imageItem = {
                      url: imageDataUrl,
                      width: boundingRect.width,
                      height: boundingRect.height,
                    };
                    DrawTransforms.insertImage(board, imageItem, [insertX, insertY]);

                    // 选中新插入的图片元素
                    const newElement = board.children[childrenCountBefore];
                    if (newElement) {
                      clearSelectedElement(board);
                      addSelectedElement(board, newElement);
                    }

                    MessagePlugin.close(loadingInstance);
                    MessagePlugin.success(
                      language === 'zh'
                        ? `已将 ${selectedElements.length} 个元素合并为图片`
                        : `Merged ${selectedElements.length} elements into image`
                    );
                  } catch (error: any) {
                    MessagePlugin.close(loadingInstance);
                    MessagePlugin.error(error.message || (language === 'zh' ? '合并失败' : 'Merge failed'));
                  }
                }}
              />
            )}
            {state.hasVideoMergeable && (
              <ToolButton
                className="video-merge"
                key="video-merge"
                type="icon"
                icon={VideoMergeIcon}
                visible={true}
                title={language === 'zh' ? '合成视频' : 'Merge Videos'}
                aria-label={language === 'zh' ? '合成视频' : 'Merge Videos'}
                onPointerUp={async () => {
                  // 收集所有视频元素的 URL
                  const videoUrls: string[] = [];
                  for (const element of selectedElements) {
                    if (isVideoElement(element) && (element as any).url) {
                      videoUrls.push((element as any).url);
                    }
                  }

                  if (videoUrls.length < 2) {
                    MessagePlugin.warning(language === 'zh' ? '请选择至少2个视频' : 'Please select at least 2 videos');
                    return;
                  }

                  const loadingInstance = MessagePlugin.loading(
                    language === 'zh' ? '正在合成视频...' : 'Merging videos...',
                    0
                  );

                  try {
                    const result = await mergeVideos(videoUrls, (progress, stage) => {
                      const stageText = {
                        loading: language === 'zh' ? '加载 FFmpeg...' : 'Loading FFmpeg...',
                        downloading: language === 'zh' ? '下载视频...' : 'Downloading videos...',
                        merging: language === 'zh' ? '合成中...' : 'Merging...',
                        encoding: language === 'zh' ? '编码中...' : 'Encoding...',
                      };
                      console.log(`[VideoMerge] ${stageText[stage]} ${Math.round(progress)}%`);
                    });

                    MessagePlugin.close(loadingInstance);

                    // 下载合成后的视频
                    const link = document.createElement('a');
                    link.href = result.url;
                    link.download = `merged-video-${Date.now()}.mp4`;
                    link.click();

                    MessagePlugin.success(
                      language === 'zh'
                        ? `已合成 ${videoUrls.length} 个视频`
                        : `Merged ${videoUrls.length} videos`
                    );
                  } catch (error: any) {
                    MessagePlugin.close(loadingInstance);
                    MessagePlugin.error(error.message || (language === 'zh' ? '视频合成失败' : 'Video merge failed'));
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
