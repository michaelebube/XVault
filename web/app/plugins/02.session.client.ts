/**
 * Restores the session before the first route is evaluated.
 *
 * Awaiting here is the point: Nuxt runs plugins to completion before route
 * middleware, so `auth.global.ts` sees a settled session instead of guessing.
 * Without the await, every reload would bounce the user to /login and then back
 * again once the refresh landed.
 */
export default defineNuxtPlugin(async () => {
  await useAuth().bootstrap();
});
