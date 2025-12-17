import React, { useState, useEffect } from 'react';
import './ttd-dialog.scss';
import './ai-image-generation.scss';
import { useI18n } from '../../i18n';
import { type Language } from '../../constants/prompts';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { TaskType } from '../../types/task.types';
import { MessagePlugin, Select } from 'tdesign-react';
import { useGenerationHistory } from '../../hooks/useGenerationHistory';
import { IMAGE_MODEL_GROUPED_OPTIONS } from '../settings-dialog/settings-dialog';
import {
  useGenerationState,
  useKeyboardShortcuts,
  ActionButtons,
  ErrorDisplay,
  ImageUpload,
  PromptInput,
  AspectRatioSelector,
  type ImageFile,
  getMergedPresetPrompts,
  savePromptToHistory as savePromptToHistoryUtil,
} from './shared';
import { DEFAULT_ASPECT_RATIO } from '../../constants/image-aspect-ratios';
import { DialogTaskList } from '../task-queue/DialogTaskList';
import { geminiSettings } from '../../utils/settings-manager';

interface AIImageGenerationProps {
  initialPrompt?: string;
  initialImages?: ImageFile[];
  selectedElementIds?: string[];
  initialWidth?: number;
  initialHeight?: number;
  initialResultUrl?: string;
  selectedModel?: string;
  onModelChange?: (value: string) => void;
}

