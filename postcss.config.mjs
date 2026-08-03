/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    // Tailwind 4: PostCSS eklentisi ayri pakete tasindi. 'tailwindcss'i dogrudan
    // plugin olarak vermek "PostCSS plugin has moved to a separate package"
    // hatasi veriyor -- PR#323 CI'sinde Build ve E2E tam bu yuzden dusuyordu.
    '@tailwindcss/postcss': {},
    // autoprefixer YOK: Tailwind 4 vendor-prefix'leri Lightning CSS ile kendisi
    // uyguluyor, ustune autoprefixer kosturmak gereksiz.
  },
}

export default config
