import React, { useState, useEffect } from 'react';
import './ttd-dialog.scss';
import './ai-video-generation.scss';
import { useI18n } from '../../i18n';
import { type Language } from '../../constants/prompts';
import { useGenerationHistory } from '../../hooks/useGenerationHistory';
import {
  useGenerationState,
  useKeyboardShortcuts,
  ActionButtons,
  ErrorDisplay,
  PromptInput,
  type ImageFile,
  getMergedPresetPrompts,
  savePromptToHistory as savePromptToHistoryUtil,
  VideoModelOptions,
  MultiImageUpload,
  StoryboardEditor,
} from './shared';
import { geminiSettings } from '../../utils/settings-manager';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { TaskType } from '../../types/task.types';
import { MessagePlugin, Select } from 'tdesign-react';
import { DialogTaskList } from '../task-queue/DialogTaskList';
import type { VideoModel, UploadedVideoImage, StoryboardScene } from '../../types/video.types';
import {
  getVideoModelConfig,
  getDefaultModelParams,
  supportsStoryboardMode,
  getStoryboardModeConfig,
} from '../../constants/video-model-config';
import { VIDEO_MODEL_OPTIONS } from '../settings-dialog/settings-dialog';
import {
  formatStoryboardPrompt,
  parseStoryboardPrompt,
  isStoryboardPrompt,
  validateSceneDurations,
} from '../../utils/storyboard-utils';



interface AIVideoGenerationProps {
  initialPrompt?: string;
  initialImage?: ImageFile;  // 保留单图片支持（向后兼容）
  initialImages?: UploadedVideoImage[];  // 新增：支持多图片
  initialDuration?: number;
  initialModel?: VideoModel;  // 新增：模型选择
  initialSize?: string;  // 新增：尺寸选择
  initialResultUrl?: string;
  selectedModel?: string;
  onModelChange?: (value: string) => void;
}

