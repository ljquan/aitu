import { useBoard } from '@plait-board/react-board';
import Stack from '../../stack';
import { ToolButton } from '../../tool-button';
import {
  DuplicateIcon,
  MenuIcon,
  RedoIcon,
  TrashIcon,
  UndoIcon,
} from '../../icons';
import classNames from 'classnames';
import {
  ATTACHED_ELEMENT_CLASS_NAME,
  deleteFragment,
  duplicateElements,
  getSelectedElements,
  PlaitBoard,
} from '@plait/core';
import { Island } from '../../island';
import { Popover, PopoverContent, PopoverTrigger } from '../../popover/popover';
import { useState } from 'react';
import { CleanBoard, OpenFile, SaveAsImage, SaveToFile, Settings, GitHubLink } from './app-menu-items';
import { LanguageSwitcherMenu } from './language-switcher-menu';
import Menu from '../../menu/menu';
import MenuSeparator from '../../menu/menu-separator';
import { useI18n } from '../../../i18n';
import { Z_INDEX } from '../../../constants/z-index';
import { ToolbarSectionProps } from '../toolbar.types';

export const AppToolbar: React.FC<ToolbarSectionProps> = ({
  embedded = false,
  iconMode = false
}) => {
  const board = useBoard();
  const { t } = useI18n();
  const container = PlaitBoard.getBoardContainer(board);
  const selectedElements = getSelectedElements(board);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const isUndoDisabled = board.history.undos.length <= 0;
  const isRedoDisabled = board.history.redos.length <= 0;

  const content = (
      <Stack.Row gap={1}>
        <Popover
          key={0}
          sideOffset={12}
          open={appMenuOpen}
          onOpenChange={(open) => {
            setAppMenuOpen(open);
          }}
          placement={embedded ? "right-start" : "bottom-start"}
        >
          <PopoverTrigger asChild>
            <ToolButton
              type="icon"
              visible={true}
              selected={appMenuOpen}
              icon={MenuIcon}
              title={t('general.menu')}
              aria-label={t('general.menu')}
              data-track="toolbar_click_menu"
              onPointerDown={() => {
                setAppMenuOpen(!appMenuOpen);
              }}
            />
          </PopoverTrigger>
          <PopoverContent container={container} style={{ zIndex: Z_INDEX.POPOVER_APP }}>
            <Menu
              onSelect={() => {
                setAppMenuOpen(false);
              }}
            >
              <OpenFile></OpenFile>
              <SaveToFile></SaveToFile>
              <SaveAsImage></SaveAsImage>
              <CleanBoard></CleanBoard>
              <MenuSeparator />
              <LanguageSwitcherMenu />
              <Settings />
              <MenuSeparator />
              <GitHubLink />
            </Menu>
          </PopoverContent>
        </Popover>
        <ToolButton
          key={1}
          type="icon"
          icon={UndoIcon}
          visible={true}
          title={t('general.undo')}
          aria-label={t('general.undo')}
          data-track="toolbar_click_undo"
          onPointerUp={() => {
            board.undo();
          }}
          disabled={isUndoDisabled}
        />
                  <ToolButton
                    key={2}
                    type="icon"
                    icon={RedoIcon}
                    visible={true}
                    title={t('general.redo')}
                    aria-label={t('general.redo')}
                    data-track="toolbar_click_redo"
                    onPointerUp={() => {
                      board.redo();
                    }}
                    disabled={isRedoDisabled}
                  />
              </Stack.Row>
          );
  if (embedded) {
    return (
      <div className={classNames('app-toolbar', {
        'app-toolbar--embedded': embedded,
        'app-toolbar--icon-only': iconMode,
      })}>
        {content}
      </div>
    );
  }

  return (
    <Island
      padding={1}
      className={classNames('app-toolbar', ATTACHED_ELEMENT_CLASS_NAME, {
        'app-toolbar--embedded': embedded,
        'app-toolbar--icon-only': iconMode,
      })}
    >
      {content}
    </Island>
  );
};
