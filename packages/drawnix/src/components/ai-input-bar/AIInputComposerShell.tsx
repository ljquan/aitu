import React from 'react';
import classNames from 'classnames';

export type AIInputComposerVariant = 'canvas' | 'drawer';

export interface AIInputComposerShellProps {
  variant?: AIInputComposerVariant;
  expanded?: boolean;
  longText?: boolean;
  disabled?: boolean;
  className?: string;
  preview?: React.ReactNode;
  textarea: React.ReactNode;
  leftTools?: React.ReactNode;
  controls?: React.ReactNode;
  sendButton: React.ReactNode;
  onDragEnter?: React.DragEventHandler<HTMLDivElement>;
  onDragOver?: React.DragEventHandler<HTMLDivElement>;
  onDragLeave?: React.DragEventHandler<HTMLDivElement>;
  onDrop?: React.DragEventHandler<HTMLDivElement>;
}

export const AIInputComposerShell: React.FC<AIInputComposerShellProps> = ({
  variant = 'canvas',
  expanded = false,
  longText = false,
  disabled = false,
  className,
  preview,
  textarea,
  leftTools,
  controls,
  sendButton,
  onDragEnter,
  onDragOver,
  onDragLeave,
  onDrop,
}) => {
  return (
    <div
      className={classNames(
        'ai-input-bar__container',
        'ai-input-composer-shell',
        `ai-input-composer-shell--${variant}`,
        {
          'ai-input-bar__container--expanded': expanded,
          'ai-input-composer-shell--expanded': expanded,
          'ai-input-composer-shell--disabled': disabled,
        },
        className
      )}
      aria-disabled={disabled || undefined}
      data-testid={`ai-input-composer-shell-${variant}`}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div className="ai-input-bar__bottom-bar ai-input-composer-shell__bottom-bar">
        {leftTools ? (
          <div className="ai-input-bar__bottom-start ai-input-composer-shell__bottom-start">
            {leftTools}
          </div>
        ) : null}

        {controls ? (
          <div className="ai-input-bar__bottom-controls ai-input-composer-shell__bottom-controls">
            {controls}
          </div>
        ) : null}

        {sendButton}
      </div>

      <div
        className={classNames(
          'ai-input-bar__input-area',
          'ai-input-composer-shell__input-area',
          {
            'ai-input-bar__input-area--expanded': expanded,
            'ai-input-bar__input-area--long-text': longText,
            'ai-input-composer-shell__input-area--expanded': expanded,
            'ai-input-composer-shell__input-area--long-text': longText,
          }
        )}
      >
        {preview ? (
          <div className="ai-input-bar__content-preview ai-input-composer-shell__preview">
            {preview}
          </div>
        ) : null}

        <div className="ai-input-bar__prompt-row ai-input-composer-shell__prompt-row">
          {textarea}
        </div>
      </div>
    </div>
  );
};

export default AIInputComposerShell;
