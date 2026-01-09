/**
 * With Tool Plugin
 *
 * 工具插件 - 注册 ToolComponent 到 Plait
 */

import {
  PlaitBoard,
  PlaitPlugin,
  PlaitPluginElementContext,
  Point,
  Transforms,
  RectangleClient,
  PlaitElement,
  Selection,
  ClipboardData,
  WritableClipboardContext,
  WritableClipboardOperationType,
  WritableClipboardType,
  addOrCreateClipboardContext,
  getSelectedElements,
} from '@plait/core';
import { buildClipboardData, insertClipboardData } from '@plait/common';
import { ToolComponent } from '../components/tool-element/tool.component';
import { PlaitTool } from '../types/toolbox.types';
import { DEFAULT_TOOL_CONFIG } from '../constants/built-in-tools';
import { ToolCommunicationService, ToolCommunicationHelper } from '../services/tool-communication-service';
import { ToolMessageType, GenerateImagePayload, GenerateImageResponse, InsertImagePayload } from '../types/tool-communication.types';
import { taskQueueService } from '../services/task-queue-service';
import { TaskType } from '../types/task.types';
import { geminiSettings } from '../utils/settings-manager';
import { insertImageFromUrlAndSelect } from '../data/image';

/**
 * 设置通信处理器
 */
