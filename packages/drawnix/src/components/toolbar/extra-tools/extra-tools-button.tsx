import { useBoard } from "@plait-board/react-board";
import { Popover, PopoverContent, PopoverTrigger } from "../../popover/popover";
import { PlaitBoard } from "@plait/core";
import { useState } from "react";
import { ToolButton } from "../../tool-button";
import { ExtraToolsIcon } from "../../icons";
import Menu from "../../menu/menu";
import { MarkdownToDrawnixItem, MermaidToDrawnixItem } from "./menu-items";
import { useI18n } from "../../../i18n";
import { Z_INDEX } from "../../../constants/z-index";

export const ExtraToolsButton = () => {
  const board = useBoard();
  const { t } = useI18n();
  const container = PlaitBoard.getBoardContainer(board);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  return (
    <Popover
      key={0}
      sideOffset={12}
      open={appMenuOpen}
      onOpenChange={(open) => {
        setAppMenuOpen(open);
      }}
      placement="right-start"
    >
      <PopoverTrigger asChild>
        <ToolButton
          type="icon"
          visible={true}
          selected={appMenuOpen}
          icon={ExtraToolsIcon}
          title={t('toolbar.extraTools')}
          aria-label={t('toolbar.extraTools')}
          onPointerDown={() => {
            setAppMenuOpen(!appMenuOpen);
          }}
        />
      </PopoverTrigger>
      <PopoverContent container={container} style={{ zIndex: Z_INDEX.POPOVER }}>
        <Menu
          onSelect={() => {
            setAppMenuOpen(false);
          }}
        >
          <MermaidToDrawnixItem></MermaidToDrawnixItem>
          <MarkdownToDrawnixItem></MarkdownToDrawnixItem>
        </Menu>
      </PopoverContent>
    </Popover>
  );
};
