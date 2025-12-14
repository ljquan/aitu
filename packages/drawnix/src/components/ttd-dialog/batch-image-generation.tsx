/**
 * Batch Image Generation Component
 *
 * 批量图片生成组件 - Excel 式批量 AI 图片生成
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { MessagePlugin } from 'tdesign-react';
import { useI18n } from '../../i18n';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { TaskType, TaskStatus, Task } from '../../types/task.types';
import { geminiSettings } from '../../utils/settings-manager';
import './batch-image-generation.scss';

// 任务行数据
interface TaskRow {
  id: number;
  prompt: string;
  size: string;
  images: string[];
  count: number;
  // 预览相关 - 关联到任务队列的taskId
  taskIds: string[];   // 关联的任务队列ID列表（一行可能生成多个任务）
}

// 单元格位置
interface CellPosition {
  row: number;
  col: string;
}

// 尺寸选项
const SIZE_OPTIONS = ['1x1', '2x3', '3x2', '3x4', '4x3', '4x5', '5x4', '9x16', '16x9', '21x9'];

// 可编辑列
const EDITABLE_COLS = ['prompt', 'size', 'images', 'count', 'preview'];

interface BatchImageGenerationProps {
  onSwitchToSingle?: () => void;
}

const BatchImageGeneration: React.FC<BatchImageGenerationProps> = ({ onSwitchToSingle }) => {
  const { language } = useI18n();
  const { createTask, tasks: queueTasks } = useTaskQueue();

  // 任务数据
  const [tasks, setTasks] = useState<TaskRow[]>(() => {
    const initialTasks: TaskRow[] = [];
    for (let i = 0; i < 5; i++) {
      initialTasks.push({
        id: i + 1,
        prompt: '',
        size: '1x1',
        images: [],
        count: 1,
        taskIds: []
      });
    }
    return initialTasks;
  });

  const [taskIdCounter, setTaskIdCounter] = useState(6);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 选中状态
  const [activeCell, setActiveCell] = useState<CellPosition | null>(null);
  const [selectedCells, setSelectedCells] = useState<CellPosition[]>([]);
  const [editingCell, setEditingCell] = useState<CellPosition | null>(null);

  // 图片库
  const [imageLibrary, setImageLibrary] = useState<string[]>([]);
  const [isLibraryCollapsed, setIsLibraryCollapsed] = useState(false);

  // 填充拖拽
  const [isDraggingFill, setIsDraggingFill] = useState(false);
  const [fillStartCell, setFillStartCell] = useState<CellPosition | null>(null);
  const [fillPreviewRows, setFillPreviewRows] = useState<number[]>([]);

  // 批量导入设置
  const [imagesPerRow, setImagesPerRow] = useState<number>(1);
  const [showBatchImportModal, setShowBatchImportModal] = useState(false);
  const [pendingImportFiles, setPendingImportFiles] = useState<File[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchImportInputRef = useRef<HTMLInputElement>(null);

  // 添加行
  const addRows = useCallback((count: number) => {
    setTasks(prev => {
      const newTasks = [...prev];
      for (let i = 0; i < count; i++) {
        newTasks.push({
          id: taskIdCounter + i,
          prompt: '',
          size: '1x1',
          images: [],
          count: 1,
          taskIds: []
        });
      }
      return newTasks;
    });
    setTaskIdCounter(prev => prev + count);
  }, [taskIdCounter]);

  // 删除选中行
  const deleteSelected = useCallback(() => {
    if (selectedCells.length === 0) {
      MessagePlugin.warning(language === 'zh' ? '请先选择要删除的行' : 'Please select rows to delete');
      return;
    }

    const rowsToDelete = new Set(selectedCells.map(c => c.row));
    setTasks(prev => prev.filter((_, index) => !rowsToDelete.has(index)));
    setSelectedCells([]);
    setActiveCell(null);
  }, [selectedCells, language]);

  // 选中单元格
  const selectCell = useCallback((row: number, col: string) => {
    setActiveCell({ row, col });
    setSelectedCells([{ row, col }]);
    setEditingCell(null);
  }, []);

  // 进入编辑模式
  const enterEditMode = useCallback((row: number, col: string) => {
    selectCell(row, col);
    if (EDITABLE_COLS.includes(col) && col !== 'images') {
      setEditingCell({ row, col });
    }
  }, [selectCell]);

  // 更新单元格值
  const updateCellValue = useCallback((row: number, col: string, value: any) => {
    setTasks(prev => {
      const newTasks = [...prev];
      if (newTasks[row]) {
        (newTasks[row] as any)[col] = value;
      }
      return newTasks;
    });
  }, []);

  // 处理单元格点击
  const handleCellClick = useCallback((e: React.MouseEvent, row: number, col: string) => {
    if (e.shiftKey && activeCell) {
      // Shift + 点击：选择范围
      const minRow = Math.min(activeCell.row, row);
      const maxRow = Math.max(activeCell.row, row);
      const newSelected: CellPosition[] = [];
      for (let r = minRow; r <= maxRow; r++) {
        newSelected.push({ row: r, col: activeCell.col });
      }
      setSelectedCells(newSelected);
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl + 点击：添加到选区
      setSelectedCells(prev => {
        const exists = prev.some(c => c.row === row && c.col === col);
        if (exists) {
          return prev.filter(c => !(c.row === row && c.col === col));
        }
        return [...prev, { row, col }];
      });
    } else {
      selectCell(row, col);
    }
  }, [activeCell, selectCell]);

  // 处理双击进入编辑
  const handleCellDoubleClick = useCallback((row: number, col: string) => {
    enterEditMode(row, col);
  }, [enterEditMode]);

  // 批量填充列
  const fillColumn = useCallback((colName: string) => {
    if (!activeCell) {
      MessagePlugin.warning(language === 'zh' ? '请先选中一个单元格作为填充源' : 'Please select a cell as fill source');
      return;
    }

    const sourceValue = (tasks[activeCell.row] as any)?.[colName];
    if (sourceValue === undefined || sourceValue === null ||
        (typeof sourceValue === 'string' && sourceValue.trim() === '') ||
        (Array.isArray(sourceValue) && sourceValue.length === 0)) {
      MessagePlugin.warning(language === 'zh' ? '选中的单元格没有数据' : 'Selected cell has no data');
      return;
    }

    setTasks(prev => prev.map(task => ({
      ...task,
      [colName]: colName === 'images' && Array.isArray(sourceValue)
        ? [...sourceValue]
        : sourceValue
    })));

    MessagePlugin.success(language === 'zh' ? '已填充整列' : 'Column filled');
  }, [activeCell, tasks, language]);

  // 开始填充拖拽
  const startFillDrag = useCallback((row: number, col: string) => {
    setIsDraggingFill(true);
    setFillStartCell({ row, col });
  }, []);

  // 处理图片上传
  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target?.result as string;
        setImageLibrary(prev => [...prev, dataUrl]);
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // 从图片库添加图片到选中行
  const addImageToSelectedRows = useCallback((imageUrl: string) => {
    if (selectedCells.length === 0) {
      MessagePlugin.warning(language === 'zh' ? '请先选中要添加图片的行' : 'Please select rows first');
      return;
    }

    const selectedRows = [...new Set(selectedCells.map(c => c.row))];
    setTasks(prev => {
      const newTasks = [...prev];
      selectedRows.forEach(rowIndex => {
        if (newTasks[rowIndex] && !newTasks[rowIndex].images.includes(imageUrl)) {
          newTasks[rowIndex] = {
            ...newTasks[rowIndex],
            images: [...newTasks[rowIndex].images, imageUrl]
          };
        }
      });
      return newTasks;
    });
  }, [selectedCells, language]);

  // 从行中移除图片
  const removeImageFromRow = useCallback((rowIndex: number, imageUrl: string) => {
    setTasks(prev => {
      const newTasks = [...prev];
      if (newTasks[rowIndex]) {
        newTasks[rowIndex] = {
          ...newTasks[rowIndex],
          images: newTasks[rowIndex].images.filter(url => url !== imageUrl)
        };
      }
      return newTasks;
    });
  }, []);

  // 删除图片库中的图片
  const deleteLibraryImage = useCallback((index: number) => {
    setImageLibrary(prev => prev.filter((_, i) => i !== index));
  }, []);

  // 处理批量导入文件选择
  const handleBatchImportSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // 过滤出图片文件
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    if (imageFiles.length === 0) {
      MessagePlugin.warning(language === 'zh' ? '请选择图片文件' : 'Please select image files');
      return;
    }

    setPendingImportFiles(imageFiles);
    setShowBatchImportModal(true);

    // 清空 input
    if (batchImportInputRef.current) {
      batchImportInputRef.current.value = '';
    }
  }, [language]);

  // 执行批量导入
  const executeBatchImport = useCallback(async () => {
    if (pendingImportFiles.length === 0) return;

    const perRow = imagesPerRow;
    const totalImages = pendingImportFiles.length;
    const rowsNeeded = Math.ceil(totalImages / perRow);

    // 读取所有图片为 DataURL
    const imageDataUrls: string[] = [];
    for (const file of pendingImportFiles) {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve(ev.target?.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      imageDataUrls.push(dataUrl);
    }

    // 创建新行并分配图片
    setTasks(prev => {
      const newTasks = [...prev];
      let imageIndex = 0;

      for (let i = 0; i < rowsNeeded; i++) {
        const rowImages: string[] = [];
        for (let j = 0; j < perRow && imageIndex < totalImages; j++) {
          rowImages.push(imageDataUrls[imageIndex]);
          imageIndex++;
        }

        newTasks.push({
          id: taskIdCounter + i,
          prompt: '',
          size: '1x1',
          images: rowImages,
          count: 1,
          taskIds: []
        });
      }

      return newTasks;
    });

    setTaskIdCounter(prev => prev + rowsNeeded);

    // 同时添加到图片库
    setImageLibrary(prev => [...prev, ...imageDataUrls]);

    // 清理状态
    setPendingImportFiles([]);
    setShowBatchImportModal(false);

    MessagePlugin.success(
      language === 'zh'
        ? `已导入 ${totalImages} 张图片到 ${rowsNeeded} 行`
        : `Imported ${totalImages} images into ${rowsNeeded} rows`
    );
  }, [pendingImportFiles, imagesPerRow, taskIdCounter, language]);

  // 取消批量导入
  const cancelBatchImport = useCallback(() => {
    setPendingImportFiles([]);
    setShowBatchImportModal(false);
  }, []);

  // 获取行的关联任务状态
  const getRowTasksInfo = useCallback((taskRow: TaskRow): {
    status: 'idle' | 'generating' | 'completed' | 'failed' | 'partial';
    tasks: Task[];
    completedCount: number;
    failedCount: number;
  } => {
    if (taskRow.taskIds.length === 0) {
      return { status: 'idle', tasks: [], completedCount: 0, failedCount: 0 };
    }

    const relatedTasks = queueTasks.filter(t => taskRow.taskIds.includes(t.id));
    const completedCount = relatedTasks.filter(t => t.status === TaskStatus.COMPLETED).length;
    const failedCount = relatedTasks.filter(t => t.status === TaskStatus.FAILED).length;
    const processingCount = relatedTasks.filter(t =>
      t.status === TaskStatus.PENDING ||
      t.status === TaskStatus.PROCESSING ||
      t.status === TaskStatus.RETRYING
    ).length;

    let status: 'idle' | 'generating' | 'completed' | 'failed' | 'partial' = 'idle';
    if (processingCount > 0) {
      status = 'generating';
    } else if (failedCount > 0 && completedCount > 0) {
      status = 'partial';
    } else if (failedCount > 0) {
      status = 'failed';
    } else if (completedCount > 0) {
      status = 'completed';
    }

    return { status, tasks: relatedTasks, completedCount, failedCount };
  }, [queueTasks]);

  // 选择失败的行
  const selectFailedRows = useCallback(() => {
    const failedCells: CellPosition[] = [];
    tasks.forEach((task, rowIndex) => {
      const { status } = getRowTasksInfo(task);
      if (status === 'failed' || status === 'partial') {
        failedCells.push({ row: rowIndex, col: 'prompt' });
      }
    });

    if (failedCells.length === 0) {
      MessagePlugin.info(language === 'zh' ? '没有失败的行' : 'No failed rows');
      return;
    }

    setSelectedCells(failedCells);
    setActiveCell(failedCells[0]);
    MessagePlugin.success(
      language === 'zh'
        ? `已选中 ${failedCells.length} 个失败行`
        : `Selected ${failedCells.length} failed rows`
    );
  }, [tasks, getRowTasksInfo, language]);

  // 反选行
  const invertSelection = useCallback(() => {
    const currentSelectedRows = new Set(selectedCells.map(c => c.row));
    const newSelectedCells: CellPosition[] = [];

    tasks.forEach((_, rowIndex) => {
      if (!currentSelectedRows.has(rowIndex)) {
        newSelectedCells.push({ row: rowIndex, col: 'prompt' });
      }
    });

    setSelectedCells(newSelectedCells);
    if (newSelectedCells.length > 0) {
      setActiveCell(newSelectedCells[0]);
    } else {
      setActiveCell(null);
    }
  }, [tasks, selectedCells]);

  // 获取选中的行号集合
  const selectedRowSet = useMemo(() => {
    return new Set(selectedCells.map(c => c.row));
  }, [selectedCells]);

  // 切换单行选择
  const toggleRowSelection = useCallback((rowIndex: number) => {
    const isSelected = selectedRowSet.has(rowIndex);
    if (isSelected) {
      // 取消选择
      setSelectedCells(prev => prev.filter(c => c.row !== rowIndex));
      if (activeCell?.row === rowIndex) {
        setActiveCell(null);
      }
    } else {
      // 添加选择
      setSelectedCells(prev => [...prev, { row: rowIndex, col: 'prompt' }]);
      setActiveCell({ row: rowIndex, col: 'prompt' });
    }
  }, [selectedRowSet, activeCell]);

  // 全选/取消全选
  const toggleSelectAll = useCallback(() => {
    if (selectedRowSet.size === tasks.length) {
      // 全部取消
      setSelectedCells([]);
      setActiveCell(null);
    } else {
      // 全选
      const allCells = tasks.map((_, rowIndex) => ({ row: rowIndex, col: 'prompt' }));
      setSelectedCells(allCells);
      if (allCells.length > 0) {
        setActiveCell(allCells[0]);
      }
    }
  }, [tasks, selectedRowSet]);

  // 提交到任务队列 - 只提交选中的行
  const submitToQueue = useCallback(async () => {
    // 获取选中的行索引（去重）
    const selectedRowIndices = [...new Set(selectedCells.map(c => c.row))];

    // 如果没有选中行，提示用户
    if (selectedRowIndices.length === 0) {
      MessagePlugin.warning(language === 'zh' ? '请先选中要生成的行' : 'Please select rows to generate');
      return;
    }

    // 获取选中行中有提示词的任务
    const validTasks = selectedRowIndices
      .map(idx => ({ task: tasks[idx], rowIndex: idx }))
      .filter(({ task }) => task && task.prompt && task.prompt.trim() !== '');

    if (validTasks.length === 0) {
      MessagePlugin.warning(language === 'zh' ? '选中的行没有填写提示词' : 'Selected rows have no prompts');
      return;
    }

    setIsSubmitting(true);

    const settings = geminiSettings.get();
    const globalBatchTimestamp = Date.now();
    let subTaskCounter = 0;
    let submittedCount = 0;

    for (const { task, rowIndex } of validTasks) {
      const generateCount = task.count || 1;
      const batchId = `batch_${task.id}_${globalBatchTimestamp}`;

      const uploadedImages = task.images.map((url, index) => ({
        type: 'url',
        url,
        name: `reference_${index + 1}`
      }));

      const newTaskIds: string[] = [];

      for (let i = 0; i < generateCount; i++) {
        subTaskCounter++;

        const taskParams = {
          prompt: task.prompt.trim(),
          aspectRatio: task.size,
          model: settings.imageModelName || 'gemini-2.5-flash-image-vip',
          uploadedImages,
          batchId,
          batchIndex: i + 1,
          batchTotal: generateCount,
          globalIndex: subTaskCounter
        };

        const createdTask = createTask(taskParams, TaskType.IMAGE);
        if (createdTask) {
          submittedCount++;
          newTaskIds.push(createdTask.id);
        }
      }

      // 更新行的关联任务ID
      if (newTaskIds.length > 0) {
        setTasks(prev => {
          const newTasks = [...prev];
          if (newTasks[rowIndex]) {
            newTasks[rowIndex] = {
              ...newTasks[rowIndex],
              taskIds: [...newTasks[rowIndex].taskIds, ...newTaskIds]
            };
          }
          return newTasks;
        });
      }
    }

    setIsSubmitting(false);

    if (submittedCount > 0) {
      MessagePlugin.success(
        language === 'zh'
          ? `已提交 ${submittedCount} 个任务到队列`
          : `Submitted ${submittedCount} tasks to queue`
      );
    }
  }, [tasks, selectedCells, createTask, language]);

  // 键盘导航
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!activeCell || editingCell) return;

      const { row, col } = activeCell;
      const colIndex = EDITABLE_COLS.indexOf(col);

      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          if (row > 0) selectCell(row - 1, col);
          break;
        case 'ArrowDown':
          e.preventDefault();
          if (row < tasks.length - 1) selectCell(row + 1, col);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          if (colIndex > 0) selectCell(row, EDITABLE_COLS[colIndex - 1]);
          break;
        case 'ArrowRight':
          e.preventDefault();
          if (colIndex < EDITABLE_COLS.length - 1) selectCell(row, EDITABLE_COLS[colIndex + 1]);
          break;
        case 'Enter':
          e.preventDefault();
          if (col !== 'images') enterEditMode(row, col);
          break;
        case 'Escape':
          e.preventDefault();
          setEditingCell(null);
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [activeCell, editingCell, tasks.length, selectCell, enterEditMode]);

  // 渲染单元格内容
  const renderCellContent = (task: TaskRow, rowIndex: number, col: string) => {
    const isEditing = editingCell?.row === rowIndex && editingCell?.col === col;
    const isActive = activeCell?.row === rowIndex && activeCell?.col === col;
    const isSelected = selectedCells.some(c => c.row === rowIndex && c.col === col);

    const cellClassName = `excel-cell ${isActive ? 'active' : ''} ${isSelected ? 'selected' : ''}`;

    switch (col) {
      case 'prompt':
        return (
          <div
            className={cellClassName}
            onClick={(e) => handleCellClick(e, rowIndex, col)}
            onDoubleClick={() => handleCellDoubleClick(rowIndex, col)}
          >
            {isEditing ? (
              <textarea
                autoFocus
                value={task.prompt}
                onChange={(e) => updateCellValue(rowIndex, col, e.target.value)}
                onBlur={() => setEditingCell(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') setEditingCell(null);
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    setEditingCell(null);
                  }
                }}
              />
            ) : (
              <span className="cell-text">{task.prompt || ''}</span>
            )}
            {isActive && <div className="fill-handle" onMouseDown={() => startFillDrag(rowIndex, col)} />}
          </div>
        );

      case 'size':
        return (
          <div
            className={cellClassName}
            onClick={(e) => handleCellClick(e, rowIndex, col)}
            onDoubleClick={() => handleCellDoubleClick(rowIndex, col)}
          >
            {isEditing ? (
              <select
                autoFocus
                value={task.size}
                onChange={(e) => {
                  updateCellValue(rowIndex, col, e.target.value);
                  setEditingCell(null);
                }}
                onBlur={() => setEditingCell(null)}
              >
                {SIZE_OPTIONS.map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            ) : (
              <span className="cell-text">{task.size}</span>
            )}
            {isActive && <div className="fill-handle" onMouseDown={() => startFillDrag(rowIndex, col)} />}
          </div>
        );

      case 'images':
        return (
          <div
            className={cellClassName}
            onClick={(e) => handleCellClick(e, rowIndex, col)}
          >
            <div className="image-cell-content">
              {task.images.map((url, idx) => (
                <div key={idx} className="cell-image-thumb">
                  <img src={url} alt="" />
                  <button
                    className="remove-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeImageFromRow(rowIndex, url);
                    }}
                  >×</button>
                </div>
              ))}
              <button
                className="add-image-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  selectCell(rowIndex, col);
                  setIsLibraryCollapsed(false);
                }}
              >+</button>
            </div>
            {isActive && <div className="fill-handle" onMouseDown={() => startFillDrag(rowIndex, col)} />}
          </div>
        );

      case 'count':
        return (
          <div
            className={cellClassName}
            onClick={(e) => handleCellClick(e, rowIndex, col)}
            onDoubleClick={() => handleCellDoubleClick(rowIndex, col)}
          >
            {isEditing ? (
              <input
                type="number"
                autoFocus
                min={1}
                max={10}
                value={task.count}
                onChange={(e) => {
                  const val = Math.max(1, Math.min(10, parseInt(e.target.value) || 1));
                  updateCellValue(rowIndex, col, val);
                }}
                onBlur={() => setEditingCell(null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') {
                    setEditingCell(null);
                  }
                }}
              />
            ) : (
              <span className="cell-text">{task.count}</span>
            )}
            {isActive && <div className="fill-handle" onMouseDown={() => startFillDrag(rowIndex, col)} />}
          </div>
        );

      case 'preview':
        const rowInfo = getRowTasksInfo(task);
        return (
          <div
            className={`${cellClassName} preview-cell preview-${rowInfo.status}`}
            onClick={(e) => handleCellClick(e, rowIndex, col)}
          >
            {rowInfo.status === 'idle' && (
              <span className="preview-idle">-</span>
            )}
            {rowInfo.status === 'generating' && (
              <span className="preview-generating">
                <span className="loading-spinner" />
                {language === 'zh' ? '生成中...' : 'Generating...'}
              </span>
            )}
            {rowInfo.status === 'completed' && rowInfo.tasks.length > 0 && (
              <div className="preview-images">
                {rowInfo.tasks
                  .filter(t => t.status === TaskStatus.COMPLETED && t.result?.url)
                  .slice(0, 3)
                  .map((t, idx) => (
                    <div key={t.id} className="preview-thumb">
                      <img src={t.result!.url} alt={`Result ${idx + 1}`} />
                    </div>
                  ))}
                {rowInfo.completedCount > 3 && (
                  <span className="preview-more">+{rowInfo.completedCount - 3}</span>
                )}
              </div>
            )}
            {rowInfo.status === 'failed' && (
              <span className="preview-error" title={rowInfo.tasks[0]?.error?.message}>
                ❌ {language === 'zh' ? '失败' : 'Failed'}
              </span>
            )}
            {rowInfo.status === 'partial' && (
              <div className="preview-partial">
                <div className="preview-images">
                  {rowInfo.tasks
                    .filter(t => t.status === TaskStatus.COMPLETED && t.result?.url)
                    .slice(0, 2)
                    .map((t, idx) => (
                      <div key={t.id} className="preview-thumb">
                        <img src={t.result!.url} alt={`Result ${idx + 1}`} />
                      </div>
                    ))}
                </div>
                <span className="preview-partial-info">
                  ⚠️ {rowInfo.completedCount}/{rowInfo.tasks.length}
                </span>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="batch-image-generation">
      <div className="batch-main-content">
        {/* 工具栏 */}
        <div className="batch-toolbar">
          <div className="toolbar-left">
            <button className="btn btn-secondary" onClick={() => addRows(5)}>
              + {language === 'zh' ? '添加 5 行' : 'Add 5 Rows'}
            </button>
            <button className="btn btn-secondary" onClick={deleteSelected}>
              {language === 'zh' ? '删除选中' : 'Delete Selected'}
            </button>
            <span className="toolbar-divider">|</span>
            <button className="btn btn-secondary" onClick={selectFailedRows}>
              {language === 'zh' ? '选择失败行' : 'Select Failed'}
            </button>
            <button className="btn btn-secondary" onClick={invertSelection}>
              {language === 'zh' ? '反选' : 'Invert'}
            </button>
            <span className="toolbar-divider">|</span>
            <input
              ref={batchImportInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={handleBatchImportSelect}
              style={{ display: 'none' }}
            />
            <button className="btn btn-secondary" onClick={() => batchImportInputRef.current?.click()}>
              {language === 'zh' ? '📥 批量导入' : '📥 Batch Import'}
            </button>
          </div>
          <div className="toolbar-right">
            {onSwitchToSingle && (
              <button className="btn btn-text" onClick={onSwitchToSingle}>
                {language === 'zh' ? '← 返回单图模式' : '← Back to Single'}
              </button>
            )}
            <button
              className="btn btn-primary"
              onClick={submitToQueue}
              disabled={isSubmitting}
            >
              {isSubmitting
                ? (language === 'zh' ? '提交中...' : 'Submitting...')
                : (language === 'zh' ? '生成选中行' : 'Generate Selected')
              }
            </button>
          </div>
        </div>

        {/* 表格 */}
        <div className="excel-table-container">
          <table className="excel-table">
            <thead>
              <tr>
                <th className="col-checkbox">
                  <input
                    type="checkbox"
                    checked={tasks.length > 0 && selectedRowSet.size === tasks.length}
                    onChange={toggleSelectAll}
                    title={language === 'zh' ? '全选/取消全选' : 'Select All / Deselect All'}
                  />
                </th>
                <th className="row-number">#</th>
                <th className="col-prompt">
                  <div className="th-content">
                    {language === 'zh' ? '提示词' : 'Prompt'}
                    <button className="column-fill-btn" onClick={() => fillColumn('prompt')}>⬇</button>
                  </div>
                </th>
                <th className="col-size">
                  <div className="th-content">
                    {language === 'zh' ? '尺寸' : 'Size'}
                    <button className="column-fill-btn" onClick={() => fillColumn('size')}>⬇</button>
                  </div>
                </th>
                <th className="col-images">
                  <div className="th-content">
                    {language === 'zh' ? '参考图片' : 'Ref Images'}
                    <button className="column-fill-btn" onClick={() => fillColumn('images')}>⬇</button>
                  </div>
                </th>
                <th className="col-count">
                  <div className="th-content">
                    {language === 'zh' ? '数量' : 'Count'}
                    <button className="column-fill-btn" onClick={() => fillColumn('count')}>⬇</button>
                  </div>
                </th>
                <th className="col-preview">
                  <div className="th-content">
                    {language === 'zh' ? '预览' : 'Preview'}
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, rowIndex) => (
                <tr key={task.id} className={selectedRowSet.has(rowIndex) ? 'row-selected' : ''}>
                  <td className="col-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedRowSet.has(rowIndex)}
                      onChange={() => toggleRowSelection(rowIndex)}
                    />
                  </td>
                  <td className="row-number">{rowIndex + 1}</td>
                  <td>{renderCellContent(task, rowIndex, 'prompt')}</td>
                  <td>{renderCellContent(task, rowIndex, 'size')}</td>
                  <td>{renderCellContent(task, rowIndex, 'images')}</td>
                  <td>{renderCellContent(task, rowIndex, 'count')}</td>
                  <td>{renderCellContent(task, rowIndex, 'preview')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="hint-text">
          {language === 'zh'
            ? '提示：双击编辑 | 方向键导航 | Shift+点击多选 | 点击 + 添加参考图'
            : 'Tip: Double-click to edit | Arrow keys to navigate | Shift+click to multi-select'
          }
        </p>
      </div>

      {/* 图片库侧栏 */}
      <div className={`image-library-sidebar ${isLibraryCollapsed ? 'collapsed' : ''}`}>
        <div className="library-header">
          <h3>{language === 'zh' ? '图片库' : 'Image Library'}</h3>
          <button className="toggle-btn" onClick={() => setIsLibraryCollapsed(!isLibraryCollapsed)}>
            {isLibraryCollapsed ? '▶' : '◀'}
          </button>
        </div>
        {!isLibraryCollapsed && (
          <div className="library-content">
            <div className="upload-section">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />
              <button className="upload-btn" onClick={() => fileInputRef.current?.click()}>
                {language === 'zh' ? '📤 上传图片' : '📤 Upload'}
              </button>
            </div>
            <div className="library-grid">
              {imageLibrary.length === 0 ? (
                <div className="empty-library">
                  {language === 'zh' ? '暂无图片，请上传' : 'No images, please upload'}
                </div>
              ) : (
                imageLibrary.map((url, index) => (
                  <div key={index} className="library-image" onClick={() => addImageToSelectedRows(url)}>
                    <img src={url} alt="" />
                    <button
                      className="delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteLibraryImage(index);
                      }}
                    >×</button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* 批量导入弹窗 */}
      {showBatchImportModal && (
        <div className="batch-import-modal-overlay" onClick={cancelBatchImport}>
          <div className="batch-import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{language === 'zh' ? '批量导入图片' : 'Batch Import Images'}</h3>
              <button className="close-btn" onClick={cancelBatchImport}>×</button>
            </div>
            <div className="modal-body">
              <p className="import-info">
                {language === 'zh'
                  ? `已选择 ${pendingImportFiles.length} 张图片`
                  : `${pendingImportFiles.length} images selected`
                }
              </p>

              <div className="images-per-row-setting">
                <label>{language === 'zh' ? '每行图片数：' : 'Images per row:'}</label>
                <div className="per-row-options">
                  {[1, 2, 3, 4, 5].map(num => (
                    <button
                      key={num}
                      className={`per-row-btn ${imagesPerRow === num ? 'active' : ''}`}
                      onClick={() => setImagesPerRow(num)}
                    >
                      {num}
                    </button>
                  ))}
                </div>
              </div>

              <p className="import-preview">
                {language === 'zh'
                  ? `将创建 ${Math.ceil(pendingImportFiles.length / imagesPerRow)} 行，每行 ${imagesPerRow} 张图片`
                  : `Will create ${Math.ceil(pendingImportFiles.length / imagesPerRow)} rows with ${imagesPerRow} image(s) each`
                }
              </p>

              {/* 图片预览 */}
              <div className="import-preview-grid">
                {pendingImportFiles.slice(0, 12).map((file, index) => (
                  <div key={index} className="preview-item">
                    <img src={URL.createObjectURL(file)} alt="" />
                  </div>
                ))}
                {pendingImportFiles.length > 12 && (
                  <div className="preview-more">
                    +{pendingImportFiles.length - 12}
                  </div>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={cancelBatchImport}>
                {language === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button className="btn btn-primary" onClick={executeBatchImport}>
                {language === 'zh' ? '确认导入' : 'Import'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BatchImageGeneration;
