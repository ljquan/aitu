import {
    PlaitBoard,
    PlaitElement,
    Point,
    throttleRAF,
    toHostPoint,
    toViewBoxPoint,
} from '@plait/core';
import { isDrawingMode } from '@plait/common';
import { isHitFreehandWithRadius } from './utils';
import { Freehand, FreehandShape } from './type';
import { CoreTransforms } from '@plait/core';
import { getFreehandSettings } from './freehand-settings';

export const withFreehandErase = (board: PlaitBoard) => {
    const { pointerDown, pointerMove, pointerUp, globalPointerUp } = board;

    let isErasing = false;
    const elementsToDelete = new Set<string>();

    const checkAndMarkFreehandElementsForDeletion = (point: Point) => {
        const viewBoxPoint = toViewBoxPoint(board, toHostPoint(board, point[0], point[1]));
        
        // 获取橡皮擦宽度，计算命中半径
        const settings = getFreehandSettings(board);
        // viewBoxPoint 和手绘元素的 points 都在视图坐标系中
        // eraserWidth 是用户设置的"视觉大小"，在视图坐标系中就是 eraserWidth
        // 光标显示时会乘以 zoom 缩小，擦除范围也会因为视图缩放而在屏幕上显示得更小
        // 所以 hitRadius 直接使用 eraserWidth / 2，不需要额外的 zoom 转换
        const hitRadius = settings.eraserWidth / 2;
        
        console.log('[Eraser] checkAndMarkFreehandElementsForDeletion:', {
            eraserWidth: settings.eraserWidth,
            zoom: board.viewport?.zoom,
            hitRadius,
            viewBoxPoint,
        });

        const freehandElements = board.children.filter((element) =>
            Freehand.isFreehand(element)
        ) as Freehand[];

        freehandElements.forEach((element) => {
            if (!elementsToDelete.has(element.id) && isHitFreehandWithRadius(board, element, viewBoxPoint, hitRadius)) {
                console.log('[Eraser] Hit element:', element.id);
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

    const complete = () => {
        if (isErasing) {
            deleteMarkedElements();
            isErasing = false;
            elementsToDelete.clear();
        }
    };

    board.pointerDown = (event: PointerEvent) => {
        const isEraserPointer = PlaitBoard.isInPointer(board, [FreehandShape.eraser]);

        if (isEraserPointer && isDrawingMode(board)) {
            isErasing = true;
            elementsToDelete.clear();
            const currentPoint: Point = [event.x, event.y];
            checkAndMarkFreehandElementsForDeletion(currentPoint);
            return;
        }

        pointerDown(event);
    };

    board.pointerMove = (event: PointerEvent) => {
        if (isErasing) {
            throttleRAF(board, 'with-freehand-erase', () => {
                const currentPoint: Point = [event.x, event.y];
                checkAndMarkFreehandElementsForDeletion(currentPoint);
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