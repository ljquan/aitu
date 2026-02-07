/**
 * Image Compression Core Module
 *
 * Provides automatic image compression for files between 10-25MB.
 * Uses Canvas API + JPEG conversion with binary search to find optimal quality.
 *
 * Compression Strategy:
 * - <10MB: No compression (return as-is)
 * - 10-15MB: Target 5MB, quality ~0.80
 * - 15-20MB: Target 3MB, quality ~0.70
 * - 20-25MB: Target 2MB, quality ~0.60
 * - >25MB: Reject (return error)
 */

export interface CompressionStrategy {
  shouldCompress: boolean;
  targetSizeMB: number;
  initialQuality: number;
  minQuality: number;
  maxQuality: number;
}

export interface CompressionResult {
  compressed: Blob;
  originalSize: number;
  compressedSize: number;
  quality: number;
}

const COMPRESSION_STRATEGIES: Record<string, CompressionStrategy> = {
  small: {
    // <10MB
    shouldCompress: false,
    targetSizeMB: 0,
    initialQuality: 1,
    minQuality: 0,
    maxQuality: 1,
  },
  medium: {
    // 10-15MB
    shouldCompress: true,
    targetSizeMB: 5,
    initialQuality: 0.8,
    minQuality: 0.5,
    maxQuality: 0.9,
  },
  large: {
    // 15-20MB
    shouldCompress: true,
    targetSizeMB: 3,
    initialQuality: 0.7,
    minQuality: 0.4,
    maxQuality: 0.85,
  },
  veryLarge: {
    // 20-25MB
    shouldCompress: true,
    targetSizeMB: 2,
    initialQuality: 0.6,
    minQuality: 0.3,
    maxQuality: 0.75,
  },
};

/**
 * Get compression strategy based on file size in MB
 */
export function getCompressionStrategy(fileSizeMB: number): CompressionStrategy {
  if (fileSizeMB < 10) {
    return COMPRESSION_STRATEGIES.small;
  }
  if (fileSizeMB < 15) {
    return COMPRESSION_STRATEGIES.medium;
  }
  if (fileSizeMB < 20) {
    return COMPRESSION_STRATEGIES.large;
  }
  if (fileSizeMB <= 25) {
    return COMPRESSION_STRATEGIES.veryLarge;
  }
  // >25MB will be handled by caller
  return COMPRESSION_STRATEGIES.small; // Default to no compression
}

/**
 * Compress image using Canvas API and JPEG conversion
 * Uses binary search to find optimal quality that meets target size
 *
 * @param blob - Image blob to compress
 * @param quality - Initial quality (0-1)
 * @returns Promise resolving to compressed blob
 */
function compressImageWithQuality(blob: Blob, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0);
      canvas.toBlob(
        (compressedBlob) => {
          if (compressedBlob) {
            resolve(compressedBlob);
          } else {
            reject(new Error('Failed to compress image'));
          }
        },
        'image/jpeg',
        quality
      );
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(blob);
  });
}

/**
 * Compress image blob to target size using binary search for optimal quality
 *
 * @param blob - Image blob to compress
 * @param targetSizeMB - Target size in MB
 * @param strategy - Compression strategy with quality bounds
 * @returns Promise resolving to compression result
 */
async function compressToBinary(
  blob: Blob,
  targetSizeMB: number,
  strategy: CompressionStrategy
): Promise<Blob> {
  let minQuality = strategy.minQuality;
  let maxQuality = strategy.maxQuality;
  let bestBlob = blob;
  const targetBytes = targetSizeMB * 1024 * 1024;
  const maxIterations = 8;

  for (let i = 0; i < maxIterations; i++) {
    const currentQuality = (minQuality + maxQuality) / 2;
    const compressedBlob = await compressImageWithQuality(blob, currentQuality);

    if (compressedBlob.size <= targetBytes) {
      // Under target, can reduce quality more
      bestBlob = compressedBlob;
      maxQuality = currentQuality;
    } else {
      // Over target, need higher quality
      minQuality = currentQuality;
    }

    // Converged close enough
    if (maxQuality - minQuality < 0.01) {
      break;
    }
  }

  // Final pass with best quality found
  return bestBlob;
}

/**
 * Compress image blob with automatic quality adjustment
 * Handles files 10-25MB by adjusting quality to hit target size
 *
 * @param blob - Image blob to compress
 * @param targetSizeMB - Target size in MB
 * @returns Promise resolving to compressed blob
 * @throws Error if compression fails
 */
export async function compressImageBlob(blob: Blob, targetSizeMB: number): Promise<Blob> {
  const fileSizeMB = blob.size / (1024 * 1024);
  const strategy = getCompressionStrategy(fileSizeMB);

  // No compression needed
  if (!strategy.shouldCompress) {
    return blob;
  }

  // Reject files >25MB
  if (fileSizeMB > 25) {
    throw new Error('Image size exceeds maximum limit of 25MB');
  }

  try {
    return await compressToBinary(blob, targetSizeMB, strategy);
  } catch (error) {
    console.error('[ImageCompressionCore] Compression failed:', error);
    throw new Error('Image compression failed');
  }
}

/**
 * Compress image blob and return detailed result
 * Useful for showing compression stats to user
 *
 * @param blob - Image blob to compress
 * @returns Promise resolving to compression result with stats
 */
export async function compressImageBlobWithStats(blob: Blob): Promise<CompressionResult> {
  const fileSizeMB = blob.size / (1024 * 1024);
  const strategy = getCompressionStrategy(fileSizeMB);

  if (!strategy.shouldCompress) {
    return {
      compressed: blob,
      originalSize: blob.size,
      compressedSize: blob.size,
      quality: 1,
    };
  }

  if (fileSizeMB > 25) {
    throw new Error('Image size exceeds maximum limit of 25MB');
  }

  let minQuality = strategy.minQuality;
  let maxQuality = strategy.maxQuality;
  let bestBlob = blob;
  let bestQuality = strategy.initialQuality;
  const targetBytes = strategy.targetSizeMB * 1024 * 1024;
  const maxIterations = 8;

  for (let i = 0; i < maxIterations; i++) {
    const currentQuality = (minQuality + maxQuality) / 2;
    const compressedBlob = await compressImageWithQuality(blob, currentQuality);

    if (compressedBlob.size <= targetBytes) {
      bestBlob = compressedBlob;
      bestQuality = currentQuality;
      maxQuality = currentQuality;
    } else {
      minQuality = currentQuality;
    }

    if (maxQuality - minQuality < 0.01) {
      break;
    }
  }

  return {
    compressed: bestBlob,
    originalSize: blob.size,
    compressedSize: bestBlob.size,
    quality: bestQuality,
  };
}
