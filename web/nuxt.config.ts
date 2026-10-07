import tailwindcss from '@tailwindcss/vite';

/**
 * XVault web app.
 *
 * **Why `ssr: false`.**
 *
 * Every page in this product is behind authentication, and the only long-lived
 * credential is an httpOnly refresh cookie scoped to `/api/auth` on the API
 * origin. Server-rendering would mean forwarding that cookie from the Nuxt
 * server to the API on every request and holding a per-request access token on
 * the server — real complexity, and a second place where a token could leak.
 *
 * There is nothing to gain in return: a private archive has no SEO value and no
 * anonymous first paint worth optimising. Shipping a SPA keeps exactly one
 * token holder (the browser tab, in memory) and one session boundary.
 *
 * Tradeoff: a blank frame until the JS bundle loads. That is paid for with a
 * skeleton shell rather than a spinner (DESIGN.md §24).
 */
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  ssr: false,
  devtools: { enabled: false },

  css: ['~/assets/css/main.css'],

  vite: {
    plugins: [tailwindcss()],
  },

  runtimeConfig: {
    public: {
      // Override in production with NUXT_PUBLIC_API_BASE.
      apiBase: 'http://localhost:4000/api',
    },
  },

  app: {
    head: {
      title: 'XVault',
      htmlAttrs: { lang: 'en' },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'light dark' },
        { name: 'description', content: 'A permanent, organised archive of the things you bookmarked.' },
        // A private archive should never end up in an index.
        { name: 'robots', content: 'noindex, nofollow' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap',
        },
      ],
    },
  },

  typescript: {
    strict: true,
    // Type checking is a separate command (`npm run typecheck`), not a dev-server tax.
    typeCheck: false,
  },
});
