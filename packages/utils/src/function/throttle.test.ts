import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle } from './throttle';

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should throttle function calls', () => {
    const fn = vi.fn();
    const throttledFn = throttle(fn, 100);

    throttledFn('a');
    throttledFn('b');
    throttledFn('c');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');

    vi.advanceTimersByTime(100);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('c');
  });

  it('should execute first call immediately', () => {
    const fn = vi.fn();
    const throttledFn = throttle(fn, 100);

    throttledFn('first');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('first');
  });

  it('should preserve this context', () => {
    const obj = {
      value: 'test',
      fn: vi.fn(function(this: any) {
        return this.value;
      })
    };

    const throttledFn = throttle(obj.fn, 100);
    throttledFn.call(obj);

    expect(obj.fn).toHaveBeenCalledOnce();
  });

  it('should execute trailing call after limit', () => {
    const fn = vi.fn();
    const throttledFn = throttle(fn, 100);

    throttledFn('a');
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    throttledFn('b');
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('b');
  });

  it('should handle rapid calls correctly', () => {
    const fn = vi.fn();
    const throttledFn = throttle(fn, 100);

    for (let i = 0; i < 10; i++) {
      throttledFn(i);
      vi.advanceTimersByTime(10);
    }

    expect(fn).toHaveBeenCalled();
    expect(fn.mock.calls.length).toBeLessThan(10);
  });
});
