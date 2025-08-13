module.exports = {
    env: {
      browser: false,
      es6: true,
      mocha: true,
      node: true,
    },
    plugins: ["@typescript-eslint"],
    extends: [
      "@nomicfoundation/eslint-config-hardhat",
      "@nomicfoundation/eslint-config-hardhat/mixins/typescript",
    ],
    parser: "@typescript-eslint/parser",
    parserOptions: {
      ecmaVersion: 2020,
      sourceType: "module",
    },
    rules: {},
  };