function setupCommunicationHandlers(
  board: PlaitBoard,
  helper: ToolCommunicationHelper,
  service: ToolCommunicationService
): void {
  // 处理工具就绪通知
  helper.onToolReady((toolId) => {
    console.log(`[ToolCommunication] Tool ready: ${toolId}`);

    // 获取当前的 Gemini 设置
    const settings = geminiSettings.get();

    // 发送初始化配置（包含 API key 等敏感信息）
    helper.initTool(toolId, {
      boardId: (board as any).id || 'default-board',
      theme: 'light', // TODO: 从应用状态获取实际主题
      config: {
        apiKey: settings.apiKey,
        baseUrl: settings.baseUrl,
        imageModel: settings.imageModelName || 'gemini-2.5-flash-image-vip',
      },
    });
  });

  // 处理插入文本请求
  helper.onInsertText((toolId, payload) => {
    console.log(`[ToolCommunication] Insert text from ${toolId}:`, payload);
    // TODO: 实现文本插入逻辑
    // 可以使用 Plait 的文本节点 API
  });

  // 处理插入图片请求
  helper.onInsertImage(async (toolId, payload: InsertImagePayload) => {
    console.log(`[ToolCommunication] Insert image from ${toolId}:`, payload);
    
    if (!payload.url) {
      console.error(`[ToolCommunication] Missing image URL from ${toolId}`);
      return;
    }

    try {
      // 计算插入位置
      // 如果 payload 提供了位置，使用它；否则使用画布中心
      let insertPoint: Point;
      if (payload.position && payload.position.length === 2) {
        insertPoint = payload.position as Point;
      } else {
        // 获取当前视口中心作为插入位置
        const viewportRect = board.viewport?.viewBox;
        if (viewportRect) {
          insertPoint = [
            viewportRect.x + viewportRect.width / 2 - (payload.width || 200) / 2,
            viewportRect.y + viewportRect.height / 2 - (payload.height || 200) / 2,
          ];
        } else {
          insertPoint = [100, 100];
        }
      }

      // 插入图片并选中
      await insertImageFromUrlAndSelect(
        board,
        payload.url,
        insertPoint,
        payload.width && payload.height
          ? { width: payload.width, height: payload.height }
          : undefined
      );

      console.log(`[ToolCommunication] Image inserted and selected from ${toolId}`);
    } catch (error) {
      console.error(`[ToolCommunication] Failed to insert image from ${toolId}:`, error);
    }
  });

  // 处理工具关闭请求
  helper.onToolClose((toolId) => {
    console.log(`[ToolCommunication] Tool close request: ${toolId}`);
    const element = ToolTransforms.getToolById(board, toolId);
    if (element) {
      ToolTransforms.removeTool(board, element.id);
    }
  });

  // 处理图片生成请求
  service.on(ToolMessageType.TOOL_TO_BOARD_GENERATE_IMAGE, async (message) => {
    const payload = message.payload as GenerateImagePayload;
    console.log(`[ToolCommunication] Generate image request from ${message.toolId}:`, payload);

    try {
      // 构建生成参数（与 ai-image-generation.tsx 一致）
      const generateParams: any = {
        prompt: payload.prompt,
      };

      // 优先使用 size 参数（比例格式），否则使用 width/height
      if (payload.size) {
        generateParams.aspectRatio = payload.size;
      } else {
        generateParams.width = payload.width || 1024;
        generateParams.height = payload.height || 1024;
      }

      // 传递参考图片（如果有）
      if ((payload as any).uploadedImages && (payload as any).uploadedImages.length > 0) {
        generateParams.uploadedImages = (payload as any).uploadedImages;
        console.log(`[ToolCommunication] Passing ${generateParams.uploadedImages.length} reference images`);
      }

      // 传递批次信息（避免重复检测）
      if ((payload as any).batchId) {
        generateParams.batchId = (payload as any).batchId;
        generateParams.batchIndex = (payload as any).batchIndex;
        generateParams.batchTotal = (payload as any).batchTotal;
        // 全局唯一序号，确保每个子任务哈希唯一
        if ((payload as any).globalIndex) {
          generateParams.globalIndex = (payload as any).globalIndex;
        }
        console.log(`[ToolCommunication] Batch info: ${generateParams.batchIndex}/${generateParams.batchTotal} (${generateParams.batchId}), global: ${generateParams.globalIndex}`);
      }

      // 获取当前图片模型
      const settings = geminiSettings.get();
      generateParams.model = settings.imageModelName || 'gemini-2.5-flash-image-vip';

      // 通过 taskQueueService 创建任务（这样任务会出现在全局任务队列中）
      const task = taskQueueService.createTask(generateParams, TaskType.IMAGE);

      if (!task) {
        throw new Error('任务创建失败，请稍后重试');
      }

      const taskId = task.id;
      console.log(`[ToolCommunication] Created task ${taskId} for ${message.toolId}`);

      // 获取工具的 iframe
      const iframe = document.querySelector(
        `[data-element-id="${message.toolId}"] iframe`
      ) as HTMLIFrameElement;

      if (!iframe?.contentWindow) {
        console.error(`[ToolCommunication] Iframe not found for ${message.toolId}`);
        return;
      }

      // 监听该任务的状态变化
      const subscription = taskQueueService.observeTaskUpdates().subscribe(event => {
        if (event.task.id !== taskId) return;

        // 任务完成
        if (event.type === 'taskUpdated' && event.task.status === 'completed' && event.task.result) {
          const response: GenerateImageResponse = {
            success: true,
            responseId: payload.messageId || message.messageId,
            result: {
              url: event.task.result.url,
              format: event.task.result.format,
              width: event.task.result.width,
              height: event.task.result.height,
            },
          };

          iframe.contentWindow?.postMessage(response, '*');
          console.log(`[ToolCommunication] Image generation success sent to ${message.toolId}`);
          subscription.unsubscribe();
        }
        // 任务失败
        else if (event.type === 'taskUpdated' && event.task.status === 'failed') {
          const response: GenerateImageResponse = {
            success: false,
            responseId: payload.messageId || message.messageId,
            error: event.task.error?.message || '图片生成失败',
          };

          iframe.contentWindow?.postMessage(response, '*');
          console.log(`[ToolCommunication] Image generation error sent to ${message.toolId}`);
          subscription.unsubscribe();
        }
      });

    } catch (error: any) {
      console.error(`[ToolCommunication] Image generation failed for ${message.toolId}:`, error);

      // 发送错误响应到 iframe
      const response: GenerateImageResponse = {
        success: false,
        responseId: payload.messageId || message.messageId,
        error: error.message || '图片生成失败',
      };

      const iframe = document.querySelector(
        `[data-element-id="${message.toolId}"] iframe`
      ) as HTMLIFrameElement;

      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage(response, '*');
        console.log(`[ToolCommunication] Image generation error sent to ${message.toolId}`);
      }
    }
  });
}

