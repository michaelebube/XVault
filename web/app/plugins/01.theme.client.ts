export default defineNuxtPlugin(() => {
  // Runs before the first route renders, so the interface never flashes light
  // before switching to the user's saved dark preference.
  useTheme().init();
});
