<template>
  <div class="min-h-screen bg-gray-100 p-6">
    <div class="max-w-3xl mx-auto">
      <h1 class="text-2xl font-bold mb-6">My Tweet Bookmarks</h1>

      <div v-if="loading" class="text-gray-500 text-center">Loading tweets…</div>
      <div v-else-if="tweets.length === 0" class="text-gray-400 text-center">
        No bookmarks yet.
      </div>

      <div class="space-y-4">
        <div
          v-for="tweet in tweets"
          :key="tweet.id"
          class="bg-white p-4 rounded-xl shadow-sm hover:shadow-md transition"
        >
          <div class="flex items-center justify-between mb-2">
            <div>
              <p class="font-semibold text-gray-900">{{ tweet.author || 'Unknown Author' }}</p>
              <p class="text-sm text-gray-500">@{{ tweet.author }}</p>
            </div>
            <p class="text-xs text-gray-400">{{ formatDate(tweet.dateCreated) }}</p>
          </div>

          <p class="text-gray-800 whitespace-pre-wrap">{{ tweet.text }}</p>

          <div class="mt-3">
            <a
              v-if="tweet.url"
              :href="tweet.url"
              target="_blank"
              class="text-blue-600 text-sm hover:underline"
            >
              View on X
            </a>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { collection, getDocs } from 'firebase/firestore';


const { $db } = useNuxtApp();
const tweets = ref([]);
const loading = ref(true);

// Replace with real userId when you add auth
const userId = 'testUser';

async function loadTweets() {
  const col = collection($db, 'users', userId, 'bookmarks');
  const snapshot = await getDocs(col);
  tweets.value = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  loading.value = false;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

onMounted(loadTweets);
</script>
