/**
 * 相似度计算模块
 */

/** 稀疏向量类型 */
export type SparseVector = Record<string, number>;

/**
 * 计算两个稀疏向量的余弦相似度
 */
export function cosineSimilarity(vecA: SparseVector, vecB: SparseVector): number {
  let dotProduct = 0;
  for (const key in vecA) {
    if (Object.prototype.hasOwnProperty.call(vecB, key)) {
      dotProduct += vecA[key] * (vecB[key] || 0);
    }
  }

  let magnitudeA = 0;
  for (const key in vecA) {
    magnitudeA += vecA[key] * vecA[key];
  }
  magnitudeA = Math.sqrt(magnitudeA);

  let magnitudeB = 0;
  for (const key in vecB) {
    magnitudeB += vecB[key] * vecB[key];
  }
  magnitudeB = Math.sqrt(magnitudeB);

  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (magnitudeA * magnitudeB);
}

/**
 * 计算两个文本的余弦相似度
 */
export { textSimilarity };

import { tokenize, token2vec } from './tokenizer';

function textSimilarity(textA: string, textB: string): number {
  const vecA = token2vec(tokenize(textA));
  const vecB = token2vec(tokenize(textB));
  return cosineSimilarity(vecA, vecB);
}

/**
 * 批量计算相似度，按降序排列
 */
export function batchSimilarity(
  query: SparseVector,
  documents: SparseVector[]
): { index: number; similarity: number }[] {
  return documents
    .map((doc, index) => ({ index, similarity: cosineSimilarity(query, doc) }))
    .sort((a, b) => b.similarity - a.similarity);
}
