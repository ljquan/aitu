import { PlaitBoard, Point, Transforms } from '@plait/core';
import { PlaitVideo, createPlaitVideo } from '../interfaces/video';

export const VideoTransforms = {
  /**
   * 插入视频到画板
   */
  insertVideo: (
    board: PlaitBoard,
    videoUrl: string,
    startPoint: Point,
    width: number = 400,
    height: number = 225,
    options?: Partial<PlaitVideo>
  ) => {
    const videoElement = createPlaitVideo(videoUrl, startPoint, width, height, options);
    
    Transforms.insertNode(board, videoElement, [board.children.length]);
    
    return videoElement;
  },

  /**
   * 更新视频属性
   */
  updateVideo: (
    board: PlaitBoard,
    element: PlaitVideo,
    updates: Partial<PlaitVideo>
  ) => {
    const path = board.children.findIndex(child => child === element);
    if (path >= 0) {
      Transforms.setNode(board, updates, [path]);
    }
  },

  /**
   * 删除视频
   */
  removeVideo: (
    board: PlaitBoard,
    element: PlaitVideo
  ) => {
    const path = board.children.findIndex(child => child === element);
    if (path >= 0) {
      Transforms.removeNode(board, [path]);
    }
  },

  /**
   * 调整视频大小
   */
  resizeVideo: (
    board: PlaitBoard,
    element: PlaitVideo,
    newPoints: [Point, Point]
  ) => {
    const width = Math.abs(newPoints[1][0] - newPoints[0][0]);
    const height = Math.abs(newPoints[1][1] - newPoints[0][1]);
    
    VideoTransforms.updateVideo(board, element, {
      points: newPoints,
      width,
      height,
    });
  },
};