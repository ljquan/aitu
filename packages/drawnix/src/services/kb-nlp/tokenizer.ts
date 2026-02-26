/**
 * 分词器模块
 * 支持中英文混合文本的分词处理
 */

// 标点停用词
const punctuationStopWords = new Set([
  '，', '。', '！', '？', '\u201c', '\u201d', '\u2018', '\u2019', '；', '：', '（', '）', '、', '-', '—', '《', '》',
  ',', '.', '!', '?', '"', "'", ';', ':', '(', ')', '&', '-', '/', '\\', '[', ']', '{', '}',
]);

// 停用词表（中英文）
const STOP_WORDS = new Set([
  // 中文停用词
  '啊', '哎', '唉', '吧', '比', '便', '不', '差不多', '的', '得', '地', '对', '多少', '哒', '对于',
  '诶', '而', '而且', '二', '非常', '否', '咯', '跟', '哈', '哈哈', '哈啊', '哎呀', '嘿', '哼',
  '很多', '后', '会', '唧', '或', '或许', '哟', '几', '及', '假如', '即使', '即便', '就', '觉得',
  '喀', '可以', '可能', '啦', '了', '呃', '吗', '嘛', '么', '每', '没', '没有', '哪里', '那',
  '那个', '那么', '呢', '嗯', '哦', '其他', '或者', '呕', '前', '若', '三', '啥', '什么', '甚',
  '甚至', '十分', '是', '手', '太', '哇', '为', '为什么', '无论', '无', '嘻嘻', '些', '许多',
  '呀', '哎哟', '一', '已经', '应该', '咦', '因为', '由', '于', '有', '有的', '咋', '再', '再说',
  '怎', '怎么', '怎么样', '这', '这个', '这样', '总', '总是', '总之',
  // 英文停用词
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are',
  "aren't", 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both',
  'but', 'by', "can't", 'cannot', 'could', "couldn't", 'did', "didn't", 'do', 'does', "doesn't",
  'doing', "don't", 'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', "hadn't",
  'has', "hasn't", 'have', "haven't", 'having', 'he', "he'd", "he'll", "he's", 'her', 'here',
  "here's", 'hers', 'herself', 'him', 'himself', 'his', 'how', "how's", 'i', "i'd", "i'll",
  "i'm", "i've", 'if', 'in', 'into', 'is', "isn't", 'it', "it's", 'its', 'itself', "let's",
  'me', 'more', 'most', "mustn't", 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on',
  'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  'same', "shan't", 'she', "she'd", "she'll", "she's", 'should', "shouldn't", 'so', 'some',
  'such', 'than', 'that', "that's", 'the', 'their', 'theirs', 'them', 'themselves', 'then',
  'there', "there's", 'these', 'they', "they'd", "they'll", "they're", "they've", 'this',
  'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', "wasn't", 'we',
  "we'd", "we'll", "we're", "we've", 'were', "weren't", 'what', "what's", 'when', "when's",
  'where', "where's", 'which', 'while', 'who', "who's", 'whom', 'why', "why's", 'with',
  "won't", 'would', "wouldn't", 'you', "you'd", "you'll", "you're", "you've", 'your',
  'yours', 'yourself', 'yourselves',
]);

/** 分词选项 */
export interface TokenizerOptions {
  ngramSize?: number;
}

/**
 * 中文 n-gram 分词（字符级）
 */
export function chineseNgram(text: string, n = 2): string[] {
  if (!text || text.length < n) return [];
  const result: string[] = [];
  for (let i = 0; i <= text.length - n; i++) {
    result.push(text.substring(i, i + n));
  }
  return result;
}

/**
 * 分词器函数
 * 英文按空格分，中文用 ngram 分
 */
export function tokenize(text: string, options: TokenizerOptions = {}): string[] {
  const { ngramSize = 2 } = options;
  const tokens: string[] = [];
  if (!text) return tokens;

  // 替换标点为空格
  let processedText = text;
  punctuationStopWords.forEach((sw) => {
    processedText = processedText.replace(
      new RegExp(sw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'),
      ' '
    );
  });
  processedText = processedText.replace(/[.,!?;:()[\]{}"'`~@#$%^&*+=|\\<>\-]/g, ' ');

  const parts = processedText.split(/\s+/).filter(Boolean);
  for (const part of parts) {
    const segments = part.match(/[\u4e00-\u9fa5]+|[^\u4e00-\u9fa5]+/g) || [part];
    for (const segment of segments) {
      if (/[\u4e00-\u9fa5]/.test(segment)) {
        tokens.push(...chineseNgram(segment, ngramSize));
      } else {
        const numMatch = segment.match(/^([^_\d]*)([_\d]+)$/);
        if (numMatch) {
          if (numMatch[1]) {
            tokens.push(numMatch[1]);
            tokens.push(numMatch[1] + numMatch[2]);
          } else {
            tokens.push(numMatch[2]);
          }
        } else {
          tokens.push(segment);
        }
      }
    }
  }

  return tokens;
}

/**
 * token 数组 → 词频向量（过滤停用词）
 */
export function token2vec(
  tokens: string[],
  stopWords: Set<string> = STOP_WORDS,
  features: Record<string, number> = {}
): Record<string, number> {
  for (const token of tokens) {
    if (token && !stopWords.has(token)) {
      features[token] = (features[token] || 0) + 1;
    }
  }
  return features;
}

/**
 * 文本 → 词频向量
 */
export function text2vec(
  text: string,
  features: Record<string, number> = {}
): Record<string, number> {
  if (!text) return features;
  return token2vec(tokenize(text), STOP_WORDS, features);
}

/**
 * 获取停用词集合
 */
export function getStopWords(): Set<string> {
  return new Set(STOP_WORDS);
}