const AIVideoGeneration = ({
  initialPrompt = '',
  initialImage,
  initialImages,
  initialDuration,
  initialModel,
  initialSize,
  initialResultUrl,
  selectedModel,
  onModelChange
}: AIVideoGenerationProps = {}) => {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [error, setError] = useState<string | null>(null);

  // Video model parameters - use state to support dynamic updates
  const [currentModel, setCurrentModel] = useState<VideoModel>(() => {
    const settings = geminiSettings.get();
    return (initialModel || settings.videoModelName || 'veo3') as VideoModel;
  });

  // Use useMemo to ensure modelConfig and defaultParams update when currentModel changes
  const modelConfig = React.useMemo(() => getVideoModelConfig(currentModel), [currentModel]);
  const defaultParams = React.useMemo(() => getDefaultModelParams(currentModel), [currentModel]);

  // Duration and size state
  const [duration, setDuration] = useState(initialDuration?.toString() || defaultParams.duration);
  const [size, setSize] = useState(initialSize || defaultParams.size);

  // Multi-image upload state (replaces single uploadedImage)
  const [uploadedImages, setUploadedImages] = useState<UploadedVideoImage[]>(() => {
    // 优先使用 initialImages（多图片）
    if (initialImages && initialImages.length > 0) {
      return initialImages;
    }
    // 向后兼容：将单个 initialImage 转换为多图片格式
    if (initialImage) {
      return [{
        slot: 0,
        slotLabel: modelConfig.imageUpload.labels?.[0] || '参考图',
        url: initialImage.url || '',
        name: initialImage.name,
        file: initialImage.file,
      }];
    }
    return [];
  });

  // Storyboard mode state
  const [storyboardEnabled, setStoryboardEnabled] = useState(false);
  const [storyboardScenes, setStoryboardScenes] = useState<StoryboardScene[]>([]);
  const storyboardConfig = React.useMemo(
    () => getStoryboardModeConfig(currentModel),
    [currentModel]
  );
  const modelSupportsStoryboard = supportsStoryboardMode(currentModel);

  // Use generation history from task queue
  const { videoHistory } = useGenerationHistory();

  const { isGenerating } = useGenerationState('video');

  const { language } = useI18n();
  const { createTask } = useTaskQueue();

  // Sync model from global settings changes (from header dropdown)
  useEffect(() => {
    const handleSettingsChange = (newSettings: any) => {
      const newModel = newSettings.videoModelName || 'veo3';
      if (newModel !== currentModel) {
        setCurrentModel(newModel as VideoModel);
      }
    };
    geminiSettings.addListener(handleSettingsChange);
    return () => geminiSettings.removeListener(handleSettingsChange);
  }, [currentModel]);

  // Sync model from selectedModel prop (from parent component)
  useEffect(() => {
    if (selectedModel && selectedModel !== currentModel) {
      console.log('AIVideoGeneration - syncing model from prop:', selectedModel);
      setCurrentModel(selectedModel as VideoModel);
    }
  }, [selectedModel]);

  // Track if we're in manual edit mode (from handleEditTask) to prevent props from overwriting
  const [isManualEdit, setIsManualEdit] = useState(false);
  
  // Reset parameters when model changes (but don't clear uploaded images on edit)
  const [isEditMode, setIsEditMode] = useState(false);
  useEffect(() => {
    if (isEditMode) {
      // In edit mode, don't reset parameters automatically
      setIsEditMode(false);
      return;
    }
    console.log('AIVideoGeneration - model changed, updating params:', {
      model: currentModel,
      duration: defaultParams.duration,
      size: defaultParams.size
    });
    setDuration(defaultParams.duration);
    setSize(defaultParams.size);
    // Clear uploaded images when model changes (different upload requirements)
    setUploadedImages([]);
    // Disable storyboard mode if new model doesn't support it
    if (!supportsStoryboardMode(currentModel)) {
      setStoryboardEnabled(false);
      setStoryboardScenes([]);
    }
  }, [currentModel, defaultParams, isEditMode]);

  // Handle initial props - use ref to track if we've processed these props before
  const processedPropsRef = React.useRef<string>('');
  useEffect(() => {
    // Skip if we're in manual edit mode (user clicked edit in task list)
    if (isManualEdit) {
      console.log('AIVideoGeneration - skipping props update in manual edit mode');
      return;
    }
    
    // Create a unique key from all initial props to detect real changes
    const propsKey = JSON.stringify({
      prompt: initialPrompt,
      image: initialImage?.url,
      images: initialImages?.map(img => img.url),
      duration: initialDuration,
      model: initialModel,
      size: initialSize,
      result: initialResultUrl
    });
    
    // Skip if we've already processed these exact props
    if (processedPropsRef.current === propsKey) {
      console.log('AIVideoGeneration - skipping duplicate props processing');
      return;
    }
    
    console.log('AIVideoGeneration - processing new props:', { propsKey });
    processedPropsRef.current = propsKey;
    
    setPrompt(initialPrompt);

    // 处理图片：优先使用 initialImages，否则转换 initialImage
    if (initialImages && initialImages.length > 0) {
      setUploadedImages(initialImages);
    } else if (initialImage) {
      setUploadedImages([{
        slot: 0,
        slotLabel: modelConfig.imageUpload.labels?.[0] || '参考图',
        url: initialImage.url || '',
        name: initialImage.name,
        file: initialImage.file,
      }]);
    } else {
      setUploadedImages([]);
    }

    // 更新 duration 和 size（如果有初始值）
    if (initialDuration !== undefined) {
      setDuration(initialDuration.toString());
    }
    if (initialSize) {
      setSize(initialSize);
    }

    setError(null);
  }, [initialPrompt, initialImage, initialImages, initialDuration, initialSize, initialResultUrl, modelConfig.imageUpload.labels, isManualEdit]);

  // Clear errors on mount
  useEffect(() => {
    setError(null);
    return () => {
      setError(null);
    };
  }, []);


  const handleReset = () => {
    setPrompt('');
    setUploadedImages([]);
    setError(null);
    // Reset duration and size to defaults
    const newDefaults = getDefaultModelParams(currentModel);
    setDuration(newDefaults.duration);
    setSize(newDefaults.size);
    // Clear manual edit mode
    setIsManualEdit(false);
    // Clear storyboard mode
    setStoryboardEnabled(false);
    setStoryboardScenes([]);
    window.dispatchEvent(new CustomEvent('ai-video-clear'));
  };

  // 使用useMemo优化性能，当videoHistory或language变化时重新计算
  const presetPrompts = React.useMemo(() =>
    getMergedPresetPrompts('video', language as Language, videoHistory),
    [videoHistory, language]
  );

  // 保存提示词到历史记录（去重）
  const savePromptToHistory = (promptText: string) => {
    savePromptToHistoryUtil('video', promptText, { width: 1280, height: 720 });
  };

  // 处理任务编辑（从弹窗内的任务列表点击编辑）
  const handleEditTask = (task: any) => {
    console.log('Video handleEditTask - task params:', task.params);

    // 标记为手动编辑模式,防止 props 的 useEffect 覆盖我们的更改
    setIsManualEdit(true);

    // 标记为编辑模式,防止模型变化时重置参数
    setIsEditMode(true);

    // 更新模型选择（通过本地 state 和全局设置）- 先设置模型
    if (task.params.model) {
      console.log('Updating model to:', task.params.model);
      setCurrentModel(task.params.model as VideoModel);
      const settings = geminiSettings.get();
      geminiSettings.update({
        ...settings,
        videoModelName: task.params.model
      });
    }

    // 检查是否有故事场景配置
    if (task.params.storyboard?.enabled && task.params.storyboard?.scenes) {
      console.log('Restoring storyboard mode:', task.params.storyboard);
      setStoryboardEnabled(true);
      setStoryboardScenes(task.params.storyboard.scenes);
      setPrompt(''); // 故事场景模式下清空普通提示词
    } else {
      // 尝试从提示词解析故事场景格式
      const prompt = task.params.prompt || '';
      const parsedScenes = parseStoryboardPrompt(prompt);
      if (parsedScenes && parsedScenes.length > 0) {
        console.log('Parsed storyboard from prompt:', parsedScenes);
        setStoryboardEnabled(true);
        setStoryboardScenes(parsedScenes);
        setPrompt('');
      } else {
        // 普通模式
        setStoryboardEnabled(false);
        setStoryboardScenes([]);
        setPrompt(prompt);
      }
    }

    // 更新视频参数
    if (task.params.seconds !== undefined) {
      const durationValue = typeof task.params.seconds === 'string'
        ? task.params.seconds
        : task.params.seconds.toString();
      console.log('Setting duration to:', durationValue);
      setDuration(durationValue);
    }

    if (task.params.size) {
      console.log('Setting size to:', task.params.size);
      setSize(task.params.size);
    }

    // 更新上传的图片 - 确保格式正确
    if (task.params.uploadedImages && task.params.uploadedImages.length > 0) {
      console.log('Setting uploadedImages:', task.params.uploadedImages);
      setUploadedImages(task.params.uploadedImages);
    } else {
      setUploadedImages([]);
    }

    setError(null);
  };

  const handleGenerate = async (count: number = 1) => {
    // 验证输入
    if (storyboardEnabled) {
      // 故事场景模式验证
      const validation = validateSceneDurations(
        storyboardScenes,
        parseFloat(duration),
        storyboardConfig.minSceneDuration
      );
      if (!validation.valid) {
        setError(validation.error || '场景配置无效');
        return;
      }
    } else {
      // 普通模式验证
      if (!prompt.trim()) {
        setError(language === 'zh' ? '请输入视频描述' : 'Please enter video description');
        return;
      }
    }

    try {
      // Convert uploaded images to serializable format
      const convertedImages: UploadedVideoImage[] = [];
      for (const img of uploadedImages) {
        if (img.file) {
          // Convert File to base64 data URL
          const base64Url = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(img.file!);
          });
          convertedImages.push({
            ...img,
            url: base64Url,
            file: undefined, // Remove File object for serialization
          });
        } else {
          convertedImages.push({
            ...img,
            file: undefined,
          });
        }
      }

      // 构建最终提示词
      const finalPrompt = storyboardEnabled
        ? formatStoryboardPrompt(storyboardScenes)
        : prompt.trim();

      // 批量生成逻辑
      const batchTaskIds: string[] = [];
      const batchId = count > 1 ? `video_batch_${Date.now()}` : undefined;

      for (let i = 0; i < count; i++) {
        // 创建任务参数（包含新的 duration, size, uploadedImages）
        const taskParams = {
          prompt: finalPrompt,
          model: currentModel,
          seconds: duration,
          size: size,
          // 保存上传的图片（已转换为可序列化的格式）
          uploadedImages: convertedImages,
          // 故事场景配置（用于编辑恢复）
          ...(storyboardEnabled && {
            storyboard: {
              enabled: true,
              scenes: storyboardScenes,
              totalDuration: parseFloat(duration),
            },
          }),
          // 批量生成信息
          ...(batchId && {
            batchId,
            batchIndex: i + 1,
            batchTotal: count,
          }),
        };

        // 创建任务并添加到队列
        const task = createTask(taskParams, TaskType.VIDEO);

        if (task) {
          batchTaskIds.push(task.id);
        }
      }

      if (batchTaskIds.length > 0) {
        // 任务创建成功
        MessagePlugin.success(
          language === 'zh'
            ? count > 1
              ? `${batchTaskIds.length} 个视频任务已添加到队列，将在后台生成`
              : '视频任务已添加到队列，将在后台生成'
            : count > 1
              ? `${batchTaskIds.length} video tasks added to queue, will be generated in background`
              : 'Video task added to queue, will be generated in background'
        );

        // 保存提示词到历史记录
        savePromptToHistory(finalPrompt);

        // 清空表单（保留模型选择和尺寸设置）
        setPrompt('');
        setUploadedImages([]);
        setStoryboardEnabled(false);
        setStoryboardScenes([]);
        setError(null);
        // Clear manual edit mode after generating
        setIsManualEdit(false);
      } else {
        // 任务创建失败
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

  useKeyboardShortcuts(isGenerating, prompt, handleGenerate);

  return (
    <div className="ai-video-generation-container">
      <div className="main-content">
        {/* AI 视频生成表单 */}
        <div className="ai-image-generation-section">
          <div className="ai-image-generation-form">

            {/* 模型选择器 */}
            {selectedModel !== undefined && onModelChange && (
              <div className="model-selector-wrapper">
                {/* <label className="model-selector-label">
                  {language === 'zh' ? '视频模型' : 'Video Model'}
                </label> */}
                <Select
                  value={selectedModel}
                  onChange={(value) => onModelChange(value as string)}
                  options={VIDEO_MODEL_OPTIONS}
                  size="small"
                  placeholder={language === 'zh' ? '选择视频模型' : 'Select Video Model'}
                  filterable
                  creatable
                  disabled={isGenerating}
                />
              </div>
            )}

            {/* Video model options: duration & size */}
            <VideoModelOptions
              model={currentModel}
              duration={duration}
              size={size}
              onDurationChange={setDuration}
              onSizeChange={setSize}
              disabled={isGenerating}
            />

            {/* Multi-image upload based on model config */}
            <MultiImageUpload
              config={modelConfig.imageUpload}
              images={uploadedImages}
              onImagesChange={setUploadedImages}
              disabled={isGenerating}
            />

            {/* Storyboard mode editor (only for supported models) */}
            {modelSupportsStoryboard && (
              <StoryboardEditor
                enabled={storyboardEnabled}
                onEnabledChange={setStoryboardEnabled}
                totalDuration={parseFloat(duration)}
                maxScenes={storyboardConfig.maxScenes}
                minSceneDuration={storyboardConfig.minSceneDuration}
                scenes={storyboardScenes}
                onScenesChange={setStoryboardScenes}
                disabled={isGenerating}
              />
            )}

            {/* Normal prompt input (hidden when storyboard mode is enabled) */}
            {!storyboardEnabled && (
              <PromptInput
                prompt={prompt}
                onPromptChange={setPrompt}
                presetPrompts={presetPrompts}
                language={language}
                type="video"
                disabled={isGenerating}
                onError={setError}
              />
            )}

            <ErrorDisplay error={error} />
          </div>

          <ActionButtons
            language={language}
            type="video"
            isGenerating={isGenerating}
            hasGenerated={false}
            canGenerate={storyboardEnabled ? storyboardScenes.length > 0 : !!prompt.trim()}
            onGenerate={handleGenerate}
            onReset={handleReset}
          />
        </div>

        {/* 任务列表侧栏 */}
        <div className="task-sidebar">
          <DialogTaskList taskType={TaskType.VIDEO} onEditTask={handleEditTask} />
        </div>
      </div>
    </div>
  );
};

export default AIVideoGeneration;