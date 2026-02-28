/**
 * 外部 Skill 包存储服务
 *
 * 管理外部 Skill 包的导入、存储、查询和删除。
 * 使用 KV 存储（IndexedDB）持久化数据，并在内存中维护缓存。
 */

import type { ExternalSkill, ExternalSkillPackage } from '../constants/skills';
import { SKILL_TYPE_EXTERNAL, registerExternalSkills } from '../constants/skills';
import {
  parseSkillMarkdown,
  parseMarketplaceJson,
  batchParseSkills,
  type SkillFileData,
  type ParsedMarketplace,
} from './external-skill-parser';
import { kvStorageService } from './kv-storage-service';

// ──────────────────────────────────────────────────────────────────
// 存储键常量
// ──────────────────────────────────────────────────────────────────

/** 包源列表的存储键 */
const STORAGE_KEY_PACKAGES = 'external-skill-packages';
/** 包内 Skill 数据的存储键前缀 */
const STORAGE_KEY_SKILLS_PREFIX = 'external-skill-data:';

// ──────────────────────────────────────────────────────────────────
// 内存缓存
// ──────────────────────────────────────────────────────────────────

/** 包元数据缓存（不含 skills 数组中的 content，减少内存开销） */
interface PackageMeta {
  name: string;
  url?: string;
  skillCount: number;
  metadata?: ExternalSkillPackage['metadata'];
}

/** 外部 Skill 元数据缓存（不含 content） */
export interface ExternalSkillMeta {
  id: string;
  name: string;
  description: string;
  source: string;
  sourceUrl?: string;
  category?: string;
  outputType?: 'image' | 'text' | 'video' | 'ppt';
}

/** 内存中的包元数据列表 */
let _packagesMeta: PackageMeta[] = [];
/** 内存中的全部外部 Skill 元数据列表 */
let _allSkillsMeta: ExternalSkillMeta[] = [];
/** 是否已初始化 */
let _initialized = false;

// ──────────────────────────────────────────────────────────────────
// 初始化
// ──────────────────────────────────────────────────────────────────

/**
 * 初始化外部 Skill 服务
 * 从 IndexedDB 加载元数据到内存缓存，并注册到全局 Skill 运行时。
 * 首次加载时，还会自动导入预构建的 bundle（来自 baoyu-skills）。
 */
