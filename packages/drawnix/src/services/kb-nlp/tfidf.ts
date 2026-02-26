/**
 * TF-IDF 向量化模块
 */

import { token2vec, tokenize } from './tokenizer';

/** TF-IDF 向量（稀疏表示） */
export interface TfidfVector {
  terms: Record<string, number>;
  magnitude: number;
}

/**
 * TF-IDF 向量化器
 * 基于词频对象计算 IDF 并生成 TF-IDF 向量
 */
export class TfidfVectorizer {
  private documentFrequency: Record<string, number> = {};
  private idfValues: Record<string, number> = {};
  private docCount = 0;
  private isFitted = false;

  /**
   * 拟合数据，计算 IDF 值
   */
  fit(docs: Record<string, number>[]): this {
    this.docCount = docs.length;
    this.documentFrequency = {};
    this.idfValues = {};

    for (const doc of docs) {
      for (const term of Object.keys(doc)) {
        this.documentFrequency[term] = (this.documentFrequency[term] || 0) + 1;
      }
    }

    for (const term in this.documentFrequency) {
      const df = this.documentFrequency[term] || 0;
      // IDF = log((N + 1) / (df + 1)) + 1，平滑处理
      this.idfValues[term] = Math.log((this.docCount + 1) / (df + 1)) + 1;
    }

    this.isFitted = true;
    return this;
  }

  /**
   * 获取某个词的 IDF 值
   */
  getIdf(term: string): number {
    return this.idfValues[term] || 0;
  }

  /**
   * 获取所有 IDF 值
   */
  getIdfValues(): Record<string, number> {
    return this.idfValues;
  }

  /**
   * 是否已拟合
   */
  get fitted(): boolean {
    return this.isFitted;
  }
}

/**
 * 计算单个文档的 TF-IDF 稀疏向量
 */
export function computeTfidfSparse(
  doc: Record<string, number>,
  idfValues: Record<string, number>
): TfidfVector {
  const terms: Record<string, number> = {};
  let magnitudeSquared = 0;

  for (const term in doc) {
    const tf = doc[term];
    const idf = idfValues[term] || 1;
    const tfidf = tf * idf;
    terms[term] = tfidf;
    magnitudeSquared += tfidf * tfidf;
  }

  return { terms, magnitude: Math.sqrt(magnitudeSquared) };
}

/**
 * 计算两个 TF-IDF 稀疏向量的余弦相似度
 */
export function tfidfCosineSimilarity(vecA: TfidfVector, vecB: TfidfVector): number {
  if (vecA.magnitude === 0 || vecB.magnitude === 0) return 0;

  let dotProduct = 0;
  for (const term in vecA.terms) {
    if (term in vecB.terms) {
      dotProduct += vecA.terms[term] * vecB.terms[term];
    }
  }

  return dotProduct / (vecA.magnitude * vecB.magnitude);
}
