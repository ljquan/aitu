import { Dialog, DialogContent } from '../dialog/dialog';
import { Dialog as TDialog } from 'tdesign-react';
import MermaidToDrawnix from './mermaid-to-drawnix';
import { DialogType, useDrawnix } from '../../hooks/use-drawnix';
import MarkdownToDrawnix from './markdown-to-drawnix';
import AIImageGeneration from './ai-image-generation';
import { useI18n } from '../../i18n';

export const TTDDialog = ({ container }: { container: HTMLElement | null }) => {
  const { appState, setAppState } = useDrawnix();
  const { language } = useI18n();
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
          
          setAppState({
            ...appState,
            openDialogType: null,
          });
        }}
        attach={container ? () => container : undefined}
        header={language === 'zh' ? 'AI 图像生成' : 'AI Image Generation'}
        footer={false}
        width="80%"
        className="ttd-dialog"
        closeOnOverlayClick={false}
        showOverlay={true}
        mode="modal"
        preventScrollThrough={true}
        closeBtn={true}
      >
        <AIImageGeneration></AIImageGeneration>
      </TDialog>
    </>
  );
};
