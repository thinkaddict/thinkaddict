const theme = require('tailwindcss/defaultTheme');

const { fontFamily } = theme;

module.exports = {
  purge: {
    enabled: true,
    content: [
      'site/**/*.html'
    ]
  },
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter var', ...fontFamily.sans],
      }
    },
  },
  variants: {},
  plugins: [
    require('@tailwindcss/ui')
  ]
};