async function initialize(): Promise<void> {
  if (_initialized) return;

  try {
    let packages = await kvStorageService.get<ExternalSkillPackage[]>(STORAGE_KEY_PACKAGES);

    // 加载预构建 bundle（始终加载，用于版本检查）
    let prebuiltBundle: ExternalSkillPackage | null = null;
    try {
      prebuiltBundle = await loadPrebuiltBundle();
    } catch (bundleErr) {
      console.warn('[ExternalSkillService] 预构建 bundle 加载失败（非致命）:', bundleErr);
    }

    const hasStoredPackages = packages && Array.isArray(packages) && packages.length > 0;

    if (!hasStoredPackages) {
      // 本地无数据：直接使用 bundle
      if (prebuiltBundle && prebuiltBundle.skills && prebuiltBundle.skills.length > 0) {
        const pkg: ExternalSkillPackage = {
          name: prebuiltBundle.name || 'baoyu-skills',
          skills: prebuiltBundle.skills,
          metadata: prebuiltBundle.metadata,
        };
        packages = [pkg];
        await kvStorageService.set(STORAGE_KEY_PACKAGES, packages);
        console.log(`[ExternalSkillService] 已加载预构建 bundle: ${prebuiltBundle.skills.length} 个 Skill`);
      }
    } else if (prebuiltBundle && prebuiltBundle.skills && prebuiltBundle.skills.length > 0) {
      // 本地有数据：检查 bundle 版本是否更新
      const bundleVersion = (prebuiltBundle.metadata as Record<string, unknown>)?.bundleVersion as string | undefined;
      const storedPkg = packages!.find(p => p.name === (prebuiltBundle!.name || 'baoyu-skills'));
      const storedVersion = (storedPkg?.metadata as Record<string, unknown>)?.bundleVersion as string | undefined;

      if (bundleVersion && bundleVersion !== storedVersion) {
        // 版本不同，用新 bundle 替换旧的预构建包（保留用户手动添加的其他包）
        const updatedPkg: ExternalSkillPackage = {
          name: prebuiltBundle.name || 'baoyu-skills',
          skills: prebuiltBundle.skills,
          metadata: prebuiltBundle.metadata,
        };
        const otherPackages = packages!.filter(p => p.name !== updatedPkg.name);
        packages = [updatedPkg, ...otherPackages];
        await kvStorageService.set(STORAGE_KEY_PACKAGES, packages);
        console.log(`[ExternalSkillService] 预构建 bundle 已更新: ${storedVersion || '无'} → ${bundleVersion} (${prebuiltBundle.skills.length} 个 Skill)`);
      } else if (!bundleVersion && !storedVersion) {
        // 两边都没版本号（旧版本），强制用新 bundle 替换
        const updatedPkg: ExternalSkillPackage = {
          name: prebuiltBundle.name || 'baoyu-skills',
          skills: prebuiltBundle.skills,
          metadata: prebuiltBundle.metadata,
        };
        const otherPackages = packages!.filter(p => p.name !== updatedPkg.name);
        packages = [updatedPkg, ...otherPackages];
        await kvStorageService.set(STORAGE_KEY_PACKAGES, packages);
        console.log(`[ExternalSkillService] 预构建 bundle 已强制刷新（旧版本无版本号）: ${prebuiltBundle.skills.length} 个 Skill`);
      }
    }

    if (packages && Array.isArray(packages)) {
      await refreshCache(packages);
    }
  } catch (error) {
    console.error('[ExternalSkillService] 初始化失败:', error);
  }

  _initialized = true;
}

/**
 * 加载预构建的外部 Skill bundle（构建时由 prebuild-external-skills.js 生成）
 */
async function loadPrebuiltBundle(): Promise<ExternalSkillPackage | null> {
  try {
    // 动态导入 JSON bundle（Vite 会在构建时内联）
    const bundle = await import('../generated/external-skills-bundle.json') as { default?: ExternalSkillPackage; } & ExternalSkillPackage;
    return bundle.default || bundle;
  } catch {
    // bundle 文件不存在时静默忽略
    return null;
  }
}

// ──────────────────────────────────────────────────────────────────
// 包管理 CRUD
// ──────────────────────────────────────────────────────────────────

/**
 * 获取所有已注册的外部 Skill 包元数据
 */
async function getPackages(): Promise<PackageMeta[]> {
  await initialize();
  return [..._packagesMeta];
}

/**
 * 添加一个外部 Skill 包
 *
 * @param pkg - 要添加的包数据
 */
async function addPackage(pkg: ExternalSkillPackage): Promise<void> {
  await initialize();

  // 检查同名包是否已存在
  const existing = await kvStorageService.get<ExternalSkillPackage[]>(STORAGE_KEY_PACKAGES);
  const packages = existing && Array.isArray(existing) ? [...existing] : [];

  // 如果已有同名包，替换
  const existIndex = packages.findIndex(p => p.name === pkg.name);
  if (existIndex >= 0) {
    packages[existIndex] = pkg;
  } else {
    packages.push(pkg);
  }

  await kvStorageService.set(STORAGE_KEY_PACKAGES, packages);

  // 刷新缓存
  await refreshCache(packages);
}

/**
 * 移除一个外部 Skill 包
 *
 * @param packageName - 包名
 */
async function removePackage(packageName: string): Promise<void> {
  await initialize();

  const existing = await kvStorageService.get<ExternalSkillPackage[]>(STORAGE_KEY_PACKAGES);
  if (!existing || !Array.isArray(existing)) return;

  const packages = existing.filter(p => p.name !== packageName);
  await kvStorageService.set(STORAGE_KEY_PACKAGES, packages);

  // 刷新缓存
  await refreshCache(packages);
}

/**
 * 获取指定包的 Skill 列表
 */
