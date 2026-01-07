import { describe, it, expect } from 'vitest';
import {
  TRANSPARENT,
  NO_COLOR,
  WHITE,
  transparencyToAlpha255,
  alpha255ToTransparency,
  applyOpacityToHex,
  hexAlphaToOpacity,
  removeHexAlpha,
  isValidColor,
  isTransparent,
  isWhite,
  isFullyTransparent,
  isFullyOpaque,
  isNoColor,
} from './index';

describe('Color Constants', () => {
  it('should export color constants', () => {
    expect(TRANSPARENT).toBe('TRANSPARENT');
    expect(NO_COLOR).toBe('NO_COLOR');
    expect(WHITE).toBe('#FFFFFF');
  });
});

describe('transparencyToAlpha255', () => {
  it('should convert transparency percentage to alpha value', () => {
    expect(transparencyToAlpha255(0)).toBe(255); // Fully opaque
    expect(transparencyToAlpha255(50)).toBe(128); // 50% transparent
    expect(transparencyToAlpha255(100)).toBe(0); // Fully transparent
  });

  it('should round to nearest integer', () => {
    expect(transparencyToAlpha255(25)).toBe(191);
    expect(transparencyToAlpha255(75)).toBe(64);
  });
});

describe('alpha255ToTransparency', () => {
  it('should convert alpha value to transparency percentage', () => {
    expect(alpha255ToTransparency(255)).toBe(0); // Fully opaque
    expect(alpha255ToTransparency(128)).toBe(50); // 50% transparent
    expect(alpha255ToTransparency(0)).toBe(100); // Fully transparent
  });

  it('should round to nearest integer', () => {
    expect(alpha255ToTransparency(191)).toBe(25);
    expect(alpha255ToTransparency(64)).toBe(75);
  });
});

describe('applyOpacityToHex', () => {
  it('should append alpha channel to hex color', () => {
    expect(applyOpacityToHex('#FF0000', 100)).toBe('#FF0000ff'); // Fully opaque
    expect(applyOpacityToHex('#FF0000', 50)).toBe('#FF000080'); // 50% opaque
    expect(applyOpacityToHex('#FF0000', 0)).toBe('#FF000000'); // Fully transparent
  });

  it('should work with different hex colors', () => {
    expect(applyOpacityToHex('#00FF00', 100)).toBe('#00FF00ff');
    expect(applyOpacityToHex('#0000FF', 25)).toBe('#0000FF40');
  });
});

describe('hexAlphaToOpacity', () => {
  it('should extract opacity from 8-digit hex color', () => {
    expect(hexAlphaToOpacity('#FF0000FF')).toBe(100); // Fully opaque
    expect(hexAlphaToOpacity('#FF000080')).toBe(50); // 50% opaque
    expect(hexAlphaToOpacity('#FF000000')).toBe(0); // Fully transparent
  });

  it('should handle hex colors without # prefix', () => {
    expect(hexAlphaToOpacity('FF0000FF')).toBe(100);
    expect(hexAlphaToOpacity('FF000080')).toBe(50);
  });

  it('should return 100 for hex colors without alpha channel', () => {
    expect(hexAlphaToOpacity('#FF0000')).toBe(100);
    expect(hexAlphaToOpacity('FF0000')).toBe(100);
  });

  it('should handle 4-digit shorthand hex with alpha', () => {
    expect(hexAlphaToOpacity('#F00F')).toBe(100); // Fully opaque
    // #F008 -> alpha 8 -> 0x88 (136) -> ~53% opaque
    expect(hexAlphaToOpacity('#F008')).toBeCloseTo(53, 0);
  });
});

describe('removeHexAlpha', () => {
  it('should remove alpha channel from 8-digit hex', () => {
    expect(removeHexAlpha('#FF0000FF')).toBe('#FF0000');
    expect(removeHexAlpha('#FF000080')).toBe('#FF0000');
  });

  it('should remove alpha channel from 4-digit hex', () => {
    expect(removeHexAlpha('#F008')).toBe('#F00');
    expect(removeHexAlpha('#F00F')).toBe('#F00');
  });

  it('should handle hex colors without alpha channel', () => {
    expect(removeHexAlpha('#FF0000')).toBe('#FF0000');
    expect(removeHexAlpha('#F00')).toBe('#F00');
  });

  it('should convert to uppercase', () => {
    expect(removeHexAlpha('#ff0000ff')).toBe('#FF0000');
  });
});

describe('isValidColor', () => {
  it('should return false for "none"', () => {
    expect(isValidColor('none')).toBe(false);
  });

  it('should return true for valid colors', () => {
    expect(isValidColor('#FF0000')).toBe(true);
    expect(isValidColor('red')).toBe(true);
    expect(isValidColor('TRANSPARENT')).toBe(true);
  });
});

describe('isTransparent', () => {
  it('should return true for TRANSPARENT constant', () => {
    expect(isTransparent('TRANSPARENT')).toBe(true);
  });

  it('should return false for other values', () => {
    expect(isTransparent('#FF0000')).toBe(false);
    expect(isTransparent(undefined)).toBe(false);
  });
});

describe('isWhite', () => {
  it('should return true for WHITE constant', () => {
    expect(isWhite('#FFFFFF')).toBe(true);
  });

  it('should return false for other values', () => {
    expect(isWhite('#FF0000')).toBe(false);
    expect(isWhite(undefined)).toBe(false);
  });
});

describe('isFullyTransparent', () => {
  it('should return true for opacity 0', () => {
    expect(isFullyTransparent(0)).toBe(true);
  });

  it('should return false for other opacities', () => {
    expect(isFullyTransparent(50)).toBe(false);
    expect(isFullyTransparent(100)).toBe(false);
  });
});

describe('isFullyOpaque', () => {
  it('should return true for opacity 100', () => {
    expect(isFullyOpaque(100)).toBe(true);
  });

  it('should return false for other opacities', () => {
    expect(isFullyOpaque(0)).toBe(false);
    expect(isFullyOpaque(50)).toBe(false);
  });
});

describe('isNoColor', () => {
  it('should return true for NO_COLOR constant', () => {
    expect(isNoColor('NO_COLOR')).toBe(true);
  });

  it('should return false for other values', () => {
    expect(isNoColor('#FF0000')).toBe(false);
    expect(isNoColor('TRANSPARENT')).toBe(false);
  });
});
