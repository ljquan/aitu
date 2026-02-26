
import { 
  KBExportData 
} from '../kb-import-export-service';
import { 
  _getStoreInstances 
} from '../knowledge-base-service';
import { exportAllData } from '../kb-import-export-service';
import { KBDirectory, KBNote, KBTag, KBNoteTag, KBNoteImage } from '../../types/knowledge-base.types';
import { logInfo, logDebug } from './sync-log-service';

/**
 * 知识库同步服务
 * 负责知识库数据的合并和应用
 */
export class KnowledgeBaseSyncService {
  
  /**
   * 获取本地知识库数据
   */
  async getLocalData(): Promise<KBExportData> {
    return await exportAllData();
  }

  /**
   * 合并本地和远程数据
   * 策略：
   * 1. ID 相同的数据，取 updatedAt 较新的版本
   * 2. 数组合并去重
   */
  merge(local: KBExportData, remote: KBExportData): KBExportData {
    logDebug('Merging knowledge base data', {
      localDirs: local.directories.length,
      remoteDirs: remote.directories.length,
      localNotes: local.notes.length,
      remoteNotes: remote.notes.length
    });

    // 1. 合并目录
    const directoriesMap = new Map<string, KBDirectory>();
    const directoryNameMap = new Map<string, string>(); // name -> id
    const directoryIdRemap = new Map<string, string>(); // oldId -> newId

    const mergeDirectory = (dir: KBDirectory) => {
      // 如果 ID 已存在，说明是同一个目录
      if (directoriesMap.has(dir.id)) {
        const existing = directoriesMap.get(dir.id)!;
        // 保留更新的一个
        if (dir.updatedAt > existing.updatedAt) {
          directoriesMap.set(dir.id, dir);
          // 如果名称变更，更新名称映射
          if (existing.name !== dir.name) {
             directoryNameMap.set(dir.name, dir.id);
          }
        }
        return;
      }

      // 如果 ID 不存在，检查名称是否重复
      if (directoryNameMap.has(dir.name)) {
        const existingId = directoryNameMap.get(dir.name)!;
        const existing = directoriesMap.get(existingId)!;
        
        // 发现同名目录，合并！
        // 记录 ID 映射：将当前 dir.id 映射到 existingId
        directoryIdRemap.set(dir.id, existingId);
        
        // 合并属性：取更新的一个，但 ID 保持 existingId
        let mergedDir = { ...existing };
        
        if (dir.updatedAt > existing.updatedAt) {
          mergedDir = {
            ...dir,
            id: existingId, // 强制保持原有 ID
          };
        }
        
        // 确保 isDefault 属性正确合并
        if (dir.isDefault || existing.isDefault) {
          mergedDir.isDefault = true;
        }
        
        directoriesMap.set(existingId, mergedDir);
        return;
      }

      // 新目录
      directoriesMap.set(dir.id, dir);
      directoryNameMap.set(dir.name, dir.id);
    };

    // 先处理远程，再处理本地
    remote.directories.forEach(mergeDirectory);
    local.directories.forEach(mergeDirectory);

    // 2. 合并标签
    const tagsMap = new Map<string, KBTag>();
    remote.tags.forEach(t => tagsMap.set(t.id, t));
    local.tags.forEach(localTag => {
      const remoteTag = tagsMap.get(localTag.id);
      // 标签通常没有 updatedAt，这里简单覆盖或保留
      // 假设标签名修改应该同步，这里优先使用本地的（如果存在）
      // 但如果远程有 ID 相同的标签，我们应该怎么做？
      // KBTag 只有 id, name, color. 没有 updatedAt.
      // 我们假设 ID 相同就是同一个标签，属性以本地为准（如果本地有修改）
      // 或者我们可以简单地以 ID 为准，如果 ID 相同，认为是一样的。
      // 为了支持重命名同步，我们需要 updatedAt。如果没有，我们无法确定谁更新。
      // 暂时策略：并集，ID 冲突以本地为准
      tagsMap.set(localTag.id, localTag);
    });

    // 3. 合并笔记
    const notesMap = new Map<string, KBNote>();
    
    const mergeNote = (note: KBNote) => {
       // 检查是否需要重映射 directoryId
       let directoryId = note.directoryId;
       if (directoryIdRemap.has(directoryId)) {
         directoryId = directoryIdRemap.get(directoryId)!;
       }
       
       const noteToMerge = { ...note, directoryId };
       
       const existing = notesMap.get(noteToMerge.id);
       if (!existing || noteToMerge.updatedAt > existing.updatedAt) {
         notesMap.set(noteToMerge.id, noteToMerge);
       }
    };
    
    remote.notes.forEach(mergeNote);
    local.notes.forEach(mergeNote);

    // 4. 合并笔记-标签关联
    // 关联关系比较特殊，通常是简单的列表。
    // 只要关联的笔记和标签存在，关联关系就应该存在。
    // 我们取并集。
    const noteTagsMap = new Map<string, KBNoteTag>();
    remote.noteTags.forEach(nt => noteTagsMap.set(nt.id, nt));
    local.noteTags.forEach(nt => noteTagsMap.set(nt.id, nt));

    // 5. 合并图片
    const imagesMap = new Map<string, KBNoteImage>();
    if (remote.images) {
      remote.images.forEach(img => imagesMap.set(img.id, img));
    }
    if (local.images) {
      local.images.forEach(localImg => {
        // KBNoteImage 只有 createdAt，且通常不可变
        // 如果 ID 冲突，优先使用本地版本（假设本地可能修复了损坏的图片，或者只是保持现状）
        // 由于没有修改时间，无法判断新旧，保持本地是比较稳妥的策略
        imagesMap.set(localImg.id, localImg);
      });
    }

    return {
      version: 2,
      exportedAt: Date.now(),
      directories: Array.from(directoriesMap.values()),
      notes: Array.from(notesMap.values()),
      tags: Array.from(tagsMap.values()),
      noteTags: Array.from(noteTagsMap.values()),
      images: Array.from(imagesMap.values()),
    };
  }

  /**
   * 应用数据到本地存储
   * 使用 upsert 模式：存在的更新，不存在的创建
   */
  async apply(data: KBExportData): Promise<void> {
    const { 
      directoriesStore, 
      notesStore, 
      noteContentsStore, 
      tagsStore, 
      noteTagsStore,
      noteImagesStore 
    } = _getStoreInstances();

    logInfo('Applying knowledge base sync data', {
      dirs: data.directories.length,
      notes: data.notes.length
    });

    // 1. 应用目录
    for (const dir of data.directories) {
      await directoriesStore.setItem(dir.id, dir);
    }

    // 2. 应用标签
    for (const tag of data.tags) {
      await tagsStore.setItem(tag.id, tag);
    }

    // 3. 应用笔记
    for (const note of data.notes) {
      const { content, ...meta } = note;
      // 更新元数据
      await notesStore.setItem(note.id, meta);
      
      // 更新内容
      if (content !== undefined) {
        // 检查内容是否真的变化了？
        // 为简单起见，直接覆盖。IndexedDB 写入很快。
        await noteContentsStore.setItem(note.id, {
          id: note.id,
          noteId: note.id,
          content,
        });
      }
    }

    // 4. 应用关联
    for (const nt of data.noteTags) {
      await noteTagsStore.setItem(nt.id, nt);
    }

    // 5. 应用图片
    if (data.images && noteImagesStore) {
      for (const img of data.images) {
        await noteImagesStore.setItem(img.id, img);
      }
    }
  }
}

export const knowledgeBaseSyncService = new KnowledgeBaseSyncService();