async function getSkillsByPackage(packageName: string): Promise<ExternalSkill[]> {
  await initialize();

  const packages = await kvStorageService.get<ExternalSkillPackage[]>(STORAGE_KEY_PACKAGES);
  if (!packages) return [];

  const pkg = packages.find(p => p.name === packageName);
  return pkg?.skills ?? [];
}

/**
 * 获取所有外部 Skill 的元数据列表（不含 content，用于 UI 展示）
 */
async function getAllExternalSkillsMeta(): Promise<ExternalSkillMeta[]> {
  await initialize();
  return [..._allSkillsMeta];
}

/**
 * 获取所有外部 Skill（含 content，用于执行）
 */
async function getAllExternalSkills(): Promise<ExternalSkill[]> {
  await initialize();

  const packages = await kvStorageService.get<ExternalSkillPackage[]>(STORAGE_KEY_PACKAGES);
  if (!packages) return [];

  return packages.flatMap(pkg => pkg.skills);
}

/**
 * 根据 ID 获取单个外部 Skill（含 content）
 */
async function getSkillById(id: string): Promise<ExternalSkill | null> {
  await initialize();

  const packages = await kvStorageService.get<ExternalSkillPackage[]>(STORAGE_KEY_PACKAGES);
  if (!packages) return null;

  for (const pkg of packages) {
    const skill = pkg.skills.find(s => s.id === id);
    if (skill) return skill;
  }

  return null;
}

/**
 * 根据 ID 获取 Skill 的完整内容（懒加载）
 */
async function getSkillContentById(id: string): Promise<string | null> {
  const skill = await getSkillById(id);
  return skill?.content ?? null;
}

// ──────────────────────────────────────────────────────────────────
// 导入功能
// ──────────────────────────────────────────────────────────────────

/**
 * 从 ZIP 文件导入外部 Skill 包
 *
 * 预期 ZIP 结构：
 * ```
 * skills/
 *   baoyu-infographic/
 *     SKILL.md
 *   baoyu-image-gen/
 *     SKILL.md
 * .claude-plugin/
 *   marketplace.json  (可选)
 * ```
 *
 * @param file - ZIP 文件
 * @param packageName - 包名（可选，默认从 marketplace.json 或文件名提取）
 */
async function importFromZip(file: File, packageName?: string): Promise<ExternalSkillPackage> {
  // 动态加载 JSZip（避免打包体积影响）
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);

  // 尝试读取 marketplace.json
  let marketplace: ParsedMarketplace | null = null;
  const marketplaceFile = zip.file(/\.claude-plugin\/marketplace\.json$/)?.[0]
    || zip.file('marketplace.json');
  if (marketplaceFile) {
    const content = await marketplaceFile.async('text');
    marketplace = parseMarketplaceJson(content);
  }

  // 确定包名
  const pkgName = packageName
    || marketplace?.name
    || file.name.replace(/\.zip$/i, '');

  // 扫描 skills/*/SKILL.md
  const skillFiles: SkillFileData[] = [];
  const skillMdRegex = /(?:^|\/)(skills\/([^/]+)\/SKILL\.md)$/;

  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;

    const match = path.match(skillMdRegex);
    if (match) {
      const dirName = match[2];
      const content = await zipEntry.async('text');

      // 尝试读取同目录下的 references 和 prompts
      const references = new Map<string, string>();
      const skillDirPrefix = path.substring(0, path.lastIndexOf('SKILL.md'));

      for (const [refPath, refEntry] of Object.entries(zip.files)) {
        if (refEntry.dir) continue;
        if (refPath.startsWith(skillDirPrefix) && refPath !== path) {
          const relativePath = refPath.substring(skillDirPrefix.length);
          if (relativePath.startsWith('references/') || relativePath.startsWith('prompts/')) {
            const refContent = await refEntry.async('text');
            references.set(relativePath, refContent);
          }
        }
      }

      skillFiles.push({
        dirName,
        skillMdContent: content,
        references: references.size > 0 ? references : undefined,
      });
    }
  }

  if (skillFiles.length === 0) {
    throw new Error(`ZIP 文件中未找到有效的 Skill（预期路径: skills/*/SKILL.md）`);
  }

  // 批量解析
  const skills = batchParseSkills(skillFiles, pkgName, marketplace);

  const pkg: ExternalSkillPackage = {
    name: pkgName,
    url: undefined,
    skills,
    metadata: marketplace?.metadata,
  };

  // 存储
  await addPackage(pkg);

  return pkg;
}

