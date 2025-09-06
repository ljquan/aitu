import { Dialog, DialogContent } from '../dialog/dialog';
import { Dialog as TDialog } from 'tdesign-react';
import MermaidToDrawnix from './mermaid-to-drawnix';
import { DialogType, useDrawnix } from '../../hooks/use-drawnix';
import MarkdownToDrawnix from './markdown-to-drawnix';
import AIImageGeneration from './ai-image-generation';
import AIVideoGeneration from './ai-video-generation';
import { useI18n } from '../../i18n';
import { useBoard } from '@plait-board/react-board';
import { useState, useEffect } from 'react';
import { processSelectedContentForAI, extractSelectedContent } from '../../utils/selection-utils';
import { ATTACHED_ELEMENT_CLASS_NAME, getSelectedElements } from '@plait/core';

export const TTDDialog = ({ container }: { container: HTMLElement | null }) => {
  const { appState, setAppState } = useDrawnix();
  const { language } = useI18n();
  const board = useBoard();
  
  // AI 图像生成的初始数据
  const [aiImageData, setAiImageData] = useState<{
    initialPrompt: string;
    initialImages: (File | { url: string; name: string })[];
    selectedElementIds: string[]; // 保存选中元素的IDs
  }>({
    initialPrompt: '',
    initialImages: [],
    selectedElementIds: []
  });

  // AI 视频生成的初始数据
  const [aiVideoData, setAiVideoData] = useState<{
    initialPrompt: string;
    initialImage: File | { url: string; name: string } | undefined;
  }>({
    initialPrompt: '',
    initialImage: undefined
  });

  // 当 AI 图像生成对话框打开时，处理选中内容
  useEffect(() => {
    if (appState.openDialogType === DialogType.aiImageGeneration) {
      const processSelection = async () => {
        try {
          // 保存当前选中的元素IDs
          const selectedElements = getSelectedElements(board);
          const selectedElementIds = selectedElements.map(el => el.id);
          console.log('Saving selected element IDs for AI image generation:', selectedElementIds);
          
          // 使用新的处理逻辑来处理选中的内容
          const processedContent = await processSelectedContentForAI(board);
          
          // 准备图片列表
          const imageItems: (File | { url: string; name: string })[] = [];
          
          // 1. 先添加剩余的图片（非重叠的图片）
          processedContent.remainingImages.forEach(image => {
            imageItems.push({
              url: image.url,
              name: image.name || `selected-image-${Date.now()}.png`
            });
          });
          
          // 2. 后添加由图形元素生成的图片（如果存在）
          if (processedContent.graphicsImage) {
            imageItems.push({
              url: processedContent.graphicsImage,
              name: `graphics-combined-${Date.now()}.png`
            });
          }

          // 设置 AI 图像生成的初始数据
          setAiImageData({
            initialPrompt: processedContent.remainingText || '',
            initialImages: imageItems,
            selectedElementIds: selectedElementIds
          });
          
        } catch (error) {
          console.warn('Error processing selected content for AI:', error);
          
          // 如果新的处理逻辑失败，回退到原来的逻辑
          const selectedContent = extractSelectedContent(board);
          
          const imageItems = selectedContent.images.map(image => ({
            url: image.url,
            name: image.name || `selected-image-${Date.now()}.png`
          }));
          
          setAiImageData({
            initialPrompt: selectedContent.text || '',
            initialImages: imageItems,
            selectedElementIds: [] // 回退情况下没有选中元素信息
          });
        }
      };

      processSelection();
    }

    // 处理 AI 视频生成的选中内容
    if (appState.openDialogType === DialogType.aiVideoGeneration) {
      const processVideoSelection = async () => {
        try {
          // 使用新的处理逻辑来处理选中的内容
          const processedContent = await processSelectedContentForAI(board);
          
          // 对于视频生成，只使用第一张图片
          let firstImage: File | { url: string; name: string } | undefined = undefined;
          
          if (processedContent.remainingImages.length > 0) {
            const image = processedContent.remainingImages[0];
            firstImage = {
              url: image.url,
              name: image.name || `selected-image-${Date.now()}.png`
            };
          } else if (processedContent.graphicsImage) {
            firstImage = {
              url: processedContent.graphicsImage,
              name: `graphics-combined-${Date.now()}.png`
            };
          }

          // 设置 AI 视频生成的初始数据
          setAiVideoData({
            initialPrompt: processedContent.remainingText || '',
            initialImage: firstImage
          });
          
        } catch (error) {
          console.warn('Error processing selected content for AI video:', error);
          
          // 如果新的处理逻辑失败，回退到原来的逻辑
          const selectedContent = extractSelectedContent(board);
          
          let firstImage: File | { url: string; name: string } | undefined = undefined;
          if (selectedContent.images.length > 0) {
            const image = selectedContent.images[0];
            firstImage = {
              url: image.url,
              name: image.name || `selected-image-${Date.now()}.png`
            };
          }
          
          setAiVideoData({
            initialPrompt: selectedContent.text || '',
            initialImage: firstImage
          });
        }
      };

      processVideoSelection();
    }
  }, [appState.openDialogType, board]);
  return (
    <>
      <Dialog
        open={appState.openDialogType === DialogType.mermaidToDrawnix}
        onOpenChange={(open) => {
          setAppState({
            ...appState,
            openDialogType: open ? DialogType.mermaidToDrawnix : null,
          });
        }}
      >
        <DialogContent className="Dialog ttd-dialog" container={container}>
          <MermaidToDrawnix></MermaidToDrawnix>
        </DialogContent>
      </Dialog>
      <Dialog
        open={appState.openDialogType === DialogType.markdownToDrawnix}
        onOpenChange={(open) => {
          setAppState({
            ...appState,
            openDialogType: open ? DialogType.markdownToDrawnix : null,
          });
        }}
      >
        <DialogContent className="Dialog ttd-dialog" container={container}>
          <MarkdownToDrawnix></MarkdownToDrawnix>
        </DialogContent>
      </Dialog>
      <TDialog
        visible={appState.openDialogType === DialogType.aiImageGeneration}
        onClose={() => {
          // 在关闭前保存AI图像生成的缓存
          const cached = localStorage.getItem('ai_image_generation_preview_cache');
          if (cached) {
            try {
              const data = JSON.parse(cached);
              // 更新时间戳以保持缓存有效
              data.timestamp = Date.now();
              localStorage.setItem('ai_image_generation_preview_cache', JSON.stringify(data));
            } catch (error) {
              console.warn('Failed to update cache timestamp:', error);
            }
          }
          
          console.log('Dialog closing - selection should be preserved via ATTACHED_ELEMENT_CLASS_NAME');
          
          // 关闭对话框 - 选择状态应该会被保持，因为对话框有ATTACHED_ELEMENT_CLASS_NAME类
          setAppState({
            ...appState,
            openDialogType: null,
          });
        }}
        attach={container ? () => container : undefined}
        header={language === 'zh' ? 'AI 图像生成' : 'AI Image Generation'}
        footer={false}
        width="80%"
        className={`ttd-dialog ${ATTACHED_ELEMENT_CLASS_NAME}`}
        closeOnOverlayClick={false}
        showOverlay={true}
        mode="modal"
        preventScrollThrough={true}
        closeBtn={true}
      >
        <AIImageGeneration 
          initialPrompt={aiImageData.initialPrompt}
          initialImages={aiImageData.initialImages}
          selectedElementIds={aiImageData.selectedElementIds}
        />
      </TDialog>
      {appState.openDialogType === DialogType.aiVideoGeneration &&       <TDialog
        visible={appState.openDialogType === DialogType.aiVideoGeneration}
        onClose={() => {
          // 在关闭前保存AI视频生成的缓存
          const cached = localStorage.getItem('ai_video_generation_preview_cache');
          if (cached) {
            try {
              const data = JSON.parse(cached);
              // 更新时间戳以保持缓存有效
              data.timestamp = Date.now();
              localStorage.setItem('ai_video_generation_preview_cache', JSON.stringify(data));
            } catch (error) {
              console.warn('Failed to update cache timestamp:', error);
            }
          }
          
          console.log('Video dialog closing - selection should be preserved via ATTACHED_ELEMENT_CLASS_NAME');
          
          // 关闭对话框 - 选择状态应该会被保持，因为对话框有ATTACHED_ELEMENT_CLASS_NAME类
          setAppState({
            ...appState,
            openDialogType: null,
          });
        }}
        attach={container ? () => container : undefined}
        header={language === 'zh' ? 'AI 视频生成' : 'AI Video Generation'}
        footer={false}
        width="80%"
        className={`ttd-dialog ${ATTACHED_ELEMENT_CLASS_NAME}`}
        closeOnOverlayClick={false}
        showOverlay={true}
        mode="modal"
        preventScrollThrough={true}
        closeBtn={true}
      >
        <AIVideoGeneration 
          initialPrompt={aiVideoData.initialPrompt}
          initialImage={aiVideoData.initialImage}
        />
      </TDialog>}
    </>
  );
};
