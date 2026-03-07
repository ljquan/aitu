import React, { useState, useCallback } from 'react';
import { Checkbox, Tooltip } from 'tdesign-react';

interface AutoInsertCheckboxProps {
  storageKey: string;
  language: 'zh' | 'en' | string;
}

export const AutoInsertCheckbox: React.FC<AutoInsertCheckboxProps> = ({
  storageKey,
  language,
}) => {
  const [checked, setChecked] = useState(() => {
    try {
      return localStorage.getItem(storageKey) !== 'false';
    } catch {
      return true;
    }
  });

  const handleChange = useCallback((val: boolean) => {
    setChecked(val);
    try {
      localStorage.setItem(storageKey, String(val));
    } catch {
      // localStorage not available
    }
  }, [storageKey]);

  return (
    <Tooltip
      content={language === 'zh' ? '生成后自动插入画布' : 'Auto insert to canvas after generation'}
      theme="light"
    >
      <Checkbox
        checked={checked}
        onChange={handleChange}
        className="auto-insert-checkbox"
      />
    </Tooltip>
  );
};

/**
 * 读取自动插入画布的设置值
 */
export function getAutoInsertValue(storageKey: string): boolean {
  try {
    return localStorage.getItem(storageKey) !== 'false';
  } catch {
    return true;
  }
}
