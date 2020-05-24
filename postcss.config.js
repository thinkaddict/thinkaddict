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
    // cssnano({
    //   preset: 'default'
    // }),
    // postcssPurgecss({
    //   content: [
    //     './_site/**/*.html'
    //   ],
    //   css: [
    //     './_site/assets/main.css'
    //   ],
    //   defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || []
    //   // defaultExtractor: content => content.match(/[A-Za-z0-9-_:/]+/g) || []
    // }),
  ]
}

module.exports = { plugins };