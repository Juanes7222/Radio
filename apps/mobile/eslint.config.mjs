import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import { defineConfig, globalIgnores } from 'eslint/config';

/**
 * React Native (Expo) globals not covered by the standard ECMAScript globals.
 */
const reactNativeGlobals = {
  __DEV__: 'readonly',
  global: 'readonly',
  process: 'readonly',
  require: 'readonly',
  module: 'readonly',
  fetch: 'readonly',
  URL: 'readonly',
  FormData: 'readonly',
  AbortController: 'readonly',
  Headers: 'readonly',
  Request: 'readonly',
  Response: 'readonly',
  Blob: 'readonly',
  setTimeout: 'readonly',
  clearTimeout: 'readonly',
  setInterval: 'readonly',
  clearInterval: 'readonly',
  requestAnimationFrame: 'readonly',
  cancelAnimationFrame: 'readonly',
};

export default defineConfig([
  globalIgnores(['node_modules', '.expo', 'dist', 'build', 'assets', '*.config.js']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.es2021,
        ...reactNativeGlobals,
      },
    },
    rules: {
      // RN's Animated API stores the animation value in a ref that is read
      // during render to build styles (useRef(new Animated.Value(0)).current).
      // The compiler rule cannot model this idiomatic pattern.
      'react-hooks/refs': 'off',
      // Screens legitimately set loading state on mount inside effects.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]);
