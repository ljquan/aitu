/**
 * SW Debug Panel - Backup Part Manager
 * 管理备份分片逻辑
 */

/** 分片阈值：500MB 未压缩大小 */
export const PART_SIZE_THRESHOLD = 500 * 1024 * 1024;

/** 备份签名和版本（与 backup.js 保持一致） */
const BACKUP_SIGNATURE = 'aitu-backup';
const BACKUP_VERSION = 3;

/**
 * 下载 Blob 文件
 */
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * BackupPartManager - 管理备份分片
 * Part1 延迟下载：保留在内存中直到确定是否需要拆分
 */
export class BackupPartManager {
  constructor(baseFilename, backupId) {
    this.baseFilename = baseFilename;
    this.backupId = backupId;
    this.partIndex = 1;
    this.currentZip = new JSZip();
    this.currentSize = 0;
    this.downloadedParts = [];
    this.part1Zip = this.currentZip;
  }

  /** 添加文件到当前 ZIP（非素材，不触发分片） */
  addFile(path, content) {
    const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    this.currentZip.file(path, data);
    this.currentSize += new Blob([data]).size;
  }

  /** 添加素材 blob，超阈值时自动 finalize 当前分片 */
  async addAssetBlob(path, blob, metaPath, metaContent) {
    const metaStr = typeof metaContent === 'string' ? metaContent : JSON.stringify(metaContent, null, 2);
    const newSize = blob.size + new Blob([metaStr]).size;

    if (this.currentSize + newSize > PART_SIZE_THRESHOLD && this.currentSize > 0) {
      await this._finalizePart();
      this._startNewPart();
    }

    const assetsFolder = this.currentZip.folder('assets');
    assetsFolder.file(metaPath, metaStr);
    assetsFolder.file(path, blob);
    this.currentSize += newSize;
  }

  /** finalize 当前分片并下载（非 Part1 时立即下载） */
  async _finalizePart() {
    if (this.partIndex === 1) return;

    const partManifest = {
      signature: BACKUP_SIGNATURE,
      version: BACKUP_VERSION,
      createdAt: Date.now(),
      source: 'sw-debug-panel',
      backupId: this.backupId,
      partIndex: this.partIndex,
      totalParts: null,
      isFinalPart: false,
      includes: { assets: true },
    };
    this.currentZip.file('manifest.json', JSON.stringify(partManifest, null, 2));

    const blob = await this.currentZip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    const filename = `${this.baseFilename}_part${this.partIndex}.zip`;
    if (this.downloadedParts.length > 0) {
      await new Promise(r => setTimeout(r, 500));
    }
    downloadBlob(blob, filename);
    this.downloadedParts.push({ filename, size: blob.size });
  }

  _startNewPart() {
    this.partIndex++;
    this.currentZip = new JSZip();
    this.currentSize = 0;
  }

  /**
   * 完成所有分片
   * @param {object} manifest - 完整的 manifest 数据
   * @returns {{ files: Array<{filename, size}>, totalParts: number }}
   */
  async finalizeAll(manifest) {
    const isMultiPart = this.partIndex > 1;

    if (!isMultiPart) {
      manifest.partIndex = 1;
      manifest.totalParts = 1;
      manifest.isFinalPart = true;
      this.part1Zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      const blob = await this.part1Zip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      const filename = `${this.baseFilename}.zip`;
      downloadBlob(blob, filename);
      return { files: [{ filename, size: blob.size }], totalParts: 1 };
    }

    // 多分片模式：先下载 Part1
    const part1Manifest = { ...manifest, partIndex: 1, totalParts: null, isFinalPart: false };
    this.part1Zip.file('manifest.json', JSON.stringify(part1Manifest, null, 2));
    const part1Blob = await this.part1Zip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });
    const part1Filename = `${this.baseFilename}_part1.zip`;
    downloadBlob(part1Blob, part1Filename);
    this.downloadedParts.unshift({ filename: part1Filename, size: part1Blob.size });

    // 下载最后一个分片
    if (this.currentSize > 0) {
      const finalManifest = { ...manifest, partIndex: this.partIndex, totalParts: this.partIndex, isFinalPart: true };
      this.currentZip.file('manifest.json', JSON.stringify(finalManifest, null, 2));
      const blob = await this.currentZip.generateAsync({
        type: 'blob',
        compression: 'DEFLATE',
        compressionOptions: { level: 6 },
      });
      const filename = `${this.baseFilename}_part${this.partIndex}.zip`;
      await new Promise(r => setTimeout(r, 500));
      downloadBlob(blob, filename);
      this.downloadedParts.push({ filename, size: blob.size });
    }

    return { files: this.downloadedParts, totalParts: this.partIndex };
  }
}
