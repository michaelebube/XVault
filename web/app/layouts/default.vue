<script setup lang="ts">
/**
 * Application shell (DESIGN.md §12/§13).
 *
 * The sidebar is a permanent column on desktop and a drawer on mobile — same
 * component, two presentations, so navigation never drifts between the two.
 * The shell itself stays put while page content changes.
 */
const drawerOpen = ref(false);
const route = useRoute();
const { poll } = useSync();

// One poller for the whole session, owned by the shell rather than by a page,
// so navigating between library and settings does not restart the timer.
poll();

watch(
  () => route.fullPath,
  () => (drawerOpen.value = false),
);

watch(drawerOpen, (open) => {
  if (import.meta.client) document.body.style.overflow = open ? 'hidden' : '';
});

onBeforeUnmount(() => {
  if (import.meta.client) document.body.style.overflow = '';
});
</script>

<template>
  <div class="min-h-dvh bg-bg">
    <!-- Desktop sidebar -->
    <aside
      class="fixed inset-y-0 left-0 z-20 hidden w-60 border-r border-line bg-surface-subtle lg:block"
    >
      <AppSidebar />
    </aside>

    <!-- Mobile drawer -->
    <Transition
      enter-active-class="transition-opacity duration-200"
      enter-from-class="opacity-0"
      leave-active-class="transition-opacity duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-if="drawerOpen"
        class="fixed inset-0 z-40 bg-black/40 lg:hidden"
        @click="drawerOpen = false"
      />
    </Transition>
    <Transition
      enter-active-class="transition-transform duration-200 ease-out"
      enter-from-class="-translate-x-full"
      leave-active-class="transition-transform duration-150 ease-in"
      leave-to-class="-translate-x-full"
    >
      <aside
        v-if="drawerOpen"
        class="fixed inset-y-0 left-0 z-40 w-[17rem] border-r border-line bg-surface-subtle lg:hidden"
      >
        <AppSidebar @navigate="drawerOpen = false" />
      </aside>
    </Transition>

    <div class="lg:pl-60">
      <AppTopbar @open-nav="drawerOpen = true" />
      <main class="mx-auto w-full max-w-3xl px-4 pb-20 pt-5 sm:px-6">
        <slot />
      </main>
    </div>
  </div>
</template>
