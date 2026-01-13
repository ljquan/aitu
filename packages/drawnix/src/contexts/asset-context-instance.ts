import { createContext } from 'react';
import type { AssetContextValue } from '../types/asset.types';

export const AssetContext = createContext<AssetContextValue | null>(null);
