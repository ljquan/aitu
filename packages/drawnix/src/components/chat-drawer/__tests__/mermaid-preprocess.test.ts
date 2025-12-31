/**
 * Tests for Mermaid code preprocessing
 *
 * These tests verify that the preprocessing function correctly
 * handles special characters in node labels.
 */

// Copy of the preprocessing function for testing
function preprocessMermaidCode(code: string): string {
  let processed = code;

  // Fix bracket content with special characters
  processed = processed.replace(
    /\[([^\]]*[:\,\=\(\)\|\/\\][^\]]*)\]/g,
    (match, content) => {
      if (content.startsWith('"') && content.endsWith('"')) {
        return match;
      }
      if (content.startsWith("'") && content.endsWith("'")) {
        return match;
      }
      return `["${content}"]`;
    }
  );

  // Fix parenthesis content with special characters
  processed = processed.replace(
    /\(([^\)]*[:\,\=\[\]\|\/\\][^\)]*)\)/g,
    (match, content) => {
      if (content.startsWith('"') && content.endsWith('"')) {
        return match;
      }
      if (content.startsWith("'") && content.endsWith("'")) {
        return match;
      }
      return `("${content}")`;
    }
  );

  // Fix curly braces content with special characters
  processed = processed.replace(
    /\{([^\}]*[:\,\=\[\]\(\)\|\/\\][^\}]*)\}/g,
    (match, content) => {
      if (content.startsWith('"') && content.endsWith('"')) {
        return match;
      }
      if (content.startsWith("'") && content.endsWith("'")) {
        return match;
      }
      return `{"${content}"}`;
    }
  );

  return processed;
}

describe('Mermaid Code Preprocessing', () => {
  it('should add quotes to bracket content with colons', () => {
    const input = 'A[盒内解: sin(kx)]';
    const expected = 'A["盒内解: sin(kx)"]';
    expect(preprocessMermaidCode(input)).toBe(expected);
  });

  it('should add quotes to bracket content with commas', () => {
    const input = 'D[边界条件: ψ(0)=0, ψ(L)=0]';
    const expected = 'D["边界条件: ψ(0)=0, ψ(L)=0"]';
    expect(preprocessMermaidCode(input)).toBe(expected);
  });

  it('should add quotes to bracket content with equals signs', () => {
    const input = 'E[k = nπ/L]';
    const expected = 'E["k = nπ/L"]';
    expect(preprocessMermaidCode(input)).toBe(expected);
  });

  it('should add quotes to parenthesis content with special chars', () => {
    const input = 'B(Go shopping: buy items)';
    const expected = 'B("Go shopping: buy items")';
    expect(preprocessMermaidCode(input)).toBe(expected);
  });

  it('should add quotes to curly braces content with special chars', () => {
    const input = 'C{Let me think: option A, B}';
    const expected = 'C{"Let me think: option A, B"}';
    expect(preprocessMermaidCode(input)).toBe(expected);
  });

  it('should not modify already quoted content', () => {
    const input = 'A["Already quoted: text"]';
    expect(preprocessMermaidCode(input)).toBe(input);
  });

  it('should handle the quantum mechanics example', () => {
    const input = `graph TB
    A[一维无限深势阱] --> B[薛定谔方程]
    B --> C[盒内解: sin(kx)]
    B --> D[边界条件: ψ(0)=0, ψ(L)=0]
    D --> E[k = nπ/L]
    E --> F[能量离散: E_n]
    F --> G[归一化波函数 ψ_n(x)]
    G --> H[量子数 n = 1,2,3,...]
    H --> I[概率分布 |ψ|²]`;

    const result = preprocessMermaidCode(input);

    // Check that special chars are quoted
    expect(result).toContain('["盒内解: sin(kx)"]');
    expect(result).toContain('["边界条件: ψ(0)=0, ψ(L)=0"]');
    expect(result).toContain('["k = nπ/L"]');
    expect(result).toContain('["能量离散: E_n"]');
    expect(result).toContain('["归一化波函数 ψ_n(x)"]');
    expect(result).toContain('["量子数 n = 1,2,3,..."]');
    expect(result).toContain('["概率分布 |ψ|²"]');
  });

  it('should handle content without special characters unchanged', () => {
    const input = 'A[Simple text] --> B[Another text]';
    expect(preprocessMermaidCode(input)).toBe(input);
  });

  it('should handle complex flowchart example', () => {
    const input = `flowchart TD
    A[Christmas] -->|Get money| B(Go shopping)
    B --> C{Let me think: A or B}
    C -->|One| D[Laptop]
    C -->|Two| E[iPhone]`;

    const result = preprocessMermaidCode(input);

    // Links should remain unquoted
    expect(result).toContain('|Get money|');
    expect(result).toContain('|One|');
    expect(result).toContain('|Two|');

    // Decision node with special chars should be quoted
    expect(result).toContain('{"Let me think: A or B"}');
  });
});