/**
 * 判断点是否命中工具元素的标题栏或边缘（用于拖动）
 * 现在只有点击标题栏才算命中，iframe 区域不算命中
 */
function isHitToolElement(element: PlaitTool, point: Point): boolean {
  const rect = RectangleClient.getRectangleByPoints(element.points);
  const [x, y] = point;

  // 检查点是否在元素矩形范围内
  if (
    x < rect.x ||
    x > rect.x + rect.width ||
    y < rect.y ||
    y > rect.y + rect.height
  ) {
    return false;
  }

  // 标题栏高度（与 tool.generator.ts 中一致）
  const TITLEBAR_HEIGHT = 36;

  // 边缘检测范围（用于resize）
  const EDGE_THRESHOLD = 8;

  // 判断是否在标题栏区域
  const inTitleBar = y >= rect.y && y <= rect.y + TITLEBAR_HEIGHT;

  // 判断是否在边缘区域（用于 resize）
  const nearLeftEdge = x >= rect.x && x <= rect.x + EDGE_THRESHOLD;
  const nearRightEdge = x >= rect.x + rect.width - EDGE_THRESHOLD && x <= rect.x + rect.width;
  const nearTopEdge = y >= rect.y && y <= rect.y + EDGE_THRESHOLD;
  const nearBottomEdge = y >= rect.y + rect.height - EDGE_THRESHOLD && y <= rect.y + rect.height;
  const nearEdge = nearLeftEdge || nearRightEdge || nearTopEdge || nearBottomEdge;

  // 只有点击标题栏或边缘时才算命中（允许拖动和 resize）
  // iframe 内容区域不算命中，让 iframe 可以正常交互
  return inTitleBar || nearEdge;
}

/**
 * 判断矩形选框是否命中工具元素
 */
function isRectangleHitToolElement(element: PlaitTool, selection: Selection): boolean {
  const rect = RectangleClient.getRectangleByPoints(element.points);
  const selectionRect = RectangleClient.getRectangleByPoints([
    selection.anchor,
    selection.focus,
  ]);
  return RectangleClient.isHit(rect, selectionRect);
}

/**
 * 工具插件
 *
 * 注册工具元素的渲染组件到 Plait 系统
 */
