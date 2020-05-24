module.exports = {
  content: [
    './_site/**/*.html'
  ],
  css: [
    './_site/assets/main.css'
  ],
  defaultExtractor: content => content.match(/[\w-/:]+(?<!:)/g) || []
};
