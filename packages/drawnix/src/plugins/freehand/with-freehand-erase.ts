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
import { PlaitDrawElement } from '@plait/draw';
import { getFreehandSettings } from './freehand-settings';
import { isFrameElement } from '../../types/frame.types';
import { isPlaitVideo } from '../../interfaces/video';
import {
    executePreciseErase,
    findElementsInEraserPath,
    findUnsupportedElementsInEraserPath,
} from '../../transforms/precise-erase';

export const withFreehandErase = (board: PlaitBoard) => {
    const { pointerDown, pointerMove, pointerUp, globalPointerUp } = board;

    let isErasing = false;
    const elementsToDelete = new Set<string>();
    let eraserPath: Point[] = [];

    const checkAndMarkFreehandElementsForDeletion = (point: Point) => {
        const viewBoxPoint = toViewBoxPoint(board, toHostPoint(board, point[0], point[1]));
        const settings = getFreehandSettings(board);
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
            // Freehand 笔画统一用整体删除（两种模式一致）
            deleteMarkedElements();

            if (eraserPath.length >= 2) {
                const settings = getFreehandSettings(board);
                // 对非 Freehand 的支持元素使用布尔运算
                const targetElements = findElementsInEraserPath(board, eraserPath, settings.eraserWidth)
                    .filter(el => !Freehand.isFreehand(el));
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
                    }
                }
                // 直接删除不支持布尔运算的非 Freehand 元素，跳过 Frame/图片/视频
                const unsupportedElements = findUnsupportedElementsInEraserPath(board, eraserPath, settings.eraserWidth)
                    .filter(el => !Freehand.isFreehand(el) && !isFrameElement(el) && !isPlaitVideo(el)
                        && !(PlaitDrawElement.isDrawElement(el) && PlaitDrawElement.isImage(el)));
                if (unsupportedElements.length > 0) {
                    CoreTransforms.removeElements(board, unsupportedElements);
                }
            }

            isErasing = false;
            elementsToDelete.clear();
            eraserPath = [];
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
            
            checkAndMarkFreehandElementsForDeletion(currentPoint);
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