export const withTool: PlaitPlugin = (board: PlaitBoard) => {
  const {
    drawElement,
    getRectangle,
    isHit,
    isRectangleHit,
    isMovable,
    isAlign,
    getDeletedFragment,
    buildFragment,
    insertFragment,
  } = board;

  // 初始化通信服务
  const communicationService = new ToolCommunicationService(board);
  const communicationHelper = new ToolCommunicationHelper(communicationService);

  // 保存到 board 上以便外部访问
  (board as any).__toolCommunicationService = communicationService;
  (board as any).__toolCommunicationHelper = communicationHelper;

  // 注册通信处理器
  setupCommunicationHandlers(board, communicationHelper, communicationService);

  // 注册工具元素渲染组件
  board.drawElement = (context: PlaitPluginElementContext) => {
    if (context.element.type === 'tool') {
      return ToolComponent;
    }
    return drawElement(context);
  };

  // 注册 getRectangle 方法
  board.getRectangle = (element: PlaitElement) => {
    if (isToolElement(element)) {
      return RectangleClient.getRectangleByPoints((element as PlaitTool).points);
    }
    return getRectangle(element);
  };

  // 注册 isHit 方法 - 判断点击是否命中元素
  board.isHit = (element: PlaitElement, point: Point, isStrict?: boolean) => {
    if (isToolElement(element)) {
      return isHitToolElement(element, point);
    }
    return isHit(element, point, isStrict);
  };

  // 注册 isRectangleHit 方法 - 判断矩形选框是否命中元素
  board.isRectangleHit = (element: PlaitElement, selection: Selection) => {
    if (isToolElement(element)) {
      return isRectangleHitToolElement(element, selection);
    }
    return isRectangleHit(element, selection);
  };

  // 注册 isMovable 方法 - 工具元素可移动
  board.isMovable = (element: PlaitElement) => {
    if (isToolElement(element)) {
      return true;
    }
    return isMovable(element);
  };

  // 注册 isAlign 方法 - 工具元素可对齐
  board.isAlign = (element: PlaitElement) => {
    if (isToolElement(element)) {
      return true;
    }
    return isAlign(element);
  };

  // 注册 getDeletedFragment 方法 - 支持删除工具元素
  board.getDeletedFragment = (data: PlaitElement[]) => {
    const toolElements = getSelectedToolElements(board);
    if (toolElements.length) {
      data.push(...toolElements);
      console.log('Tool elements marked for deletion:', toolElements.length);
    }
    return getDeletedFragment(data);
  };

  // 注册 buildFragment 方法 - 支持复制工具元素
  board.buildFragment = (
    clipboardContext: WritableClipboardContext | null,
    rectangle: RectangleClient | null,
    operationType: WritableClipboardOperationType,
    originData?: PlaitElement[]
  ) => {
    const toolElements = getSelectedToolElements(board);
    if (toolElements.length) {
      const elements = buildClipboardData(
        board,
        toolElements,
        rectangle ? [rectangle.x, rectangle.y] : [0, 0]
      );
      clipboardContext = addOrCreateClipboardContext(clipboardContext, {
        text: '',
        type: WritableClipboardType.elements,
        elements,
      });
      console.log('Tool elements added to clipboard:', toolElements.length);
    }
    return buildFragment(clipboardContext, rectangle, operationType, originData);
  };

  // 注册 insertFragment 方法 - 支持粘贴工具元素
  board.insertFragment = (
    clipboardData: ClipboardData | null,
    targetPoint: Point,
    operationType?: WritableClipboardOperationType
  ) => {
    const toolElements = clipboardData?.elements?.filter((value) =>
      isToolElement(value)
    ) as PlaitTool[];
    if (toolElements && toolElements.length > 0) {
      insertClipboardData(board, toolElements, targetPoint);
      console.log('Tool elements pasted from clipboard:', toolElements.length);
    }
    insertFragment(clipboardData, targetPoint, operationType);
  };

  console.log('withTool plugin initialized');
  return board;
};

/**
 * 判断是否为工具元素
 */
export function isToolElement(element: any): element is PlaitTool {
  return element && element.type === 'tool';
}

/**
 * 获取当前选中的工具元素
 */
