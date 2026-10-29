import { defineConfig } from 'vite';

export default defineConfig({
  // Caminhos relativos: o build funciona em qualquer endereço, inclusive no
  // GitHub Pages (https://usuario.github.io/nome-do-repositorio/).
  base: './',
  // O Three.js com os efeitos passa de 500 kB; o aviso padrão não ajuda aqui.
  build: { chunkSizeWarningLimit: 2000 },
  server: { port: 5180, strictPort: true },
});
