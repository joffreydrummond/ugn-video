module.exports = {
  content: { relative: true, files: ['./index.html', './src/**/*.{ts,tsx}'] },
  corePlugins: { preflight: false },
  theme: { extend: {
    colors: { primary: '#DC2626', canvas: '#101014', panel: '#1b1b22' },
    fontFamily: { sans: ['Montserrat', 'sans-serif'], heading: ['Bebas Neue', 'sans-serif'] },
  } },
};
