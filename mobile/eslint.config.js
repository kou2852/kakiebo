// このプロジェクトは JS のみ。eslint-config-expo は typescript-eslint を引きずり、
// TypeScript のバージョン非互換で動かないため使わない。
// 実際に効かせたいのは「Hooks の依存漏れ」と「未定義・未使用の参照」。
const js = require('@eslint/js');
const react = require('eslint-plugin-react');
const reactHooks = require('eslint-plugin-react-hooks');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', '.expo/**', 'dist/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node, __DEV__: 'readonly' },
    },
    plugins: { react, 'react-hooks': reactHooks },
    settings: { react: { version: 'detect' } },
    rules: {
      ...react.configs.flat.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',   // 新しい JSX 変換では不要
      'react/prop-types': 'off',           // 型で縛る方針を取っていない
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // 日本語を扱うので、正規表現の中の全角スペースや BOM は意図した記述。
      // このルールが本来捕まえたいのは「コード中に紛れ込んだ全角スペース」の方で、
      // そちらは引き続き検出される。
      'no-irregular-whitespace': ['error', { skipRegExps: true, skipStrings: true }],
    },
  },
  {
    // Web 版 frontend/src/utils/ からの逐語コピー。追従を楽にするため差分を作らない。
    // 全角スペースは日本語の金額表記を除去する正規表現で意図的に使っている。
    files: ['src/utils/csv.js', 'src/utils/bookkeeping.js', 'src/utils/creditCard.js', 'src/utils/autoGen.js', 'src/utils/journalTags.js'],
    rules: {
      'no-useless-escape': 'off',
      'no-unused-vars': 'off',
    },
  },
];
