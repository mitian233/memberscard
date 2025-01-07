module.exports = {
    root: true,
    env: {
        browser: true,
        es2021: true,
        node: true
    },
    extends: [
        'eslint:recommended',
        'plugin:vue/vue3-recommended',
        '@vue/typescript/recommended',
        'prettier'
    ],
    parserOptions: {
        ecmaVersion: 2021,
        sourceType: 'module'
    },
    rules: {
        'vue/html-indent': ['error', 4],
        'vue/max-attributes-per-line': ['error', {
            'singleline': 3,
            'multiline': {
                'max': 1,
                'allowFirstLine': false
            }
        }],
        'vue/singleline-html-element-content-newline': 'off',
        'vue/multiline-html-element-content-newline': 'off',
        'vue/name-property-casing': ['error', 'PascalCase'],
        'vue/no-v-html': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        'semi': ['error', 'always'],
        'quotes': ['error', 'single'],
        'indent': ['error', 4],
        'comma-dangle': ['error', 'never']
    }
};
