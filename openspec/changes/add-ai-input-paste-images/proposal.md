# Change: 为 AI 输入栏增加剪贴板图片粘贴能力

## Why

当前主页面底部居中的 `AIInputBar` 只支持文本输入、文件选择上传和素材库选择，不支持直接从系统剪贴板粘贴图片。
这导致用户无法像其他多模态产品那样用 `Ctrl+V / Cmd+V` 快速把截图、复制图片等资源带入生成流程，也没有复用项目已有的图片校验、压缩和素材库入库逻辑。

## What Changes

- 为 `AIInputBar` 增加剪贴板图片粘贴支持
- 将 `AIInputBar` 的本地图片接入统一到现有图片上传规则：仅接受图片、限制体积、必要时压缩
- 粘贴进入的图片与手动上传的图片一致，自动写入素材库并进入输入栏内容预览
- 保持现有工作流提交流程不变，复用已有 `referenceImages` / `uploadedImages` 传递链路

## Impact

- Affected specs:
  - `ai-input-bar`
- Affected code:
  - `packages/drawnix/src/components/ai-input-bar/AIInputBar.tsx`
  - `packages/drawnix/src/components/shared/SelectedContentPreview.tsx`
  - `packages/drawnix/src/contexts/AssetContext.tsx`
  - `apps/web-e2e/src/fixtures/test-app.ts`

## Analysis

当前实现的主要差异点如下：

1. `AIInputBar` 已支持上传按钮和素材库按钮，但没有注册任何 `paste` 监听，因此浏览器默认只会把可粘贴的文本写入 textarea。
2. `AIInputBar` 的本地上传链路只做了 `image/*` 过滤和 Base64 转换，没有复用 `ReferenceImageUpload` 中已经存在的大小限制、压缩和统一错误反馈逻辑。
3. 生成链路本身已经支持把输入栏中的图片作为 `referenceImages` 继续传给工作流、任务队列和模型适配层，因此新增粘贴能力主要是“补入口”和“统一处理”，不需要重构下游。
