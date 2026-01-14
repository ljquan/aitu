/**
 * HEX 输入组件
 * 支持手动输入 HEX 颜色值，附带透明度百分比输入
 */

import React, { useState, useCallback, useEffect } from 'react';
import type { HexInputProps } from './types';
import { isValidHex, normalizeHex } from './utils';

export const HexInput: React.FC<HexInputProps> = ({
  value,
  alpha,
  onColorChange,
  onAlphaChange,
  showAlpha = true,
  disabled = false,
}) => {
  // 内部输入状态（用于编辑时不立即触发变更）
  const [hexInput, setHexInput] = useState(value.replace('#', ''));
  const [alphaInput, setAlphaInput] = useState(String(alpha));

  // 同步外部值变化
  useEffect(() => {
    setHexInput(value.replace('#', ''));
  }, [value]);

  useEffect(() => {
    setAlphaInput(String(alpha));
  }, [alpha]);

  // 处理 HEX 输入变化
  const handleHexChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value.replace('#', '').toUpperCase();
    // 只允许有效的 HEX 字符
    const filtered = inputValue.replace(/[^0-9A-F]/gi, '').substring(0, 6);
    setHexInput(filtered);
  }, []);

  // 处理 HEX 输入失焦
  const handleHexBlur = useCallback(() => {
    const hexValue = `#${hexInput}`;
    if (isValidHex(hexValue)) {
      const normalized = normalizeHex(hexValue);
      onColorChange(normalized);
      setHexInput(normalized.replace('#', ''));
    } else {
      // 恢复为当前有效值
      setHexInput(value.replace('#', ''));
    }
  }, [hexInput, value, onColorChange]);

  // 处理 HEX 输入回车
  const handleHexKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleHexBlur();
    }
  }, [handleHexBlur]);

  // 处理透明度输入变化
  const handleAlphaChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const inputValue = e.target.value;
    // 只允许数字
    const filtered = inputValue.replace(/[^0-9]/g, '');
    setAlphaInput(filtered);
  }, []);

  // 处理透明度输入失焦
  const handleAlphaBlur = useCallback(() => {
    let numValue = parseInt(alphaInput, 10);
    if (isNaN(numValue)) {
      numValue = alpha;
    } else {
      numValue = Math.max(0, Math.min(100, numValue));
    }
    setAlphaInput(String(numValue));
    onAlphaChange(numValue);
  }, [alphaInput, alpha, onAlphaChange]);

  // 处理透明度输入回车
  const handleAlphaKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleAlphaBlur();
    }
  }, [handleAlphaBlur]);

  return (
    <div className="ucp-hex-input">
      {/* HEX 输入 */}
      <div className="ucp-hex-input__hex-group">
        <span className="ucp-hex-input__prefix">#</span>
        <input
          type="text"
          className="ucp-hex-input__input"
          value={hexInput}
          onChange={handleHexChange}
          onBlur={handleHexBlur}
          onKeyDown={handleHexKeyDown}
          disabled={disabled}
          maxLength={6}
          placeholder="000000"
        />
      </div>

      {/* 透明度输入 */}
      {showAlpha && (
        <div className="ucp-hex-input__alpha-group">
          <input
            type="text"
            className="ucp-hex-input__alpha-input"
            value={alphaInput}
            onChange={handleAlphaChange}
            onBlur={handleAlphaBlur}
            onKeyDown={handleAlphaKeyDown}
            disabled={disabled}
            maxLength={3}
            placeholder="100"
          />
          <span className="ucp-hex-input__suffix">%</span>
        </div>
      )}
    </div>
  );
};

export default HexInput;
