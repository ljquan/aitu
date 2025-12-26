/**
 * Character Storage Service
 *
 * Handles persistent storage of Sora characters using IndexedDB (via localforage).
 * Provides CRUD operations and state persistence for characters.
 */

import localforage from 'localforage';
import { BehaviorSubject, Observable } from 'rxjs';
import type { SoraCharacter, CharacterStatus } from '../types/character.types';
import { characterAvatarCacheService } from './character-avatar-cache-service';

// Storage key for characters
const STORAGE_KEY = 'sora-characters';

// Initialize localforage instance for characters
const characterStore = localforage.createInstance({
  name: 'drawnix',
  storeName: 'characters',
  description: 'Sora character storage',
});

/**
 * Character Storage Service
 * Manages character persistence with IndexedDB
 */
class CharacterStorageService {
  private characters$ = new BehaviorSubject<SoraCharacter[]>([]);
  private initialized = false;

  constructor() {
    // Initialize on first access
    this.init();
  }

  /**
   * Initialize the service and load characters from storage
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    try {
      const characters = await this.loadFromStorage();
      this.characters$.next(characters);
      this.initialized = true;
      console.log('[CharacterStorage] Initialized with', characters.length, 'characters');
    } catch (error) {
      console.error('[CharacterStorage] Failed to initialize:', error);
      this.characters$.next([]);
      this.initialized = true;
    }
  }

  /**
   * Get observable for character list
   */
  getCharacters$(): Observable<SoraCharacter[]> {
    return this.characters$.asObservable();
  }

  /**
   * Get current character list
   */
  getCharacters(): SoraCharacter[] {
    return this.characters$.getValue();
  }

  /**
   * Get characters by status
   */
  getCharactersByStatus(status: CharacterStatus): SoraCharacter[] {
    return this.getCharacters().filter(c => c.status === status);
  }

  /**
   * Get a character by ID
   */
  getCharacterById(id: string): SoraCharacter | undefined {
    return this.getCharacters().find(c => c.id === id);
  }

  /**
   * Get characters by source task ID
   */
  getCharactersBySourceTask(taskId: string): SoraCharacter[] {
    return this.getCharacters().filter(c => c.sourceTaskId === taskId);
  }

  /**
   * Save a new character
   */
  async saveCharacter(character: SoraCharacter): Promise<void> {
    const characters = this.getCharacters();
    const existingIndex = characters.findIndex(c => c.id === character.id);

    if (existingIndex >= 0) {
      // Update existing
      characters[existingIndex] = character;
    } else {
      // Add new
      characters.push(character);
    }

    await this.saveToStorage(characters);
    this.characters$.next([...characters]);
    console.log('[CharacterStorage] Character saved:', character.id);

    // Cache avatar if character is completed and has profile picture
    if (character.status === 'completed' && character.profilePictureUrl) {
      characterAvatarCacheService.cacheAvatar(character.id, character.profilePictureUrl)
        .catch(err => console.warn('[CharacterStorage] Failed to cache avatar:', err));
    }
  }

  /**
   * Update a character
   */
  async updateCharacter(
    id: string,
    updates: Partial<SoraCharacter>
  ): Promise<SoraCharacter | null> {
    const characters = this.getCharacters();
    const index = characters.findIndex(c => c.id === id);

    if (index < 0) {
      console.warn('[CharacterStorage] Character not found:', id);
      return null;
    }

    const updatedCharacter = { ...characters[index], ...updates };
    characters[index] = updatedCharacter;

    await this.saveToStorage(characters);
    this.characters$.next([...characters]);
    console.log('[CharacterStorage] Character updated:', id);

    // Cache avatar if character becomes completed and has profile picture
    if (updatedCharacter.status === 'completed' && updatedCharacter.profilePictureUrl) {
      characterAvatarCacheService.cacheAvatar(id, updatedCharacter.profilePictureUrl)
        .catch(err => console.warn('[CharacterStorage] Failed to cache avatar:', err));
    }

    return updatedCharacter;
  }

  /**
   * Update character status
   */
  async updateCharacterStatus(
    id: string,
    status: CharacterStatus,
    error?: string
  ): Promise<SoraCharacter | null> {
    const updates: Partial<SoraCharacter> = { status };

    if (status === 'completed') {
      updates.completedAt = Date.now();
    }

    if (error) {
      updates.error = error;
    }

    return this.updateCharacter(id, updates);
  }

  /**
   * Delete a character
   */
  async deleteCharacter(id: string): Promise<boolean> {
    const characters = this.getCharacters();
    const index = characters.findIndex(c => c.id === id);

    if (index < 0) {
      console.warn('[CharacterStorage] Character not found for deletion:', id);
      return false;
    }

    characters.splice(index, 1);

    await this.saveToStorage(characters);
    this.characters$.next([...characters]);
    console.log('[CharacterStorage] Character deleted:', id);

    // Clean up avatar cache
    characterAvatarCacheService.deleteCache(id)
      .catch(err => console.warn('[CharacterStorage] Failed to delete avatar cache:', err));

    return true;
  }

  /**
   * Delete all characters from a source task
   */
  async deleteCharactersBySourceTask(taskId: string): Promise<number> {
    const characters = this.getCharacters();
    const originalLength = characters.length;
    const filtered = characters.filter(c => c.sourceTaskId !== taskId);

    if (filtered.length === originalLength) {
      return 0;
    }

    await this.saveToStorage(filtered);
    this.characters$.next(filtered);

    const deletedCount = originalLength - filtered.length;
    console.log('[CharacterStorage] Deleted', deletedCount, 'characters from task:', taskId);

    return deletedCount;
  }

  /**
   * Clear all characters
   */
  async clearAll(): Promise<void> {
    await this.saveToStorage([]);
    this.characters$.next([]);
    console.log('[CharacterStorage] All characters cleared');
  }

  /**
   * Get pending characters that need to resume polling
   */
  getPendingCharacters(): SoraCharacter[] {
    return this.getCharacters().filter(
      c => c.status === 'pending' || c.status === 'processing'
    );
  }

  /**
   * Load characters from storage
   * @private
   */
  private async loadFromStorage(): Promise<SoraCharacter[]> {
    try {
      const data = await characterStore.getItem<SoraCharacter[]>(STORAGE_KEY);
      return data || [];
    } catch (error) {
      console.error('[CharacterStorage] Load error:', error);
      return [];
    }
  }

  /**
   * Save characters to storage
   * @private
   */
  private async saveToStorage(characters: SoraCharacter[]): Promise<void> {
    try {
      await characterStore.setItem(STORAGE_KEY, characters);
    } catch (error) {
      console.error('[CharacterStorage] Save error:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const characterStorageService = new CharacterStorageService();
