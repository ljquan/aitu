import { describe, it, expect } from 'vitest';
import { splitRows, chunk } from './index';

describe('splitRows', () => {
  it('should split array into rows of specified size', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const result = splitRows(items, 2);

    expect(result).toEqual([[1, 2], [3, 4], [5, 6]]);
  });

  it('should handle last row with fewer items', () => {
    const items = [1, 2, 3, 4, 5];
    const result = splitRows(items, 2);

    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('should handle single row', () => {
    const items = [1, 2, 3];
    const result = splitRows(items, 5);

    expect(result).toEqual([[1, 2, 3]]);
  });

  it('should handle size of 1', () => {
    const items = [1, 2, 3];
    const result = splitRows(items, 1);

    expect(result).toEqual([[1], [2], [3]]);
  });

  it('should handle empty array', () => {
    const result = splitRows([], 3);
    expect(result).toEqual([]);
  });

  it('should work with different data types', () => {
    const strings = ['a', 'b', 'c', 'd'];
    expect(splitRows(strings, 2)).toEqual([['a', 'b'], ['c', 'd']]);

    const objects = [{ id: 1 }, { id: 2 }, { id: 3 }];
    expect(splitRows(objects, 2)).toEqual([[{ id: 1 }, { id: 2 }], [{ id: 3 }]]);
  });

  it('should preserve original array', () => {
    const items = [1, 2, 3, 4, 5];
    const originalItems = [...items];
    splitRows(items, 2);

    expect(items).toEqual(originalItems);
  });
});

describe('chunk', () => {
  it('should be an alias for splitRows', () => {
    const items = [1, 2, 3, 4, 5, 6, 7];

    expect(chunk(items, 3)).toEqual(splitRows(items, 3));
  });

  it('should chunk array into groups', () => {
    const items = [1, 2, 3, 4, 5];
    const result = chunk(items, 2);

    expect(result).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('should handle empty array', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('should work with objects', () => {
    const items = [
      { name: 'Alice' },
      { name: 'Bob' },
      { name: 'Charlie' },
    ];
    const result = chunk(items, 2);

    expect(result).toEqual([
      [{ name: 'Alice' }, { name: 'Bob' }],
      [{ name: 'Charlie' }],
    ]);
  });
});
