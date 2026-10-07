<script setup lang="ts">
import type { NuxtError } from '#app';

/**
 * Last-resort page. Anything the app can explain — an expired session, a failed
 * sync, an empty filter — is handled where it happens; this only catches a
 * genuinely unexpected render error or an unknown route.
 */
const props = defineProps<{ error: NuxtError }>();

const notFound = computed(() => props.error?.statusCode === 404);
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-bg px-4">
    <div class="w-full max-w-md">
      <EmptyState
        illustration="error"
        :title="notFound ? 'That page isn\'t here' : 'Something went wrong'"
        :description="
          notFound
            ? 'The link may be out of date. Your archive is untouched.'
            : 'Your archive is safe. Reloading usually clears this.'
        "
      >
        <template #action>
          <button type="button" class="btn btn-primary" @click="clearError({ redirect: '/' })">
            Back to library
          </button>
        </template>
      </EmptyState>
    </div>
  </div>
</template>
