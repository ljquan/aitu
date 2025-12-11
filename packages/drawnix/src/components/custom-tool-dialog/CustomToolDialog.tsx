/**
 * Custom Tool Dialog
 *
 * 自定义工具添加对话框
 * 提供表单用于添加新的自定义工具
 */

import React, { useState, useCallback } from 'react';
import {
  Dialog,
  Form,
  Input,
  Textarea,
  Select,
  Button,
  MessagePlugin,
} from 'tdesign-react';
import { ToolDefinition, ToolCategory } from '../../types/toolbox.types';
import { toolboxService } from '../../services/toolbox-service';
import './custom-tool-dialog.scss';

const { FormItem } = Form;
const { Option } = Select;

export interface CustomToolDialogProps {
  /** 对话框是否可见 */
  visible: boolean;
  /** 关闭回调 */
  onClose: () => void;
  /** 添加成功回调 */
  onSuccess?: (tool: ToolDefinition) => void;
}

// Emoji 预设列表
const EMOJI_PRESETS = [
  '🔧', '🛠️', '⚙️', '🔨', '🎨', '✏️', '📝', '📊',
  '📈', '📉', '🎯', '🎪', '🎭', '🎬', '📷', '🖼️',
  '🌟', '⭐', '✨', '💡', '🔮', '🎲', '🎮', '🕹️',
];

// 分类选项
const CATEGORY_OPTIONS = [
  { value: ToolCategory.AI_TOOLS, label: 'AI 工具' },
  { value: ToolCategory.CONTENT_TOOLS, label: '内容工具' },
  { value: ToolCategory.UTILITIES, label: '实用工具' },
  { value: ToolCategory.CUSTOM, label: '自定义' },
];

/**
 * 自定义工具对话框组件
 */
export const CustomToolDialog: React.FC<CustomToolDialogProps> = ({
  visible,
  onClose,
  onSuccess,
}) => {
  // 表单状态
  const [formData, setFormData] = useState<Partial<ToolDefinition>>({
    name: '',
    url: '',
    description: '',
    icon: '🔧',
    category: ToolCategory.CUSTOM,
    defaultWidth: 800,
    defaultHeight: 600,
  });

  const [loading, setLoading] = useState(false);

  // 更新表单字段
  const updateField = useCallback((field: keyof ToolDefinition, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  // 验证表单
  const validateForm = useCallback((): string | null => {
    if (!formData.name || formData.name.trim().length === 0) {
      return '请输入工具名称';
    }

    if (formData.name.length > 50) {
      return '工具名称不能超过 50 个字符';
    }

    if (!formData.url || formData.url.trim().length === 0) {
      return '请输入工具 URL';
    }

    // URL 格式验证
    try {
      const url = new URL(formData.url);
      if (!['https:', 'http:'].includes(url.protocol)) {
        return '只允许使用 HTTP/HTTPS 协议';
      }
    } catch (e) {
      return 'URL 格式不正确';
    }

    if (formData.description && formData.description.length > 200) {
      return '工具描述不能超过 200 个字符';
    }

    return null;
  }, [formData]);

  // 提交表单
  const handleSubmit = useCallback(async () => {
    // 验证表单
    const error = validateForm();
    if (error) {
      MessagePlugin.warning(error);
      return;
    }

    setLoading(true);

    try {
      // 添加自定义工具
      await toolboxService.addCustomTool(formData as ToolDefinition);

      MessagePlugin.success('工具添加成功！');

      // 重置表单
      setFormData({
        name: '',
        url: '',
        description: '',
        icon: '🔧',
        category: ToolCategory.CUSTOM,
        defaultWidth: 800,
        defaultHeight: 600,
      });

      // 调用成功回调
      if (onSuccess) {
        onSuccess(formData as ToolDefinition);
      }

      // 关闭对话框
      onClose();
    } catch (error) {
      console.error('Failed to add custom tool:', error);
      MessagePlugin.error(
        error instanceof Error ? error.message : '添加工具失败，请重试'
      );
    } finally {
      setLoading(false);
    }
  }, [formData, validateForm, onSuccess, onClose]);

  // 取消操作
  const handleCancel = useCallback(() => {
    // 重置表单
    setFormData({
      name: '',
      url: '',
      description: '',
      icon: '🔧',
      category: ToolCategory.CUSTOM,
      defaultWidth: 800,
      defaultHeight: 600,
    });
    onClose();
  }, [onClose]);

  return (
    <Dialog
      visible={visible}
      header="添加自定义工具"
      onClose={handleCancel}
      width={520}
      footer={
        <div className="custom-tool-dialog__footer">
          <Button onClick={handleCancel} disabled={loading}>
            取消
          </Button>
          <Button
            theme="primary"
            onClick={handleSubmit}
            loading={loading}
            disabled={loading}
          >
            添加
          </Button>
        </div>
      }
    >
      <Form className="custom-tool-dialog__form" labelWidth={80}>
        <FormItem label="工具名称 *">
          <Input
            value={formData.name}
            onChange={(value) => updateField('name', value)}
            placeholder="例如：香蕉提示词"
            maxlength={50}
          />
        </FormItem>

        <FormItem label="工具 URL *">
          <Input
            value={formData.url}
            onChange={(value) => updateField('url', value)}
            placeholder="https://example.com"
          />
        </FormItem>

        <FormItem label="工具描述">
          <Textarea
            value={formData.description}
            onChange={(value) => updateField('description', value)}
            placeholder="简要描述工具的功能（可选）"
            maxlength={200}
            autosize={{ minRows: 2, maxRows: 4 }}
          />
        </FormItem>

        <FormItem label="工具图标">
          <div className="custom-tool-dialog__icon-picker">
            <div className="custom-tool-dialog__icon-preview">
              {formData.icon}
            </div>
            <div className="custom-tool-dialog__icon-list">
              {EMOJI_PRESETS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className={`custom-tool-dialog__icon-option ${
                    formData.icon === emoji ? 'active' : ''
                  }`}
                  onClick={() => updateField('icon', emoji)}
                  title={emoji}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>
        </FormItem>

        <FormItem label="分类">
          <Select
            value={formData.category}
            onChange={(value) => updateField('category', value)}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <Option key={option.value} value={option.value} label={option.label}>
                {option.label}
              </Option>
            ))}
          </Select>
        </FormItem>

        <FormItem label="默认宽度">
          <Input
            type="number"
            value={String(formData.defaultWidth)}
            onChange={(value) => updateField('defaultWidth', Number(value))}
            placeholder="800"
          />
        </FormItem>

        <FormItem label="默认高度">
          <Input
            type="number"
            value={String(formData.defaultHeight)}
            onChange={(value) => updateField('defaultHeight', Number(value))}
            placeholder="600"
          />
        </FormItem>
      </Form>
    </Dialog>
  );
};
