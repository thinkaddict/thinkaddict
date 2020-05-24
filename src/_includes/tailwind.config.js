const theme = require('tailwindcss/defaultTheme');

const { fontFamily } = theme;

module.exports = {
  purge: [],
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
