<script setup lang="ts">
definePageMeta({ layout: 'auth' });

const route = useRoute();
const { register } = useAuth();

// A code can arrive in the invite link itself, which saves retyping it.
const inviteCode = ref(typeof route.query.invite === 'string' ? route.query.invite : '');
const displayName = ref('');
const email = ref('');
const password = ref('');
const pending = ref(false);
const error = ref<string | null>(null);

// Mirrors the server's `passwordSchema` (min 10). Checking here is courtesy, not
// enforcement — the API rejects anything shorter regardless.
const passwordTooShort = computed(() => password.value.length > 0 && password.value.length < 10);

const canSubmit = computed(
  () =>
    !pending.value &&
    inviteCode.value.trim().length >= 8 &&
    displayName.value.trim().length > 0 &&
    email.value.trim().length > 0 &&
    password.value.length >= 10,
);

async function submit(): Promise<void> {
  if (!canSubmit.value) return;
  pending.value = true;
  error.value = null;

  try {
    await register({
      inviteCode: inviteCode.value.trim(),
      displayName: displayName.value.trim(),
      email: email.value.trim(),
      password: password.value,
    });
    await navigateTo('/');
  } catch (err) {
    error.value = errorMessage(err, 'Could not create your account.');
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <div class="card p-6">
    <h1 class="text-[20px] font-semibold tracking-tight text-ink">Create your account</h1>
    <p class="mt-1 text-sm text-ink-secondary">XVault is invite-only. You'll need a code.</p>

    <form class="mt-5 space-y-4" novalidate @submit.prevent="submit">
      <div>
        <label class="label" for="reg-invite">Invite code</label>
        <input
          id="reg-invite"
          v-model="inviteCode"
          type="text"
          autocomplete="off"
          spellcheck="false"
          required
          class="field font-mono text-[14px]"
          placeholder="xv-…"
        />
      </div>

      <div>
        <label class="label" for="reg-name">Name</label>
        <input
          id="reg-name"
          v-model="displayName"
          type="text"
          autocomplete="name"
          required
          class="field"
          placeholder="Ada Lovelace"
        />
      </div>

      <div>
        <label class="label" for="reg-email">Email</label>
        <input
          id="reg-email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
          class="field"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label class="label" for="reg-password">Password</label>
        <input
          id="reg-password"
          v-model="password"
          type="password"
          autocomplete="new-password"
          required
          class="field"
          placeholder="At least 10 characters"
          :aria-describedby="passwordTooShort ? 'reg-password-hint' : undefined"
        />
        <p
          v-if="passwordTooShort"
          id="reg-password-hint"
          class="mt-1.5 text-[12px] text-ink-muted"
        >
          Use at least 10 characters.
        </p>
      </div>

      <p
        v-if="error"
        role="alert"
        class="flex items-start gap-2 rounded-card border border-line bg-surface-subtle p-3 text-[13px] text-ink"
      >
        <AppIcon name="alert" :size="15" class="mt-px shrink-0 text-error" />
        <span>{{ error }}</span>
      </p>

      <button type="submit" class="btn btn-primary w-full" :disabled="!canSubmit">
        <AppIcon v-if="pending" name="spinner" :size="15" class="animate-spin" />
        {{ pending ? 'Creating account…' : 'Create account' }}
      </button>
    </form>

    <p class="mt-5 border-t border-line pt-4 text-[13px] text-ink-secondary">
      Already have an account?
      <NuxtLink to="/login" class="font-medium text-accent hover:underline">Sign in</NuxtLink>
    </p>
  </div>
</template>
