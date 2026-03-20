/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./src/pages/*",
    "./src/pages/*/*",
    "./src/components/blocks/*",
    "./src/components/icons/*"
  ],
  theme: {
    extend: {
      height: {
        '6.5':'25px'
      },
      screens: {
        'xs': '350px',
        'xssm': '425px',
        'mdlg': '900px'
      },
      colors: {
        'transparent-black': 'rgb(0 0 0 / 80%)',
        'more-transparent-black': 'rgb(0 0 0 / 65%)',
        'dark-grey': '#101010'
      },
      backgroundImage: {
        'black-gradient':'linear-gradient(90deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.6) 55%, rgba(0,0,0,0) 100%)',
        'black-transparent-gradient': 'linear-gradient(0deg, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%);'
      },
      boxShadow: {
        'dark': '0 0 20px black'
      },
      borderWidth: {
        'half': '0.5px'
      }
    }
  },
  safelist: [
    {
      pattern: /bg-[url(`.*?`)]/,
    },
  ],
  plugins: [],
}

