/**
 * Batch Image Generation Component
 *
 * 批量图片生成组件 - Excel 式批量 AI 图片生成
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { MessagePlugin } from 'tdesign-react';
import { useI18n } from '../../i18n';
import { useTaskQueue } from '../../hooks/useTaskQueue';
import { TaskType } from '../../types/task.types';
import { geminiSettings } from '../../utils/settings-manager';
import './batch-image-generation.scss';

// 任务行数据
interface TaskRow {
  id: number;
  prompt: string;
  size: string;
  images: string[];
  count: number;
}

// 单元格位置
interface CellPosition {
  row: number;
  col: string;
}

// 尺寸选项
const SIZE_OPTIONS = ['1x1', '2x3', '3x2', '3x4', '4x3', '4x5', '5x4', '9x16', '16x9', '21x9'];

// 可编辑列
const EDITABLE_COLS = ['prompt', 'size', 'images', 'count'];

interface BatchImageGenerationProps {
  onSwitchToSingle?: () => void;
}

const BatchImageGeneration: React.FC<BatchImageGenerationProps> = ({ onSwitchToSingle }) => {
  const { language } = useI18n();
  const { createTask } = useTaskQueue();

  // 任务数据
  const [tasks, setTasks] = useState<TaskRow[]>(() => {
    const initialTasks: TaskRow[] = [];
    for (let i = 0; i < 5; i++) {
      initialTasks.push({
        id: i + 1,
        prompt: '',
        size: '1x1',
        images: [],
        count: 1
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

  const fileInputRef = useRef<HTMLInputElement>(null);

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
          count: 1
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

  // 提交到任务队列
  const submitToQueue = useCallback(async () => {
    const validTasks = tasks.filter(t => t.prompt && t.prompt.trim() !== '');
    if (validTasks.length === 0) {
      MessagePlugin.warning(language === 'zh' ? '请至少填写一行提示词' : 'Please fill at least one prompt');
      return;
    }

    setIsSubmitting(true);

    const settings = geminiSettings.get();
    const globalBatchTimestamp = Date.now();
    let subTaskCounter = 0;
    let submittedCount = 0;

    for (const task of validTasks) {
      const generateCount = task.count || 1;
      const batchId = `batch_${task.id}_${globalBatchTimestamp}`;

      const uploadedImages = task.images.map((url, index) => ({
        type: 'url',
        url,
        name: `reference_${index + 1}`
      }));

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
        }
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
  }, [tasks, createTask, language]);

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
                : (language === 'zh' ? '提交到任务队列' : 'Submit to Queue')
              }
            </button>
          </div>
        </div>

        {/* 表格 */}
        <div className="excel-table-container">
          <table className="excel-table">
            <thead>
              <tr>
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
              </tr>
            </thead>
            <tbody>
              {tasks.map((task, rowIndex) => (
                <tr key={task.id}>
                  <td className="row-number">{rowIndex + 1}</td>
                  <td>{renderCellContent(task, rowIndex, 'prompt')}</td>
                  <td>{renderCellContent(task, rowIndex, 'size')}</td>
                  <td>{renderCellContent(task, rowIndex, 'images')}</td>
                  <td>{renderCellContent(task, rowIndex, 'count')}</td>
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
    </div>
  );
};

export default BatchImageGeneration;
