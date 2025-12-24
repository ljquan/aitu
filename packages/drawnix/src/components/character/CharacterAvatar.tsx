/**
 * CharacterAvatar Component
 *
 * Displays character avatar with automatic cache fallback.
 * Uses cached blob URL when original URL fails or is unavailable.
 */

import React, { useState, useEffect } from 'react';
import { UserIcon } from 'tdesign-icons-react';
import { characterAvatarCacheService } from '../../services/character-avatar-cache-service';

export interface CharacterAvatarProps {
  /** Character ID for cache lookup */
  characterId: string;
  /** Original profile picture URL */
  profilePictureUrl?: string;
  /** Alt text for image */
  alt?: string;
  /** CSS class name */
  className?: string;
}

/**
 * CharacterAvatar - displays avatar with cache fallback
 */
export const CharacterAvatar: React.FC<CharacterAvatarProps> = ({
  characterId,
  profilePictureUrl,
  alt = 'Character',
  className,
}) => {
  const [imageUrl, setImageUrl] = useState<string | null>(profilePictureUrl || null);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Load avatar URL with cache fallback
  useEffect(() => {
    let cancelled = false;

    const loadAvatar = async () => {
      setIsLoading(true);
      setHasError(false);

      // Try to get cached URL first
      const cachedUrl = await characterAvatarCacheService.getCachedUrl(characterId);

      if (cancelled) return;

      if (cachedUrl) {
        // Use cached URL
        setImageUrl(cachedUrl);
        setIsLoading(false);
        return;
      }

      // Use original URL and trigger background cache
      if (profilePictureUrl) {
        setImageUrl(profilePictureUrl);
        // Cache in background
        characterAvatarCacheService.cacheAvatar(characterId, profilePictureUrl)
          .catch(() => {
            // Ignore cache errors
          });
      } else {
        setHasError(true);
      }
      setIsLoading(false);
    };

    loadAvatar();

    return () => {
      cancelled = true;
    };
  }, [characterId, profilePictureUrl]);

  // Handle image load error - try cache fallback
  const handleError = async () => {
    // Only try cache if we haven't already
    if (imageUrl === profilePictureUrl) {
      const cachedUrl = await characterAvatarCacheService.getCachedUrl(characterId);
      if (cachedUrl && cachedUrl !== imageUrl) {
        setImageUrl(cachedUrl);
        return;
      }
    }
    setHasError(true);
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  // Show placeholder if no URL or error
  if (hasError || !imageUrl) {
    return (
      <div className={className}>
        <UserIcon />
      </div>
    );
  }

  return (
    <img
      src={imageUrl}
      alt={alt}
      className={className}
      onError={handleError}
      onLoad={handleLoad}
      style={{ display: isLoading ? 'none' : 'block' }}
    />
  );
};

export default CharacterAvatar;
