const postcssImport = require('postcss-import');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');
const postcssPurgecss = require('@fullhuman/postcss-purgecss');
const cssnano = require('cssnano');

let plugins = [
  postcssImport({
    path: [
      './src/_sass'
    ]
  }),
  tailwindcss('./src/_includes/tailwind.config.js'),
  autoprefixer,
];

if (process.env.JEKYLL_ENV == 'production') {
  plugins = [
    ...plugins,
    cssnano({
      preset: 'default'
    })
  ]
}

module.exports = { plugins };