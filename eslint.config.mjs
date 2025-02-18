import eslint from '@eslint/js';
import eslintConfigPrettier from 'eslint-config-prettier';
import eslintPluginVue from 'eslint-plugin-vue';
import globals from 'globals';
import typescriptEslint from 'typescript-eslint';

export default typescriptEslint.config(
    { ignores: ['*.d.ts', '**/coverage', '**/dist'] },
    {
        extends: [
            eslint.configs.recommended,
            ...typescriptEslint.configs.recommended,
            ...eslintPluginVue.configs['flat/recommended']
        ],
        files: ['**/*.{ts,vue}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: globals.browser,
            parserOptions: {
                parser: typescriptEslint.parser
            }
        },
        rules: {
            'vue/html-indent': ['error', 2],
            'vue/multi-word-component-names': 'warn',
            'vue/max-attributes-per-line': [
                'error',
                {
                    singleline: {
                        max: 3
                    },
                    multiline: {
                        max: 1,
                        allowFirstLine: false
                    }
                }
            ],
            'vue/singleline-html-element-content-newline': 'off',
            'vue/multiline-html-element-content-newline': 'off',
            'vue/component-definition-name-casing': ['error', 'PascalCase'],
            'vue/no-v-html': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            semi: ['error', 'always'],
            quotes: ['error', 'single'],
            indent: ['error', 2],
            'comma-dangle': ['error', 'never']
        },
        ignores: ['eslint.config.mjs']
    },
    eslintConfigPrettier
);