const AIImageGeneration = ({
  initialPrompt = '',
  initialImages = [],
  selectedElementIds: initialSelectedElementIds = [],
  initialWidth,
  initialHeight,
  initialResultUrl,
  selectedModel,
  onModelChange
}: AIImageGenerationProps = {}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [width, setWidth] = useState<number | string>(initialWidth || 1024);
  const [height, setHeight] = useState<number | string>(initialHeight || 1024);
  const [aspectRatio, setAspectRatio] = useState<string>(DEFAULT_ASPECT_RATIO);
  const [error, setError] = useState<string | null>(null);
  const [uploadedImages, setUploadedImages] = useState<ImageFile[]>(initialImages);

  // Use generation history from task queue
  const { imageHistory } = useGenerationHistory();
  const { isGenerating } = useGenerationState('image');
  const { language } = useI18n();
  const { createTask } = useTaskQueue();

  // Track if we're in manual edit mode (from handleEditTask) to prevent props from overwriting
  const [isManualEdit, setIsManualEdit] = useState(false);

  // 处理 props 变化，更新内部状态
  const processedPropsRef = React.useRef<string>('');
  useEffect(() => {
    // Skip if we're in manual edit mode (user clicked edit in task list)
    if (isManualEdit) {
      console.log('AIImageGeneration - skipping props update in manual edit mode');
      return;
    }
    
    // Create a unique key from all initial props to detect real changes
    const propsKey = JSON.stringify({
      prompt: initialPrompt,
      images: initialImages?.map(img => img.url),
      elementIds: initialSelectedElementIds,
      width: initialWidth,
      height: initialHeight,
      result: initialResultUrl
    });
    
    // Skip if we've already processed these exact props
    if (processedPropsRef.current === propsKey) {
      console.log('AIImageGeneration - skipping duplicate props processing');
      return;
    }
    
    console.log('AIImageGeneration - processing new props:', { propsKey });
    processedPropsRef.current = propsKey;
    
    setPrompt(initialPrompt);
    // 使用 initialImages 的值,如果是 undefined 则使用空数组(确保清空)
    setUploadedImages(initialImages || []);
    if (initialWidth) setWidth(initialWidth);
    if (initialHeight) setHeight(initialHeight);
  }, [initialPrompt, initialImages, initialSelectedElementIds, initialWidth, initialHeight, initialResultUrl, isManualEdit]);

  // 清除错误状态当组件挂载时（对话框打开时）
  useEffect(() => {
    // 组件挂载时清除之前的错误状态
    setError(null);
    
    // 清理函数：组件卸载时也清除错误状态
    return () => {
      setError(null);
    };
  }, []); // 空依赖数组，只在组件挂载/卸载时执行


  // 重置所有状态
  const handleReset = () => {
    setPrompt('');
    setUploadedImages([]);
    setError(null);
    setAspectRatio(DEFAULT_ASPECT_RATIO); // 重置比例
    // Clear manual edit mode
    setIsManualEdit(false);
    // 触发Footer组件更新
    window.dispatchEvent(new CustomEvent('ai-image-clear'));
  };






  // 使用useMemo优化性能，当imageHistory或language变化时重新计算
  const presetPrompts = React.useMemo(() =>
    getMergedPresetPrompts('image', language as Language, imageHistory),
    [imageHistory, language]
  );

  // 保存提示词到历史记录（去重）
  const savePromptToHistory = (promptText: string) => {
    const dimensions = {
      width: typeof width === 'string' ? parseInt(width) || 1024 : width,
      height: typeof height === 'string' ? parseInt(height) || 1024 : height
    };
    savePromptToHistoryUtil('image', promptText, dimensions);
  };

  // 处理任务编辑（从弹窗内的任务列表点击编辑）
  const handleEditTask = (task: any) => {
    console.log('Image handleEditTask - task params:', task.params);

    // 标记为手动编辑模式,防止 props 的 useEffect 覆盖我们的更改
    setIsManualEdit(true);

    // 直接更新表单状态
    setPrompt(task.params.prompt || '');
    setWidth(task.params.width || 1024);
    setHeight(task.params.height || 1024);

    // 更新上传的图片 - 确保格式正确
    if (task.params.uploadedImages && task.params.uploadedImages.length > 0) {
      console.log('Setting uploadedImages:', task.params.uploadedImages);
      setUploadedImages(task.params.uploadedImages);
    } else {
      setUploadedImages([]);
    }

    // 更新模型选择（通过全局设置）
    if (task.params.model) {
      console.log('Updating image model to:', task.params.model);
      const settings = geminiSettings.get();
      console.log('Current settings:', settings);
      geminiSettings.update({
        ...settings,
        imageModelName: task.params.model
      });
      console.log('Updated settings:', geminiSettings.get());
    }

    // 更新宽高比（如果有）
    if (task.params.aspectRatio) {
      console.log('Setting aspectRatio to:', task.params.aspectRatio);
      setAspectRatio(task.params.aspectRatio);
    }

    setError(null);
  };

  // 转换图片为可序列化格式
  const convertImagesToSerializable = async () => {
    return Promise.all(
      uploadedImages.map(async (img) => {
        if (img.file) {
          return new Promise<{ type: 'url'; url: string; name: string }>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              resolve({
                type: 'url',
                url: reader.result as string,
                name: img.name
              });
            };
            reader.onerror = reject;
            reader.readAsDataURL(img.file!);
          });
        } else if (img.url) {
          return { type: 'url', url: img.url, name: img.name };
        }
        throw new Error('Invalid image data');
      })
    );
  };

  const handleGenerate = async (count: number = 1) => {
    if (!prompt.trim()) {
      setError(language === 'zh' ? '请输入图像描述' : 'Please enter image description');
      return;
    }

    try {
      const finalWidth = typeof width === 'string' ? (parseInt(width) || 1024) : width;
      const finalHeight = typeof height === 'string' ? (parseInt(height) || 1024) : height;
      // Convert File objects to base64 data URLs for serialization
      const convertedImages = await convertImagesToSerializable();

      // 如果数量大于1，使用批量生成
      if (count > 1) {
        const batchTaskIds: string[] = [];
        const batchId = `batch_${Date.now()}`;

        // Get current image model from settings
        const settings = geminiSettings.get();
        const currentImageModel = settings.imageModelName || 'gemini-3-pro-image-preview-vip';

        for (let i = 0; i < count; i++) {
          const taskParams = {
            prompt: prompt.trim(),
            width: finalWidth,
            height: finalHeight,
            aspectRatio,
            model: currentImageModel,
            uploadedImages: convertedImages,
            batchId,
            batchIndex: i + 1,
            batchTotal: count
          };

          const task = createTask(taskParams, TaskType.IMAGE);
          if (task) {
            batchTaskIds.push(task.id);
          }
        }

        if (batchTaskIds.length > 0) {
          MessagePlugin.success(
            language === 'zh'
              ? `已添加 ${batchTaskIds.length} 个任务到队列`
              : `Added ${batchTaskIds.length} tasks to queue`
          );

          savePromptToHistory(prompt);
          setError(null);
          // Clear manual edit mode after batch generating
          setIsManualEdit(false);
        } else {
          setError(
            language === 'zh'
              ? '批量任务创建失败，请稍后重试'
              : 'Failed to create batch tasks, please try again later'
          );
        }
        return;
      }

      // 单个任务生成

      // Get current image model from settings
      const settings = geminiSettings.get();
      const currentImageModel = settings.imageModelName || 'gemini-2.5-flash-image-vip';

      // 创建任务参数
      const taskParams = {
        prompt: prompt.trim(),
        width: finalWidth,
        height: finalHeight,
        aspectRatio,
        model: currentImageModel,
        // 保存上传的图片（已转换为可序列化的格式）
        uploadedImages: convertedImages
      };

      // 创建任务并添加到队列
      const task = createTask(taskParams, TaskType.IMAGE);

      if (task) {
        // 任务创建成功
        MessagePlugin.success(
          language === 'zh'
            ? '任务已添加到队列，将在后台生成'
            : 'Task added to queue, will be generated in background'
        );

        // 保存提示词到历史记录
        savePromptToHistory(prompt);

        // 只清除预览和错误，保留表单数据（prompt和参考图）
        setError(null);
        // Clear manual edit mode after generating
        setIsManualEdit(false);
      } else {
        // 任务创建失败（可能是重复提交）
        setError(
          language === 'zh'
            ? '任务创建失败，请检查参数或稍后重试'
            : 'Failed to create task, please check parameters or try again later'
        );
      }
    } catch (err: any) {
      console.error('Failed to create task:', err);

      // 提取更友好的错误信息
      let errorMessage = language === 'zh'
        ? '任务创建失败，请检查参数或稍后重试'
        : 'Failed to create task, please check parameters or try again later';

      if (err.message) {
        if (err.message.includes('exceed 5000 characters')) {
          errorMessage = language === 'zh'
            ? '提示词不能超过 5000 字符'
            : 'Prompt must not exceed 5000 characters';
        } else if (err.message.includes('Duplicate submission')) {
          errorMessage = language === 'zh'
            ? '请勿重复提交，请等待 5 秒后再试'
            : 'Duplicate submission. Please wait 5 seconds.';
        } else if (err.message.includes('Invalid parameters')) {
          errorMessage = language === 'zh'
            ? `参数错误: ${err.message.replace('Invalid parameters: ', '')}`
            : err.message;
        }
      }

      setError(errorMessage);
    }
  };

  useKeyboardShortcuts(isGenerating, prompt, () => handleGenerate(1));








  return (
    <div className="ai-image-generation-container">
      <div className="main-content">
        {/* AI 图像生成表单 */}
        <div className="ai-image-generation-section">
          <div className="ai-image-generation-form">

          {/* 模型选择器 */}
          {selectedModel !== undefined && onModelChange && (
            <div className="model-selector-wrapper">
              {/* <label className="model-selector-label">
                {language === 'zh' ? '模型' : 'Image Model'}
              </label> */}
              <Select
                value={selectedModel}
                onChange={(value) => onModelChange(value as string)}
                options={IMAGE_MODEL_GROUPED_OPTIONS}
                size="small"
                placeholder={language === 'zh' ? '选择图片模型' : 'Select Image Model'}
                filterable
                creatable
                disabled={isGenerating}
              />
            </div>
          )}

          {/* 参考图片区域 */}
          <ImageUpload
            images={uploadedImages}
            onImagesChange={setUploadedImages}
            language={language}
            disabled={isGenerating}
            multiple={true}
            onError={setError}
          />

          <PromptInput
            prompt={prompt}
            onPromptChange={setPrompt}
            presetPrompts={presetPrompts}
            language={language}
            type="image"
            disabled={isGenerating}
            onError={setError}
          />

            <ErrorDisplay error={error} />
          </div>

          <ActionButtons
            language={language}
            type="image"
            isGenerating={isGenerating}
            hasGenerated={false}
            canGenerate={!!prompt.trim()}
            onGenerate={handleGenerate}
            onReset={handleReset}
            leftContent={
              <AspectRatioSelector
                value={aspectRatio}
                onChange={setAspectRatio}
                compact={true}
              />
            }
          />

        </div>

        {/* 任务列表侧栏 */}
        <div className="task-sidebar">
          <DialogTaskList taskType={TaskType.IMAGE} onEditTask={handleEditTask} />
        </div>
      </div>


    </div>
  );
};

export default AIImageGeneration;
