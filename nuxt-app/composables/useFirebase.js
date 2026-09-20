export const useFirebase = () => {
  const nuxt = useNuxtApp();
  return nuxt.$firebase;
};
