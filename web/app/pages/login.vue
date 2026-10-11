<script setup lang="ts">
definePageMeta({ layout: 'auth' });

const route = useRoute();
const { login } = useAuth();

const email = ref('');
const password = ref('');
const pending = ref(false);
const error = ref<string | null>(null);

const expired = computed(() => route.query.expired === '1');

/**
 * Only ever follow a same-site path. `//evil.example` is a valid value for
 * `location.assign`, so a bare "starts with /" check is not enough — an attacker
 * who can get a user to click `?redirect=//evil.example` would otherwise have a
 * login-branded open redirect.
 */
function safeRedirect(value: unknown): string {
  return typeof value === 'string' && /^\/(?!\/)/.test(value) ? value : '/';
}

async function submit(): Promise<void> {
  if (pending.value) return;
  pending.value = true;
  error.value = null;

  try {
    await login(email.value.trim(), password.value);
    await navigateTo(safeRedirect(route.query.redirect));
  } catch (err) {
    error.value = errorMessage(err, 'Could not sign you in.');
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="card p-6">
    <h1 class="text-[20px] font-semibold tracking-tight text-ink">Welcome back</h1>
    <p class="mt-1 text-sm text-ink-secondary">Sign in to open your archive.</p>

    <p
      v-if="expired"
      class="mt-4 flex items-start gap-2 rounded-card border border-line bg-surface-subtle p-3 text-[13px] text-ink-secondary"
    >
      <AppIcon name="info" :size="15" class="mt-px shrink-0 text-info" />
      <span>Your session ended. Sign in again to continue.</span>
    </p>

    <form class="mt-5 space-y-4" novalidate @submit.prevent="submit">
      <div>
        <label class="label" for="login-email">Email</label>
        <input
          id="login-email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
          class="field"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label class="label" for="login-password">Password</label>
        <input
          id="login-password"
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
          class="field"
          placeholder="••••••••••"
        />
      </div>

      <p
        v-if="error"
        role="alert"
        class="flex items-start gap-2 rounded-card border border-line bg-surface-subtle p-3 text-[13px] text-ink"
      >
        <AppIcon name="alert" :size="15" class="mt-px shrink-0 text-error" />
        <span>{{ error }}</span>
      </p>

      <button type="submit" class="btn btn-primary w-full" :disabled="pending">
        <AppIcon v-if="pending" name="spinner" :size="15" class="animate-spin" />
        {{ pending ? 'Signing in…' : 'Sign in' }}
      </button>
    </form>

    <p class="mt-5 border-t border-line pt-4 text-[13px] text-ink-secondary">
      Have an invite code?
      <NuxtLink to="/register" class="font-medium text-ink hover:underline">
        Create your account
      </NuxtLink>
    </p>
  </div>
</template>
