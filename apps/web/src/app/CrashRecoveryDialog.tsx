/**
 * Crash Recovery Dialog
 * 崩溃恢复对话框
 *
 * 当检测到页面连续崩溃时显示，让用户选择：
 * 1. 进入安全模式（空白画布）
 * 2. 忽略并正常加载
 */

import React from 'react';

export interface CrashRecoveryDialogProps {
  /** 崩溃次数 */
  crashCount: number;
  /** 内存信息 */
  memoryInfo: { used: string; limit: string; percent: number } | null;
  /** 选择安全模式 */
  onUseSafeMode: () => void;
  /** 忽略并正常加载 */
  onIgnore: () => void;
}

export const CrashRecoveryDialog: React.FC<CrashRecoveryDialogProps> = ({
  crashCount,
  memoryInfo,
  onUseSafeMode,
  onIgnore,
}) => {
  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
      }}
    >
      <div
        style={{
          backgroundColor: 'white',
          borderRadius: '12px',
          padding: '32px',
          maxWidth: '480px',
          width: '90%',
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
        }}
      >
        {/* 图标 */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: '#FFF3E0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 24px',
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#F57C00"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>

        {/* 标题 */}
        <h2
          style={{
            margin: '0 0 16px',
            fontSize: '20px',
            fontWeight: 600,
            textAlign: 'center',
            color: '#1a1a1a',
          }}
        >
          检测到页面异常退出
        </h2>

        {/* 说明 */}
        <p
          style={{
            margin: '0 0 24px',
            fontSize: '14px',
            color: '#666',
            textAlign: 'center',
            lineHeight: 1.6,
          }}
        >
          页面已连续 {crashCount} 次未能正常加载，可能是因为：
          <br />
          • 画布元素过多导致内存不足
          <br />
          • 浏览器内存限制
          <br />
          <br />
          建议使用「安全模式」创建空白画布，稍后可从侧边栏切换到其他画布。
        </p>

        {/* 内存信息 */}
        {memoryInfo && (
          <div
            style={{
              backgroundColor: '#f5f5f5',
              borderRadius: '8px',
              padding: '12px 16px',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                fontSize: '12px',
                color: '#888',
                marginBottom: '8px',
              }}
            >
              当前内存使用情况
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span style={{ fontSize: '14px', color: '#333' }}>
                {memoryInfo.used} / {memoryInfo.limit}
              </span>
              <span
                style={{
                  fontSize: '14px',
                  fontWeight: 500,
                  color: memoryInfo.percent > 75 ? '#E53935' : memoryInfo.percent > 50 ? '#FB8C00' : '#43A047',
                }}
              >
                {memoryInfo.percent.toFixed(0)}%
              </span>
            </div>
            {/* 进度条 */}
            <div
              style={{
                height: '4px',
                backgroundColor: '#e0e0e0',
                borderRadius: '2px',
                marginTop: '8px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  height: '100%',
                  width: `${Math.min(memoryInfo.percent, 100)}%`,
                  backgroundColor: memoryInfo.percent > 75 ? '#E53935' : memoryInfo.percent > 50 ? '#FB8C00' : '#43A047',
                  transition: 'width 0.3s ease',
                }}
              />
            </div>
          </div>
        )}

        {/* 按钮 */}
        <div
          style={{
            display: 'flex',
            gap: '12px',
          }}
        >
          <button
            onClick={onIgnore}
            style={{
              flex: 1,
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 500,
              color: '#666',
              backgroundColor: '#f5f5f5',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#e8e8e8';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#f5f5f5';
            }}
          >
            继续加载
          </button>
          <button
            onClick={onUseSafeMode}
            style={{
              flex: 1,
              padding: '12px 24px',
              fontSize: '14px',
              fontWeight: 500,
              color: 'white',
              backgroundColor: '#F39C12',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.backgroundColor = '#E67E22';
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.backgroundColor = '#F39C12';
            }}
          >
            安全模式
          </button>
        </div>

        {/* 提示 */}
        <p
          style={{
            margin: '16px 0 0',
            fontSize: '12px',
            color: '#999',
            textAlign: 'center',
          }}
        >
          也可以通过 URL 参数 ?safe=1 直接进入安全模式
        </p>
      </div>
    </div>
  );
};

export default CrashRecoveryDialog;
