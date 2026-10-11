<script setup lang="ts">
/**
 * Sign-in shell.
 *
 * Deliberately not the app shell: nothing on these routes is user-scoped, so
 * there is no sidebar, no sync poller and no category fetch to start. Keeping
 * them on a separate layout also means an unauthenticated visitor never mounts
 * a component that would immediately 401.
 */
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-bg text-ink">
    <main class="flex flex-1 items-center justify-center px-4 py-12">
      <div class="w-full max-w-sm">
        <div class="mb-7 flex items-center gap-2.5">
          <span
            class="brand-mark size-8 text-[14px]"
            aria-hidden="true"
          >
            X
          </span>
          <span class="text-[17px] font-semibold tracking-tight text-ink">XVault</span>
        </div>

        <slot />
      </div>
    </main>

    <footer class="px-4 pb-8 text-center">
      <p class="text-[12px] text-ink-muted">A permanent archive of the things you bookmarked.</p>
    </footer>
  </div>
</template>
