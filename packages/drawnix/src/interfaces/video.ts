import { PlaitElement, Point } from '@plait/core';

export interface PlaitCommonVideo extends PlaitElement {
  points: [Point, Point];
  type: 'video';
  angle: number;
}

export interface PlaitVideo extends PlaitCommonVideo {
  url: string;
  width: number;
  height: number;
  videoType?: string; // MIME type of the video
  poster?: string; // Thumbnail/poster image URL
}

// Helper function to check if an element is a video
export function isPlaitVideo(element: PlaitElement): element is PlaitVideo {
  return element.type === 'video';
}

// Helper function to create a video element
export function createPlaitVideo(
  url: string, 
  point: Point, 
  width: number = 400, 
  height: number = 225,
  options?: Partial<PlaitVideo>
): PlaitVideo {
  return {
    id: Date.now().toString(),
    type: 'video',
    points: [point, [point[0] + width, point[1] + height] as Point],
    angle: 0,
    url,
    width,
    height,
    ...options,
  };
}