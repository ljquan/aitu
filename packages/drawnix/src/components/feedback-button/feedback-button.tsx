/**
 * FeedbackButton Component
 *
 * A circular feedback button positioned at the bottom-right of the canvas.
 * Shows a QR code image on click for user feedback.
 */

import React, { useEffect } from 'react';
import { ChatIcon } from 'tdesign-icons-react';
import { Popover, PopoverContent, PopoverTrigger } from '../popover/popover';
import { useBoard } from '@plait-board/react-board';
import { PlaitBoard } from '@plait/core';
import './feedback-button.scss';

const QR_CODE_URL = '/logo/group-qr.png';

export const FeedbackButton: React.FC = () => {
  const board = useBoard();
  const container = PlaitBoard.getBoardContainer(board);

  // 预加载图片
  useEffect(() => {
    const img = new Image();
    img.src = QR_CODE_URL;
  }, []);

  return (
    <div className="feedback-button-container">
      <Popover placement="right-end" sideOffset={12}>
        <PopoverTrigger asChild>
          <button className="feedback-button">
            <ChatIcon size={22} />
          </button>
        </PopoverTrigger>
        <PopoverContent container={container} style={{ zIndex: 1000 }}>
          <div className="feedback-qrcode-content">
            <img
              src={QR_CODE_URL}
              alt="意见反馈二维码"
              className="feedback-qrcode-image"
            />
            <div className="feedback-qrcode-text">扫码反馈意见</div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
