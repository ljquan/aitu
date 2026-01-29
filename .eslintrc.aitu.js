// Opentu 项目 ESLint 配置
// 基于编码规范 docs/CODING_STANDARDS.md
module.exports = {
  extends: [
    '@nx/eslint-plugin/typescript',
    '@nx/eslint-plugin/react',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  rules: {
    // TypeScript 规范
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/prefer-interface': 'off', // 我们有自己的规则
    '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
    
    // React 规范
    'react/prop-types': 'off', // 使用 TypeScript
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'error',
    'react/jsx-pascal-case': 'error',
    'react/jsx-no-useless-fragment': 'error',
    
    // 命名规范
    '@typescript-eslint/naming-convention': [
      'error',
      {
        selector: 'interface',
        format: ['PascalCase'],
        custom: {
          regex: '^I[A-Z]',
          match: false
        }
      },
      {
        selector: 'typeAlias',
        format: ['PascalCase']
      },
      {
        selector: 'enum',
        format: ['PascalCase']
      },
      {
        selector: 'enumMember',
        format: ['UPPER_CASE']
      },
      {
        selector: 'variable',
        format: ['camelCase', 'PascalCase', 'UPPER_CASE']
      },
      {
        selector: 'function',
        format: ['camelCase', 'PascalCase']
      }
    ],
    
    // 代码质量
    'prefer-const': 'error',
    'no-var': 'error',
    'no-console': 'warn',
    'no-debugger': 'error',
    
    // 文件大小检查 (通过自定义规则)
    'max-lines': ['error', { max: 500, skipBlankLines: true, skipComments: true }],
    'max-lines-per-function': ['warn', { max: 100, skipBlankLines: true, skipComments: true }],
    
    // 复杂度控制
    'complexity': ['warn', 10],
    'max-depth': ['warn', 4],
    'max-params': ['warn', 4],
    
    // 导入规范
    'import/order': [
      'error',
      {
        groups: [
          'builtin',
          'external', 
          'internal',
          'parent',
          'sibling',
          'index'
        ],
        'newlines-between': 'always'
      }
    ],
    
    // React 特定规则
    'react/jsx-curly-brace-presence': ['error', { props: 'never', children: 'never' }],
    'react/self-closing-comp': 'error',
    'react/jsx-boolean-value': ['error', 'never'],
    
    // 安全规范
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
  },
  overrides: [
    {
      files: ['**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}'],
      rules: {
        // 测试文件允许更宽松的规则
        '@typescript-eslint/no-explicit-any': 'off',
        'max-lines': 'off',
      }
    },
    {
      files: ['**/*.stories.{ts,tsx}'],
      rules: {
        // Storybook 文件允许更宽松的规则
        'max-lines': 'off',
      }
    }
  ]
};