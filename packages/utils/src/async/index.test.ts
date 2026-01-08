import { describe, it, expect, vi } from 'vitest';
import { isPromiseLike, composeEventHandlers } from './index';

describe('isPromiseLike', () => {
  it('should return true for Promise instances', () => {
    const promise = Promise.resolve(42);
    expect(isPromiseLike(promise)).toBe(true);
  });

  it('should return true for objects with then/catch/finally methods', () => {
    const promiseLike = {
      then: () => {},
      catch: () => {},
      finally: () => {},
    };
    expect(isPromiseLike(promiseLike)).toBe(true);
  });

  it('should return false for non-promise objects', () => {
    expect(isPromiseLike({})).toBe(false);
    expect(isPromiseLike({ then: () => {} })).toBe(false);
    expect(isPromiseLike({ then: () => {}, catch: () => {} })).toBe(false);
  });

  it('should return false for primitives', () => {
    expect(isPromiseLike(null)).toBe(false);
    expect(isPromiseLike(undefined)).toBe(false);
    expect(isPromiseLike(42)).toBe(false);
    expect(isPromiseLike('string')).toBe(false);
  });

  it('should type guard correctly', async () => {
    const value: unknown = Promise.resolve(42);

    if (isPromiseLike(value)) {
      // TypeScript should know this is a Promise
      const result = await value;
      expect(result).toBe(42);
    }
  });
});

describe('composeEventHandlers', () => {
  it('should call both handlers in order', () => {
    const calls: string[] = [];
    const handler1 = () => calls.push('handler1');
    const handler2 = () => calls.push('handler2');

    const composed = composeEventHandlers(handler1, handler2);
    composed({} as any);

    expect(calls).toEqual(['handler1', 'handler2']);
  });

  it('should pass event to both handlers', () => {
    const event = { type: 'click', target: 'button' };
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const composed = composeEventHandlers(handler1, handler2);
    composed(event);

    expect(handler1).toHaveBeenCalledWith(event);
    expect(handler2).toHaveBeenCalledWith(event);
  });

  it('should skip second handler if defaultPrevented is true', () => {
    const event = {
      defaultPrevented: true,
    } as Event;

    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const composed = composeEventHandlers(handler1, handler2);
    composed(event);

    expect(handler1).toHaveBeenCalled();
    expect(handler2).not.toHaveBeenCalled();
  });

  it('should call second handler when checkForDefaultPrevented is false', () => {
    const event = {
      defaultPrevented: true,
    } as Event;

    const handler1 = vi.fn();
    const handler2 = vi.fn();

    const composed = composeEventHandlers(handler1, handler2, {
      checkForDefaultPrevented: false,
    });
    composed(event);

    expect(handler1).toHaveBeenCalled();
    expect(handler2).toHaveBeenCalled();
  });

  it('should handle undefined handlers', () => {
    const handler = vi.fn();

    const composed1 = composeEventHandlers(undefined, handler);
    composed1({} as any);
    expect(handler).toHaveBeenCalled();

    const composed2 = composeEventHandlers(handler, undefined);
    composed2({} as any);
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('should handle both handlers undefined', () => {
    const composed = composeEventHandlers(undefined, undefined);
    expect(() => composed({} as any)).not.toThrow();
  });

  it('should return value from second handler', () => {
    const handler1 = () => 'first';
    const handler2 = () => 'second';

    const composed = composeEventHandlers(handler1, handler2);
    const result = composed({} as any);

    expect(result).toBe('second');
  });
});
