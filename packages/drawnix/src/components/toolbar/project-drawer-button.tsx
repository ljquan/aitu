/**
 * ProjectDrawerButton Component
 *
 * Button to toggle the project drawer open/closed.
 */

import React from 'react';
import { Tooltip } from 'tdesign-react';
import { ToolButton } from '../tool-button';

interface ProjectDrawerButtonProps {
  isOpen: boolean;
  onClick: () => void;
  iconMode?: boolean;
}

// Custom folder icon with cleaner design
const CustomFolderIcon: React.FC<{ size?: string }> = ({ size = "18px" }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M3 7.5C3 6.67157 3.67157 6 4.5 6H9.87868C10.2765 6 10.658 6.15804 10.9393 6.43934L12.5607 8.06066C12.842 8.34196 13.2235 8.5 13.6213 8.5H19.5C20.3284 8.5 21 9.17157 21 10V17.5C21 18.3284 20.3284 19 19.5 19H4.5C3.67157 19 3 18.3284 3 17.5V7.5Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </svg>
);

export const ProjectDrawerButton: React.FC<ProjectDrawerButtonProps> = ({
  isOpen,
  onClick,
  iconMode = false
}) => {
  return (
    <Tooltip content={isOpen ? '关闭项目' : '打开项目'} theme="light">
      <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <ToolButton
          type="icon"
          visible={true}
          selected={isOpen}
          icon={<CustomFolderIcon size={iconMode ? "20px" : "18px"} />}
          title={isOpen ? '关闭项目' : '打开项目'}
          aria-label={isOpen ? '关闭项目' : '打开项目'}
          onPointerDown={(e) => {
            e.event.stopPropagation();
          }}
        />
      </div>
    </Tooltip>
  );
};
