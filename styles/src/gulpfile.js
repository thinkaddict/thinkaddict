const { watch, src, dest } = require('gulp');
const postcss = require('gulp-postcss');
const postcssImport = require('postcss-import');
const tailwindcss = require('tailwindcss');
const autoprefixer = require('autoprefixer');
const cssnano = require('cssnano');

const css = () => {
  return src('styles/main.css')
    .pipe(postcss([
      postcssImport(),
      tailwindcss('./tailwind.config.js'),
      autoprefixer,
      cssnano({
        preset: 'default'
      })  
    ]))
    .pipe(dest('site/assets/'));
};

exports.default = () => {
  let watchFiles = [
    'tailwind.config.js',
    'styles/**/*.css',
    'site/**/*.html'
  ];
  
  watch(watchFiles, { ignoreInitial: false }, css);
};