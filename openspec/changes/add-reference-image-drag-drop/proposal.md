# Change: 为图片生成入口增加参考图拖放能力

## Why

当前 AI 图片生成弹窗中的参考图上传组件只在较小的上传占位区域接收拖放，且没有显示已经定义的拖放提示；底部 `AIInputBar` 则只支持文件选择、素材库选择和剪贴板粘贴。用户从系统文件管理器拖入图片时，需要准确寻找入口或改用上传按钮，操作不连贯。

## What Changes

- 允许用户把本地图片文件拖放到整个 AI 图片生成弹窗，作为当前任务的参考图
- 允许用户把本地图片文件拖放到底部 `AIInputBar`，进入现有内容预览并作为后续生成请求的参考输入
- 拖放图片复用现有文件选择链路，包括图片类型校验、25MB 上限、超阈值压缩、素材库写入、数量限制与错误反馈
- 为有效的本地图片拖放显示明确的视觉状态，离开或完成拖放后恢复
- 仅接管 `DataTransfer.files` 中的本地图片；不把网页 URL、文本或画布元素拖动解释为参考图
- 保持现有按钮上传、素材库选择和剪贴板粘贴行为不变

## Impact

- Affected specs:
  - `ai-input-generation`
  - `image-generation`
- Affected code:
  - `packages/drawnix/src/components/ai-input-bar/AIInputBar.tsx`
  - `packages/drawnix/src/components/ai-input-bar/ai-input-bar.scss`
  - `packages/drawnix/src/components/ttd-dialog/ai-image-generation.tsx`
  - `packages/drawnix/src/components/ttd-dialog/ai-image-generation.scss`
  - `packages/drawnix/src/components/ttd-dialog/shared/ReferenceImageUpload.tsx`
  - related component tests
- Related active change:
  - `add-ai-input-paste-images` 已建立 AI 输入栏本地图片处理链；本变更复用该链路，但不改变其剪贴板行为或验收范围
