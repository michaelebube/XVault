<script setup lang="ts">
/**
 * Small line-art illustrations for empty and recovery states (DESIGN.md §29).
 *
 * Drawn here rather than pulled in as unDraw assets so they inherit the
 * application's own palette in both themes — a flat SVG with baked-in colours
 * looks wrong the moment dark mode is on. They stay geometric and quiet: the
 * message is the point, the drawing is support.
 */
withDefaults(
  defineProps<{
    name: 'library' | 'search' | 'category' | 'connect' | 'error';
    size?: number;
  }>(),
  { size: 104 },
);
</script>

<template>
  <svg
    :width="size"
    :height="size * 0.72"
    viewBox="0 0 160 116"
    fill="none"
    aria-hidden="true"
    class="text-line-strong"
  >
    <!-- An archive: cards stacking up into a collection. -->
    <g v-if="name === 'library'">
      <rect
        x="34"
        y="26"
        width="92"
        height="24"
        rx="6"
        class="fill-surface-subtle stroke-current"
        stroke-width="1.5"
      />
      <rect
        x="26"
        y="46"
        width="108"
        height="26"
        rx="7"
        class="fill-surface stroke-current"
        stroke-width="1.5"
      />
      <rect
        x="18"
        y="68"
        width="124"
        height="30"
        rx="8"
        class="fill-surface stroke-current"
        stroke-width="1.5"
      />
      <circle cx="34" cy="83" r="6" class="fill-accent-subtle stroke-accent" stroke-width="1.5" />
      <path d="M50 79h58M50 88h38" class="stroke-current" stroke-width="1.5" stroke-linecap="round" />
      <path
        d="M80 8v10M66 13l4 6M94 13l-4 6"
        class="stroke-accent"
        stroke-width="1.5"
        stroke-linecap="round"
      />
    </g>

    <!-- A search that came back with nothing. -->
    <g v-else-if="name === 'search'">
      <rect
        x="20"
        y="24"
        width="120"
        height="68"
        rx="10"
        class="fill-surface stroke-current"
        stroke-width="1.5"
      />
      <path
        d="M36 44h40M36 56h64M36 68h28"
        class="stroke-current"
        stroke-width="1.5"
        stroke-linecap="round"
      />
      <circle cx="104" cy="70" r="20" class="fill-surface stroke-accent" stroke-width="1.75" />
      <path d="M118 84l12 12" class="stroke-accent" stroke-width="2" stroke-linecap="round" />
      <path d="M97 63l14 14M111 63l-14 14" class="stroke-accent" stroke-width="1.5" stroke-linecap="round" />
    </g>

    <!-- An empty category: a labelled but unfilled shelf. -->
    <g v-else-if="name === 'category'">
      <path
        d="M22 34a6 6 0 0 1 6-6h24l8 10h50a6 6 0 0 1 6 6v42a6 6 0 0 1-6 6H28a6 6 0 0 1-6-6z"
        class="fill-surface stroke-current"
        stroke-width="1.5"
      />
      <path d="M22 56h116" class="stroke-current" stroke-width="1.5" />
      <circle cx="40" cy="74" r="5" class="fill-accent-subtle stroke-accent" stroke-width="1.5" />
      <path d="M54 74h44" class="stroke-current" stroke-width="1.5" stroke-linecap="round" />
    </g>

    <!-- Connect X: two halves of a link, not yet joined. -->
    <g v-else-if="name === 'connect'">
      <rect
        x="16"
        y="40"
        width="54"
        height="36"
        rx="10"
        class="fill-surface stroke-current"
        stroke-width="1.5"
      />
      <rect
        x="90"
        y="40"
        width="54"
        height="36"
        rx="10"
        class="fill-surface stroke-accent"
        stroke-width="1.5"
      />
      <path d="M70 58h8M82 58h8" class="stroke-accent" stroke-width="2" stroke-linecap="round" />
      <path
        d="M104 52l16 12M120 52l-16 12"
        class="stroke-accent"
        stroke-width="1.75"
        stroke-linecap="round"
      />
      <path d="M32 52h22M32 64h14" class="stroke-current" stroke-width="1.5" stroke-linecap="round" />
    </g>

    <!-- Something failed, nothing was lost. -->
    <g v-else>
      <rect
        x="24"
        y="28"
        width="112"
        height="60"
        rx="10"
        class="fill-surface stroke-current"
        stroke-width="1.5"
      />
      <path d="M24 46h112" class="stroke-current" stroke-width="1.5" />
      <path
        d="M80 56v14M80 78h.01"
        class="stroke-warning"
        stroke-width="2.5"
        stroke-linecap="round"
      />
      <circle cx="38" cy="37" r="2.5" class="fill-current" />
      <circle cx="48" cy="37" r="2.5" class="fill-current" />
    </g>
  </svg>
</template>
