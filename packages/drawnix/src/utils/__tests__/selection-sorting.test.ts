import { sortElementsByPosition } from '../selection-utils';
import { PlaitBoard, PlaitElement } from '@plait/core';

// Mock getRectangleByElements function
jest.mock('@plait/core', () => ({
  ...jest.requireActual('@plait/core'),
  getRectangleByElements: jest.fn(),
}));

const mockGetRectangleByElements = require('@plait/core').getRectangleByElements as jest.MockedFunction<any>;

describe('sortElementsByPosition', () => {
  const mockBoard = {} as PlaitBoard;
  
  const createElement = (id: string, x: number, y: number, width = 100, height = 50): PlaitElement => ({
    id,
    type: 'test',
  } as PlaitElement);

  beforeEach(() => {
    mockGetRectangleByElements.mockClear();
  });

  it('should sort elements from left to right in the same row', () => {
    const elements = [
      createElement('right', 200, 100),
      createElement('left', 100, 100),
      createElement('center', 150, 100),
    ];

    // Mock position data
    mockGetRectangleByElements
      .mockReturnValueOnce({ x: 200, y: 100, width: 100, height: 50 }) // right
      .mockReturnValueOnce({ x: 100, y: 100, width: 100, height: 50 }) // left
      .mockReturnValueOnce({ x: 150, y: 100, width: 100, height: 50 }); // center

    const sorted = sortElementsByPosition(mockBoard, elements);
    
    expect(sorted.map(el => el.id)).toEqual(['left', 'center', 'right']);
  });

  it('should sort elements from top to bottom when in different rows', () => {
    const elements = [
      createElement('bottom', 100, 200),
      createElement('top', 100, 100),
      createElement('middle', 100, 150),
    ];

    // Mock position data
    mockGetRectangleByElements
      .mockReturnValueOnce({ x: 100, y: 200, width: 100, height: 50 }) // bottom
      .mockReturnValueOnce({ x: 100, y: 100, width: 100, height: 50 }) // top
      .mockReturnValueOnce({ x: 100, y: 150, width: 100, height: 50 }); // middle

    const sorted = sortElementsByPosition(mockBoard, elements);
    
    expect(sorted.map(el => el.id)).toEqual(['top', 'middle', 'bottom']);
  });

  it('should handle grid layout correctly (top-left to bottom-right)', () => {
    const elements = [
      createElement('bottom-right', 200, 200),
      createElement('top-left', 100, 100),
      createElement('top-right', 200, 100),
      createElement('bottom-left', 100, 200),
    ];

    // Mock position data
    mockGetRectangleByElements
      .mockReturnValueOnce({ x: 200, y: 200, width: 100, height: 50 }) // bottom-right
      .mockReturnValueOnce({ x: 100, y: 100, width: 100, height: 50 }) // top-left
      .mockReturnValueOnce({ x: 200, y: 100, width: 100, height: 50 }) // top-right
      .mockReturnValueOnce({ x: 100, y: 200, width: 100, height: 50 }); // bottom-left

    const sorted = sortElementsByPosition(mockBoard, elements);
    
    expect(sorted.map(el => el.id)).toEqual(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
  });

  it('should return original order if positioning fails', () => {
    const elements = [
      createElement('first', 0, 0),
      createElement('second', 0, 0),
    ];

    // Mock to throw error
    mockGetRectangleByElements.mockImplementation(() => {
      throw new Error('Position error');
    });

    const sorted = sortElementsByPosition(mockBoard, elements);
    
    expect(sorted).toEqual(elements); // Should return original order
  });
});