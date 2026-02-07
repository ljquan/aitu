/**
 * FeedbackButton Component
 *
 * A circular feedback button positioned at the bottom-right of the canvas.
 * Shows a QR code image on click for user feedback.
 */

import React, { useEffect, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '../popover/popover';
import { useBoard } from '@plait-board/react-board';
import { PlaitBoard } from '@plait/core';
import { Z_INDEX } from '../../constants/z-index';
import { WeComIcon } from '../icons';
import { ToolButton } from '../tool-button';
import './feedback-button.scss';

const QR_CODE_URL = 'https://tuziai.oss-cn-shenzhen.aliyuncs.com/aitu/AiTu.png';
const SERVICE_QR_CODE_URL = 'https://tuziai.oss-cn-shenzhen.aliyuncs.com/linkme.png';

export const FeedbackButton: React.FC = () => {
  const board = useBoard();
  const container = PlaitBoard.getBoardContainer(board);
  const [open, setOpen] = useState(false);

  // 预加载图片
  useEffect(() => {
    const img1 = new Image();
    img1.src = QR_CODE_URL;
    const img2 = new Image();
    img2.src = SERVICE_QR_CODE_URL;
  }, []);

  return (
    <Popover placement="right-end" sideOffset={12} open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <ToolButton
          type="icon"
          icon={<WeComIcon />}
          aria-label="用户反馈群"
          title="用户反馈群"
          tooltipPlacement="right"
          selected={open}
          visible={true}
          data-track="toolbar_click_feedback"
          onPointerDown={(e) => {
            e.event.stopPropagation();
          }}
          onClick={() => setOpen(!open)}
        />
      </PopoverTrigger>
      <PopoverContent container={container} style={{ zIndex: Z_INDEX.POPOVER_FEEDBACK }}>
        <div className="feedback-qrcode-content">
          <div className="feedback-qrcode-grid">
            <div className="feedback-qrcode-item">
              <img
                src={QR_CODE_URL}
                alt="用户反馈群二维码"
                className="feedback-qrcode-image"
              />
              <div className="feedback-qrcode-text">用户反馈群</div>
            </div>
            {/* <div className="feedback-qrcode-item">
              <img
                src={SERVICE_QR_CODE_URL}
                alt="客服二维码"
                className="feedback-qrcode-image"
              />
              <div className="feedback-qrcode-text">客服</div>
            </div> */}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
