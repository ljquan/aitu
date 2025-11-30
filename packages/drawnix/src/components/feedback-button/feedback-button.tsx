/**
 * FeedbackButton Component
 *
 * A circular feedback button positioned at the bottom-right of the canvas.
 * Shows a QR code image on hover for user feedback.
 */

import React, { useState, useEffect } from 'react';
import { ChatIcon } from 'tdesign-icons-react';
import './feedback-button.scss';

const QR_CODE_URL = '/logo/cardid.jpg';

export const FeedbackButton: React.FC = () => {
  const [isHovered, setIsHovered] = useState(false);

  // 预加载图片
  useEffect(() => {
    const img = new Image();
    img.src = QR_CODE_URL;
  }, []);

  return (
    <div
      className="feedback-button-container"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="feedback-button">
        <ChatIcon size={22} />
      </div>
      <div className={`feedback-qrcode-popup ${isHovered ? 'visible' : ''}`}>
        <div className="feedback-qrcode-content">
          <img
            src={QR_CODE_URL}
            alt="意见反馈二维码"
            className="feedback-qrcode-image"
          />
          <div className="feedback-qrcode-text">扫码反馈意见</div>
        </div>
      </div>
    </div>
  );
};
