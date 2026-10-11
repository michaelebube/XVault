<script setup lang="ts">
const emit = defineEmits<{ navigate: [] }>();

const { user, logout } = useAuth();
const { preference, set } = useTheme();
const { open, root, close, toggle } = useDismissable();

const THEMES = [
  { value: 'light', label: 'Light', icon: 'sun' },
  { value: 'dark', label: 'Dark', icon: 'moon' },
  { value: 'system', label: 'System', icon: 'settings' },
] as const;

async function signOut(): Promise<void> {
  close();
  await logout();
  await navigateTo('/login');
}
</script>

<template>
  <div ref="root" class="relative">
    <button
      type="button"
      data-popover-trigger
      class="flex w-full items-center gap-2.5 rounded-button px-2.5 py-1.5 text-left transition-colors hover:bg-surface-subtle"
      :aria-expanded="open"
      aria-haspopup="menu"
      @click="toggle()"
    >
      <span
        class="flex size-6 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-[10px] font-semibold text-ink-secondary"
      >
        {{ initials(user?.displayName ?? user?.email) }}
      </span>
      <span class="min-w-0 flex-1">
        <span class="block truncate text-[13px] font-medium text-ink">
          {{ user?.displayName ?? 'Account' }}
        </span>
      </span>
      <AppIcon name="chevronDown" :size="14" class="text-ink-muted" />
    </button>

    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 translate-y-1"
      leave-active-class="transition duration-100 ease-in"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="absolute bottom-full left-0 z-30 mb-1.5 w-60 overflow-hidden rounded-card border border-line bg-surface-elevated py-1 shadow-[var(--shadow-pop)]"
        role="menu"
      >
        <div class="border-b border-line px-3 py-2">
          <p class="truncate text-[13px] font-medium text-ink">{{ user?.displayName }}</p>
          <p class="truncate text-[12px] text-ink-muted">{{ user?.email }}</p>
        </div>

        <div class="border-b border-line px-3 py-2">
          <p class="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-ink-muted">
            Theme
          </p>
          <div class="flex gap-1">
            <button
              v-for="option in THEMES"
              :key="option.value"
              type="button"
              class="flex flex-1 items-center justify-center gap-1.5 rounded-control border px-2 py-1 text-[12px] transition-colors"
              :class="
                preference === option.value
                  ? 'border-line-strong bg-accent-subtle text-ink'
                  : 'border-line text-ink-secondary hover:border-line-strong hover:text-ink'
              "
              :aria-pressed="preference === option.value"
              @click="set(option.value)"
            >
              <AppIcon :name="option.icon" :size="13" />
              {{ option.label }}
            </button>
          </div>
        </div>

        <NuxtLink
          to="/settings"
          class="flex items-center gap-2.5 px-3 py-2 text-sm text-ink transition-colors hover:bg-surface-subtle"
          role="menuitem"
          @click="close(); emit('navigate')"
        >
          <AppIcon name="settings" :size="15" class="text-ink-muted" />
          Settings
        </NuxtLink>

        <button
          type="button"
          class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-surface-subtle"
          role="menuitem"
          @click="signOut"
        >
          <AppIcon name="logout" :size="15" class="text-ink-muted" />
          Sign out
        </button>
      </div>
    </Transition>
  </div>
</template>
