import vue from 'eslint-plugin-vue'
import globals from 'globals'

export default [
  { ignores: ['.cache/**', 'dist/**', 'node_modules/**', 'public/data/**', 'test-results/**'] },
  ...vue.configs['flat/recommended'],
  {
    files: ['**/*.{js,mjs,vue}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'vue/html-self-closing': 'off',
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
    },
  },
]
