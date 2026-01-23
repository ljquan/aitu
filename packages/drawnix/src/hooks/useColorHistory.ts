/**
 * 颜色和渐变历史记录 Hook
 * Color and Gradient History Hook
 */

import { useState, useEffect, useCallback } from 'react';
import {
  colorHistoryService,
  type ColorHistoryItem,
  type GradientHistoryItem,
} from '../services/color-history-service';
import type { GradientFillConfig } from '../types/fill.types';

export interface UseColorHistoryResult {
  /** 颜色历史记录 */
  colors: ColorHistoryItem[];
  /** 渐变历史记录 */
  gradients: GradientHistoryItem[];
  /** 是否正在加载 */
  isLoading: boolean;
  /** 添加颜色到历史 */
  addColor: (color: string) => Promise<void>;
  /** 添加渐变到历史 */
  addGradient: (config: GradientFillConfig) => Promise<void>;
  /** 删除颜色 */
  removeColor: (color: string) => Promise<void>;
  /** 删除渐变 */
  removeGradient: (id: string) => Promise<void>;
  /** 刷新数据 */
  refresh: () => Promise<void>;
}

export function useColorHistory(): UseColorHistoryResult {
  const [colors, setColors] = useState<ColorHistoryItem[]>([]);
  const [gradients, setGradients] = useState<GradientHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // 加载数据
  const loadData = useCallback(async () => {
    try {
      const [colorsData, gradientsData] = await Promise.all([
        colorHistoryService.getColors(),
        colorHistoryService.getGradients(),
      ]);
      setColors(colorsData);
      setGradients(gradientsData);
    } catch (error) {
      console.error('[useColorHistory] Failed to load data:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始化加载
  useEffect(() => {
    loadData();
  }, [loadData]);

  // 添加颜色
  const addColor = useCallback(async (color: string) => {
    await colorHistoryService.addColor(color);
    const updatedColors = await colorHistoryService.getColors();
    setColors(updatedColors);
  }, []);

  // 添加渐变
  const addGradient = useCallback(async (config: GradientFillConfig) => {
    await colorHistoryService.addGradient(config);
    const updatedGradients = await colorHistoryService.getGradients();
    setGradients(updatedGradients);
  }, []);

  // 删除颜色
  const removeColor = useCallback(async (color: string) => {
    await colorHistoryService.removeColor(color);
    const updatedColors = await colorHistoryService.getColors();
    setColors(updatedColors);
  }, []);

  // 删除渐变
  const removeGradient = useCallback(async (id: string) => {
    await colorHistoryService.removeGradient(id);
    const updatedGradients = await colorHistoryService.getGradients();
    setGradients(updatedGradients);
  }, []);

  return {
    colors,
    gradients,
    isLoading,
    addColor,
    addGradient,
    removeColor,
    removeGradient,
    refresh: loadData,
  };
}