function getSelectedToolElements(board: PlaitBoard): PlaitTool[] {
  const selectedElements = getSelectedElements(board);
  return selectedElements.filter(isToolElement) as PlaitTool[];
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `tool_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * 工具元素操作 API
 *
 * 提供便捷的工具元素 CRUD 操作
 */
export const ToolTransforms = {
  /**
   * 插入工具到画布
   *
   * @param board - Plait 画板实例
   * @param toolId - 工具定义 ID
   * @param url - iframe URL
   * @param position - 插入位置（画布坐标）
   * @param size - 工具尺寸
   * @param metadata - 可选元数据
   * @returns 创建的工具元素
   */
  insertTool(
    board: PlaitBoard,
    toolId: string,
    url: string,
    position: Point,
    size: { width: number; height: number },
    metadata?: PlaitTool['metadata']
  ): PlaitTool {
    console.log('insertTool called with:', { position, size, toolId });

    // 验证输入参数
    if (!position || position.length !== 2) {
      console.error('Invalid position:', position);
      position = [0, 0];
    }
    if (!size || typeof size.width !== 'number' || typeof size.height !== 'number') {
      console.error('Invalid size:', size);
      size = { width: 400, height: 300 };
    }

    const toolElement: PlaitTool = {
      id: generateId(),
      type: 'tool',
      toolId,
      url,
      points: [
        position,
        [position[0] + size.width, position[1] + size.height],
      ],
      angle: 0,
      metadata,
    };

    console.log('Tool element created:', toolElement);

    // 插入到画板
    Transforms.insertNode(board, toolElement, [board.children.length]);

    console.log('Tool element inserted:', toolElement);
    return toolElement;
  },

  /**
   * 更新工具尺寸
   *
   * @param board - Plait 画板实例
   * @param element - 工具元素
   * @param newSize - 新尺寸
   */
  resizeTool(
    board: PlaitBoard,
    element: PlaitTool,
    newSize: { width: number; height: number }
  ): void {
    const [start] = element.points;
    const newElement: Partial<PlaitTool> = {
      points: [start, [start[0] + newSize.width, start[1] + newSize.height]],
    };

    const path = board.children.findIndex((el: any) => el.id === element.id);
    if (path >= 0) {
      Transforms.setNode(board, newElement, [path]);
      console.log('Tool element resized:', element.id);
    }
  },

  /**
   * 移动工具位置
   *
   * @param board - Plait 画板实例
   * @param element - 工具元素
   * @param newPosition - 新位置
   */
  moveTool(board: PlaitBoard, element: PlaitTool, newPosition: Point): void {
    const [start, end] = element.points;
    const width = Math.abs(end[0] - start[0]);
    const height = Math.abs(end[1] - start[1]);

    const newElement: Partial<PlaitTool> = {
      points: [
        newPosition,
        [newPosition[0] + width, newPosition[1] + height],
      ],
    };

    const path = board.children.findIndex((el: any) => el.id === element.id);
    if (path >= 0) {
      Transforms.setNode(board, newElement, [path]);
      console.log('Tool element moved:', element.id);
    }
  },

  /**
   * 旋转工具
   *
   * @param board - Plait 画板实例
   * @param element - 工具元素
   * @param angle - 旋转角度（度数）
   */
  rotateTool(board: PlaitBoard, element: PlaitTool, angle: number): void {
    const newElement: Partial<PlaitTool> = {
      angle,
    };

    const path = board.children.findIndex((el: any) => el.id === element.id);
    if (path >= 0) {
      Transforms.setNode(board, newElement, [path]);
      console.log('Tool element rotated:', element.id, angle);
    }
  },

  /**
   * 删除工具
   *
   * @param board - Plait 画板实例
   * @param elementId - 工具元素 ID
   */
  removeTool(board: PlaitBoard, elementId: string): void {
    const path = board.children.findIndex((el: any) => el.id === elementId);
    if (path >= 0) {
      Transforms.removeNode(board, [path]);
      console.log('Tool element removed:', elementId);
    }
  },

  /**
   * 更新工具 URL
   *
   * @param board - Plait 画板实例
   * @param elementId - 工具元素 ID
   * @param newUrl - 新的 URL
   */
  updateToolUrl(board: PlaitBoard, elementId: string, newUrl: string): void {
    const path = board.children.findIndex((el: any) => el.id === elementId);
    if (path >= 0) {
      Transforms.setNode(board, { url: newUrl } as Partial<PlaitTool>, [path]);
      console.log('Tool element URL updated:', elementId, newUrl);
    }
  },

  /**
   * 更新工具元数据
   *
   * @param board - Plait 画板实例
   * @param elementId - 工具元素 ID
   * @param metadata - 新的元数据
   */
  updateToolMetadata(
    board: PlaitBoard,
    elementId: string,
    metadata: Partial<PlaitTool['metadata']>
  ): void {
    const element = board.children.find((el: any) => el.id === elementId) as PlaitTool;
    if (element && element.type === 'tool') {
      const newMetadata = {
        ...element.metadata,
        ...metadata,
      };

      const path = board.children.findIndex((el: any) => el.id === elementId);
      if (path >= 0) {
        Transforms.setNode(
          board,
          { metadata: newMetadata } as Partial<PlaitTool>,
          [path]
        );
        console.log('Tool element metadata updated:', elementId);
      }
    }
  },

  /**
   * 获取所有工具元素
   *
   * @param board - Plait 画板实例
   * @returns 工具元素数组
   */
  getAllTools(board: PlaitBoard): PlaitTool[] {
    return board.children.filter((el: any) => el.type === 'tool') as PlaitTool[];
  },

  /**
   * 根据 ID 查找工具元素
   *
   * @param board - Plait 画板实例
   * @param elementId - 工具元素 ID
   * @returns 工具元素或 null
   */
  getToolById(board: PlaitBoard, elementId: string): PlaitTool | null {
    const element = board.children.find((el: any) => el.id === elementId);
    return element && isToolElement(element) ? element : null;
  },
};