/**
 * 从粘贴的 SKILL.md 内容导入单个外部 Skill
 *
 * @param skillMdContent - SKILL.md 的文本内容
 * @param packageName - 包名（默认 'custom'）
 */
async function importFromPastedContent(
  skillMdContent: string,
  packageName: string = 'custom'
): Promise<ExternalSkill | null> {
  const parsed = parseSkillMarkdown(skillMdContent);
  if (!parsed) {
    throw new Error('无法解析 SKILL.md 内容，请检查格式是否正确（需包含 YAML front matter）');
  }

  const skill: ExternalSkill = {
    id: `${packageName}:${parsed.name}`,
    name: parsed.name,
    description: parsed.description,
    type: SKILL_TYPE_EXTERNAL,
    content: parsed.body,
    source: packageName,
  };

  // 读取已有包
  await initialize();
  const existing = await kvStorageService.get<ExternalSkillPackage[]>(STORAGE_KEY_PACKAGES);
  const packages = existing && Array.isArray(existing) ? [...existing] : [];

  // 查找或创建目标包
  let pkg = packages.find(p => p.name === packageName);
  if (!pkg) {
    pkg = { name: packageName, skills: [], metadata: { description: '手动导入的 Skill' } };
    packages.push(pkg);
  }

  // 检查是否已有同 ID 的 Skill
  const existIndex = pkg.skills.findIndex(s => s.id === skill.id);
  if (existIndex >= 0) {
    pkg.skills[existIndex] = skill;
  } else {
    pkg.skills.push(skill);
  }

  await kvStorageService.set(STORAGE_KEY_PACKAGES, packages);

  // 刷新缓存
  await refreshCache(packages);

  return skill;
}

/**
 * 从预构建的 JSON bundle 导入外部 Skill（构建时预处理结果）
 *
 * @param bundleData - JSON bundle 数据
 */
async function importFromBundle(bundleData: ExternalSkillPackage): Promise<void> {
  await addPackage(bundleData);
}

// ──────────────────────────────────────────────────────────────────
// 内部工具
// ──────────────────────────────────────────────────────────────────

/**
 * 刷新内存缓存
 */
async function refreshCache(packages: ExternalSkillPackage[]): Promise<void> {
  _packagesMeta = packages.map(pkg => ({
    name: pkg.name,
    url: pkg.url,
    skillCount: pkg.skills.length,
    metadata: pkg.metadata,
  }));

  _allSkillsMeta = [];
  for (const pkg of packages) {
    for (const skill of pkg.skills) {
      _allSkillsMeta.push({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        source: skill.source,
        sourceUrl: skill.sourceUrl,
        category: skill.category,
        outputType: skill.outputType,
      });
    }
  }

  // 注册到全局运行时
  const allSkills = packages.flatMap(pkg => pkg.skills);
  registerExternalSkills(allSkills);
}

/**
 * 清除所有外部 Skill 数据（用于调试和测试）
 */
async function clearAll(): Promise<void> {
  await kvStorageService.remove(STORAGE_KEY_PACKAGES);
  _packagesMeta = [];
  _allSkillsMeta = [];
  registerExternalSkills([]);
  _initialized = false;
}

// ──────────────────────────────────────────────────────────────────
// 导出服务
// ──────────────────────────────────────────────────────────────────

export const externalSkillService = {
  initialize,
  getPackages,
  addPackage,
  removePackage,
  getSkillsByPackage,
  getAllExternalSkillsMeta,
  getAllExternalSkills,
  getSkillById,
  getSkillContentById,
  importFromZip,
  importFromPastedContent,
  importFromBundle,
  clearAll,
};

export default externalSkillService;
