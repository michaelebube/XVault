// plugins/firebase.client.js
import { initializeApp, getApps } from "firebase/app";
import { getFirestore } from "firebase/firestore";

export default defineNuxtPlugin(() => {
  const firebaseConfig = {
    apiKey: import.meta.env.NUXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: import.meta.env.NUXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.NUXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.NUXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.NUXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.NUXT_PUBLIC_FIREBASE_APP_ID,
  };

  const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
  const db = getFirestore(app);

  return { provide: { db } };
});
