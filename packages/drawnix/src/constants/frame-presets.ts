/**
 * Frame 预设尺寸常量
 *
 * 供 SizeInput（popup-toolbar）和 AddFrameDialog（project-drawer）共用
 */

export interface PresetSize {
  label: string;
  labelEn: string;
  width: number;
  height: number;
}

export interface PresetCategory {
  category: string;
  categoryEn: string;
  items: PresetSize[];
}

export const PRESET_SIZES: PresetCategory[] = [
  {
    category: '演示文稿',
    categoryEn: 'Presentation',
    items: [
      { label: 'PPT 16:9', labelEn: 'PPT 16:9', width: 1920, height: 1080 },
      { label: 'PPT 4:3', labelEn: 'PPT 4:3', width: 1024, height: 768 },
    ],
  },
  {
    category: '手机屏幕',
    categoryEn: 'Phone',
    items: [
      { label: 'iPhone 15 Pro', labelEn: 'iPhone 15 Pro', width: 393, height: 852 },
      { label: 'iPhone SE', labelEn: 'iPhone SE', width: 375, height: 667 },
      { label: 'Android', labelEn: 'Android', width: 360, height: 800 },
    ],
  },
  {
    category: '平板',
    categoryEn: 'Tablet',
    items: [
      { label: 'iPad', labelEn: 'iPad', width: 768, height: 1024 },
      { label: 'iPad Pro 12.9"', labelEn: 'iPad Pro 12.9"', width: 1024, height: 1366 },
    ],
  },
  {
    category: '社交媒体',
    categoryEn: 'Social Media',
    items: [
      { label: '正方形 1:1', labelEn: 'Square 1:1', width: 1080, height: 1080 },
      { label: '竖版 9:16', labelEn: 'Portrait 9:16', width: 1080, height: 1920 },
      { label: '横版 16:9', labelEn: 'Landscape 16:9', width: 1920, height: 1080 },
    ],
  },
  {
    category: '照片 / 海报',
    categoryEn: 'Photo / Poster',
    items: [
      { label: 'A4 竖版', labelEn: 'A4 Portrait', width: 595, height: 842 },
      { label: 'A4 横版', labelEn: 'A4 Landscape', width: 842, height: 595 },
      { label: '照片 4:3', labelEn: 'Photo 4:3', width: 1200, height: 900 },
      { label: '照片 3:2', labelEn: 'Photo 3:2', width: 1200, height: 800 },
    ],
  },
  {
    category: '桌面',
    categoryEn: 'Desktop',
    items: [
      { label: 'Full HD', labelEn: 'Full HD', width: 1920, height: 1080 },
      { label: 'MacBook', labelEn: 'MacBook', width: 1440, height: 900 },
      { label: '4K UHD', labelEn: '4K UHD', width: 3840, height: 2160 },
    ],
  },
];
