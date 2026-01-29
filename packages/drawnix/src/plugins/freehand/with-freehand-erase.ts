import {
    PlaitBoard,
    PlaitElement,
    Point,
    throttleRAF,
    toHostPoint,
    toViewBoxPoint,
} from '@plait/core';
import { isDrawingMode } from '@plait/common';
import { MessagePlugin } from 'tdesign-react';
import { isHitFreehandWithRadius } from './utils';
import { Freehand, FreehandShape } from './type';
import { CoreTransforms } from '@plait/core';
import { getFreehandSettings } from './freehand-settings';
import { 
    executePreciseErase, 
    findElementsInEraserPath, 
    findUnsupportedElementsInPath,
    UnsupportedEraseReason
} from '../../transforms/precise-erase';
import { getTranslation, Translations } from '../../i18n';

/**
 * 获取不支持精确擦除的错误消息
 */
function getUnsupportedMessage(reason: UnsupportedEraseReason): string {
    const messageMap: Record<UnsupportedEraseReason, keyof Translations> = {
        openPath: 'toolbar.preciseEraser.unsupported.openPath',
        image: 'toolbar.preciseEraser.unsupported.image',
        text: 'toolbar.preciseEraser.unsupported.text',
        arrowLine: 'toolbar.preciseEraser.unsupported.line',
        vectorLine: 'toolbar.preciseEraser.unsupported.line',
        unsupported: 'toolbar.preciseEraser.unsupported.other',
    };
    return getTranslation(messageMap[reason]);
}

export const withFreehandErase = (board: PlaitBoard) => {
    const { pointerDown, pointerMove, pointerUp, globalPointerUp } = board;

    let isErasing = false;
    const elementsToDelete = new Set<string>();
    let eraserPath: Point[] = []; // 记录橡皮擦路径（精确模式使用）
    let hasShownUnsupportedToast = false; // 防止重复提示

    const checkAndMarkFreehandElementsForDeletion = (point: Point) => {
        const viewBoxPoint = toViewBoxPoint(board, toHostPoint(board, point[0], point[1]));
        
        // 获取橡皮擦宽度，计算命中半径
        const settings = getFreehandSettings(board);
        // viewBoxPoint 和手绘元素的 points 都在视图坐标系中
        // eraserWidth 是用户设置的"视觉大小"，在视图坐标系中就是 eraserWidth
        // 光标显示时会乘以 zoom 缩小，擦除范围也会因为视图缩放而在屏幕上显示得更小
        // 所以 hitRadius 直接使用 eraserWidth / 2，不需要额外的 zoom 转换
        const hitRadius = settings.eraserWidth / 2;

        const freehandElements = board.children.filter((element) =>
            Freehand.isFreehand(element)
        ) as Freehand[];

        freehandElements.forEach((element) => {
            if (!elementsToDelete.has(element.id) && isHitFreehandWithRadius(board, element, viewBoxPoint, hitRadius)) {
                PlaitElement.getElementG(element).style.opacity = '0.2';
                elementsToDelete.add(element.id);
            }
        });
    };

    const deleteMarkedElements = () => {
        if (elementsToDelete.size > 0) {
            const elementsToRemove = board.children.filter((element) =>
                elementsToDelete.has(element.id)
            );
            
            if (elementsToRemove.length > 0) {
                CoreTransforms.removeElements(board, elementsToRemove);
            }
        }
    };

    const complete = async () => {
        if (isErasing) {
            const settings = getFreehandSettings(board);
            
            if (settings.preciseEraserEnabled && eraserPath.length >= 2) {
                // 精确模式：使用布尔运算擦除
                const targetElements = findElementsInEraserPath(board, eraserPath, settings.eraserWidth);
                if (targetElements.length > 0) {
                    try {
                        await executePreciseErase(
                            board, 
                            eraserPath, 
                            settings.eraserWidth, 
                            settings.eraserShape,
                            targetElements
                        );
                    } catch (error) {
                        console.error('Precise erase error:', error);
                        // 如果精确擦除失败，回退到快速模式
                        deleteMarkedElements();
                    }
                }
            } else {
                // 快速模式：删除整个元素
                deleteMarkedElements();
            }
            
            isErasing = false;
            elementsToDelete.clear();
            eraserPath = [];
            hasShownUnsupportedToast = false;
        }
    };

    /**
     * 检测精确模式下不支持的元素并提示
     */
    const checkUnsupportedElements = (viewBoxPoint: Point) => {
        const settings = getFreehandSettings(board);
        if (!settings.preciseEraserEnabled || hasShownUnsupportedToast) {
            return;
        }

        // 检测路径上不支持的元素
        const reason = findUnsupportedElementsInPath(board, eraserPath, settings.eraserWidth);
        if (reason) {
            hasShownUnsupportedToast = true;
            MessagePlugin.warning(getUnsupportedMessage(reason), 3000);
        }
    };

    board.pointerDown = (event: PointerEvent) => {
        const isEraserPointer = PlaitBoard.isInPointer(board, [FreehandShape.eraser]);

        if (isEraserPointer && isDrawingMode(board)) {
            isErasing = true;
            elementsToDelete.clear();
            eraserPath = []; // 重置路径
            
            const currentPoint: Point = [event.x, event.y];
            const viewBoxPoint = toViewBoxPoint(board, toHostPoint(board, currentPoint[0], currentPoint[1]));
            eraserPath.push(viewBoxPoint);
            
            const settings = getFreehandSettings(board);
            if (!settings.preciseEraserEnabled) {
                // 快速模式：标记删除
                checkAndMarkFreehandElementsForDeletion(currentPoint);
            }
            return;
        }

        pointerDown(event);
    };

    board.pointerMove = (event: PointerEvent) => {
        if (isErasing) {
            throttleRAF(board, 'with-freehand-erase', () => {
                const currentPoint: Point = [event.x, event.y];
                const viewBoxPoint = toViewBoxPoint(board, toHostPoint(board, currentPoint[0], currentPoint[1]));
                eraserPath.push(viewBoxPoint);
                
                const settings = getFreehandSettings(board);
                if (!settings.preciseEraserEnabled) {
                    // 快速模式：标记删除
                    checkAndMarkFreehandElementsForDeletion(currentPoint);
                } else {
                    // 精确模式：检测不支持的元素并提示
                    checkUnsupportedElements(viewBoxPoint);
                }
            });
            return;
        }

        pointerMove(event);
    };

    board.pointerUp = (event: PointerEvent) => {
        if (isErasing) {
            complete();
            return;
        }

        pointerUp(event);
    };

    board.globalPointerUp = (event: PointerEvent) => {
        if (isErasing) {
            complete();
            return;
        }

        globalPointerUp(event);
    };

    return board;
};
