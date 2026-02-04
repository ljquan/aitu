/**
 * Download Utilities Tests
 */

import { describe, it, expect } from 'vitest';
import { processBatchWithConcurrency, processBatchWithConcurrencySafe } from './index';

describe('processBatchWithConcurrency', () => {
  it('should process all items', async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await processBatchWithConcurrency(
      items,
      async (item) => item * 2,
      2
    );
    expect(results).toEqual([2, 4, 6, 8, 10]);
  });

  it('should maintain order', async () => {
    const items = ['a', 'b', 'c'];
    const results = await processBatchWithConcurrency(
      items,
      async (item, index) => `${item}-${index}`,
      2
    );
    expect(results).toEqual(['a-0', 'b-1', 'c-2']);
  });

  it('should handle empty array', async () => {
    const results = await processBatchWithConcurrency(
      [],
      async (item) => item,
      3
    );
    expect(results).toEqual([]);
  });

  it('should work with concurrency = 1', async () => {
    const items = [1, 2, 3];
    const order: number[] = [];
    await processBatchWithConcurrency(
      items,
      async (item) => {
        order.push(item);
        return item;
      },
      1
    );
    expect(order).toEqual([1, 2, 3]);
  });

  it('should handle concurrency larger than items', async () => {
    const items = [1, 2];
    const results = await processBatchWithConcurrency(
      items,
      async (item) => item * 2,
      10
    );
    expect(results).toEqual([2, 4]);
  });

  it('should handle async operations with varying delays', async () => {
    const items = [3, 1, 2];
    const results = await processBatchWithConcurrency(
      items,
      async (item) => {
        await new Promise((r) => setTimeout(r, item * 10));
        return item;
      },
      3
    );
    // Results should maintain original order despite different completion times
    expect(results).toEqual([3, 1, 2]);
  });
});

describe('processBatchWithConcurrencySafe', () => {
  it('should collect successful results', async () => {
    const items = [1, 2, 3];
    const { results, errors } = await processBatchWithConcurrencySafe(
      items,
      async (item) => item * 2,
      2
    );
    expect(results.map((r) => r.value)).toEqual([2, 4, 6]);
    expect(errors).toEqual([]);
  });

  it('should collect errors without throwing', async () => {
    const items = [1, 2, 3];
    const { results, errors } = await processBatchWithConcurrencySafe(
      items,
      async (item) => {
        if (item === 2) throw new Error('Item 2 failed');
        return item * 2;
      },
      2
    );
    expect(results.map((r) => r.value)).toEqual([2, 6]);
    expect(errors.length).toBe(1);
    expect(errors[0].index).toBe(1);
    expect(errors[0].error.message).toBe('Item 2 failed');
  });

  it('should handle all failures', async () => {
    const items = [1, 2, 3];
    const { results, errors } = await processBatchWithConcurrencySafe(
      items,
      async () => {
        throw new Error('Failed');
      },
      2
    );
    expect(results).toEqual([]);
    expect(errors.length).toBe(3);
  });

  it('should maintain index information', async () => {
    const items = ['a', 'b', 'c'];
    const { results } = await processBatchWithConcurrencySafe(
      items,
      async (item, index) => ({ item, index }),
      2
    );
    expect(results[0].index).toBe(0);
    expect(results[0].value).toEqual({ item: 'a', index: 0 });
    expect(results[1].index).toBe(1);
    expect(results[2].index).toBe(2);
  });

  it('should handle non-Error throws', async () => {
    const items = [1];
    const { errors } = await processBatchWithConcurrencySafe(
      items,
      async () => {
        throw 'string error';
      },
      1
    );
    expect(errors[0].error.message).toBe('string error');
  });
});

// Note: downloadFromBlob, downloadFile, openInNewTab, downloadDataUrl
// require DOM environment and are better tested in E2E tests
