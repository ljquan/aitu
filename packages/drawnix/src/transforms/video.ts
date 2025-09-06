import { PlaitBoard, Point, Transforms } from '@plait/core';
import { PlaitVideo, createPlaitVideo } from '../interfaces/video';

export const VideoTransforms = {
  /**
   * 插入视频到画板 - 现在使用图片+标识的方式
   */
  insertVideo: async (
    board: PlaitBoard,
    videoUrl: string,
    startPoint: Point,
    width: number = 400,
    height: number = 225,
    options?: Partial<PlaitVideo>
  ) => {
    // 使用新的插入方式，避免创建真正的video类型元素
    const { insertVideoFromUrl } = await import('../data/video');
    return insertVideoFromUrl(board, videoUrl, startPoint);
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