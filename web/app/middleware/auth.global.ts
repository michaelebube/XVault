/**
 * Route protection.
 *
 * This is a convenience, not a security boundary: the API enforces ownership on
 * every request (AGENT.md §7), so a user who defeats this middleware sees an
 * empty shell and a string of 401s, not someone else's archive.
 */
export default defineNuxtRouteMiddleware((to) => {
  const user = useCurrentUser();
  const signedIn = user.value !== null;
  const isAuthRoute = AUTH_ROUTES.includes(to.path);

  if (!signedIn && !isAuthRoute) {
    return navigateTo({
      path: '/login',
      // Remember where they were headed, so sign-in lands them there.
      ...(to.fullPath !== '/' ? { query: { redirect: to.fullPath } } : {}),
    });
  }

  if (signedIn && isAuthRoute) {
    return navigateTo('/');
  }
});
