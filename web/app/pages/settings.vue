<script setup lang="ts">
import type { CreatedInvite, Invite, XAccountStatus } from '~/types/api';

/**
 * Settings: sync health, the X connection, the account, and (for the owner)
 * invites.
 *
 * DESIGN.md §23 shapes the sync section: the plain-language state is the
 * headline, and the operator detail — outcome strings, failure counts, the raw
 * error — sits behind a disclosure so a normal user never reads a stack trace
 * to learn their archive is fine.
 */
const api = useApi();
const toast = useToast();
const { user, logout } = useAuth();
const { status, triggering, isRunning, refresh, trigger } = useSync();

const isOwner = computed(() => user.value?.role === 'owner');

onMounted(() => {
  void refresh();
  void loadXAccount();
  if (isOwner.value) void loadInvites();
});

/** Clipboard is best-effort: it is blocked in some contexts and must not throw. */
async function copy(value: string, label: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copied.`);
  } catch {
    toast.error('Could not copy. Select the text and copy it manually.');
  }
}

// --- Sync -------------------------------------------------------------------

const healthView = computed(() => {
  switch (status.value?.health) {
    case 'not_connected':
      return {
        label: 'Not connected',
        tone: 'text-warning',
        dot: 'bg-warning',
        body: 'Connect an X account to start archiving.',
      };
    case 'never_run':
      return {
        label: 'Waiting for first sync',
        tone: 'text-ink-secondary',
        dot: 'bg-ink-muted',
        body: 'Your first sync will archive everything you have bookmarked. It can take a while.',
      };
    case 'syncing':
      return {
        label: 'Syncing',
        tone: 'text-accent',
        dot: 'bg-accent',
        body: 'Reading your bookmarks now. New ones appear as they are archived.',
      };
    case 'needs_attention':
      return {
        label: 'Needs attention',
        tone: 'text-warning',
        dot: 'bg-warning',
        body:
          status.value?.sessionStatus === 'invalid'
            ? 'Your X session is no longer valid. Reconnect it to resume syncing.'
            : 'The last few syncs did not complete. Everything already archived is safe.',
      };
    default:
      return {
        label: 'Healthy',
        tone: 'text-success',
        dot: 'bg-success',
        body: 'Your archive is up to date.',
      };
  }
});

const confirmFullScan = ref(false);

async function syncNow(full = false): Promise<void> {
  confirmFullScan.value = false;
  if (await trigger(full)) {
    toast.info(full ? 'Full rescan queued.' : 'Sync queued. This can take a few minutes.');
  } else {
    toast.error('Could not start a sync.');
  }
}

// --- X account --------------------------------------------------------------

const xAccount = ref<XAccountStatus | null>(null);
const xPending = ref(true);
const xError = ref<string | null>(null);
const confirmDisconnect = ref(false);
const disconnecting = ref(false);

async function loadXAccount(): Promise<void> {
  xPending.value = true;
  try {
    xAccount.value = await api.get<XAccountStatus>('/x-account');
    xError.value = null;
  } catch (err) {
    xError.value = errorMessage(err, 'Could not read your X connection.');
  } finally {
    xPending.value = false;
  }
}

/**
 * Connecting X is an operator command, not an HTTP endpoint: signing in needs a
 * real visible browser (and often a one-time challenge), and the encrypted
 * session blob only exists on the machine holding the encryption key.
 *
 * The email is passed positionally on purpose: npm treats `--email` as one of
 * its own config flags and strips it before the script sees it.
 */
const connectCommand = 'npm run connect-x --workspace server -- you@example.com';

async function disconnect(): Promise<void> {
  disconnecting.value = true;
  try {
    await api.del<{ disconnected: boolean }>('/x-account');
    confirmDisconnect.value = false;
    toast.success('X disconnected. Your archive is unchanged.');
    await Promise.all([loadXAccount(), refresh()]);
  } catch (err) {
    toast.error(errorMessage(err, 'Could not disconnect.'));
  } finally {
    disconnecting.value = false;
  }
}

const sessionLabel = computed(() => {
  switch (xAccount.value?.status) {
    case 'active':
      return 'Connected';
    case 'invalid':
      return 'Session expired';
    case 'unverified':
      return 'Not verified yet';
    default:
      return 'Not connected';
  }
});

// --- Password ---------------------------------------------------------------

const currentPassword = ref('');
const newPassword = ref('');
const passwordPending = ref(false);
const passwordError = ref<string | null>(null);

const canChangePassword = computed(
  () => !passwordPending.value && currentPassword.value.length > 0 && newPassword.value.length >= 10,
);

/**
 * The server revokes every refresh token and clears the cookie on a password
 * change, so the only correct client behaviour is to drop the session and send
 * the user back to sign in. Pretending they are still logged in would just fail
 * on the next request.
 */
async function submitPassword(): Promise<void> {
  if (!canChangePassword.value) return;
  passwordPending.value = true;
  passwordError.value = null;

  try {
    await api.post<void>('/auth/change-password', {
      currentPassword: currentPassword.value,
      newPassword: newPassword.value,
    });
    currentPassword.value = '';
    newPassword.value = '';
    clearSession();
    toast.success('Password changed. Sign in again.');
    await navigateTo('/login');
  } catch (err) {
    passwordError.value = errorMessage(err, 'Could not change your password.');
  } finally {
    passwordPending.value = false;
  }
}

const signingOutAll = ref(false);

async function signOutEverywhere(): Promise<void> {
  signingOutAll.value = true;
  try {
    await api.post<void>('/auth/logout-all');
    clearSession();
    await navigateTo('/login');
  } catch (err) {
    toast.error(errorMessage(err, 'Could not sign out everywhere.'));
  } finally {
    signingOutAll.value = false;
  }
}

// --- Invites (owner only) ---------------------------------------------------

const invites = ref<Invite[]>([]);
const invitesPending = ref(false);
const inviteLabel = ref('');
const inviteExpiry = ref(14);
const creatingInvite = ref(false);
/** Held only in memory, only until the page is left: the code is unrecoverable. */
const freshInvite = ref<CreatedInvite | null>(null);

const EXPIRY_CHOICES = [7, 14, 30, 90] as const;

async function loadInvites(): Promise<void> {
  invitesPending.value = true;
  try {
    invites.value = (await api.get<{ invites: Invite[] }>('/auth/invites')).invites;
  } catch (err) {
    toast.error(errorMessage(err, 'Could not load invites.'));
  } finally {
    invitesPending.value = false;
  }
}

async function createInvite(): Promise<void> {
  creatingInvite.value = true;
  try {
    freshInvite.value = await api.post<CreatedInvite>('/auth/invites', {
      ...(inviteLabel.value.trim() ? { label: inviteLabel.value.trim() } : {}),
      expiresInDays: inviteExpiry.value,
    });
    inviteLabel.value = '';
    await loadInvites();
  } catch (err) {
    toast.error(errorMessage(err, 'Could not create an invite.'));
  } finally {
    creatingInvite.value = false;
  }
}

const inviteLink = computed(() => {
  const code = freshInvite.value?.code;
  if (!code || !import.meta.client) return '';
  return `${window.location.origin}/register?invite=${encodeURIComponent(code)}`;
});

// Guarded here rather than in the template: TypeScript drops the `v-if`
// narrowing of `freshInvite.value` once the expression becomes a click handler.
function copyInviteCode(): void {
  if (freshInvite.value) void copy(freshInvite.value.code, 'Code');
}

function inviteState(invite: Invite): { label: string; tone: string } {
  if (invite.used) {
    return { label: `Used by ${invite.usedBy?.displayName ?? 'someone'}`, tone: 'text-ink-muted' };
  }
  if (invite.expired) return { label: 'Expired', tone: 'text-ink-muted' };
  return { label: `Expires ${timeAgo(invite.expiresAt)}`, tone: 'text-ink-secondary' };
}
</script>

<template>
  <div class="space-y-4">
    <!-- Sync ---------------------------------------------------------------->
    <section class="card p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="text-[16px] font-semibold tracking-tight text-ink">Sync</h2>
          <div class="mt-1.5 flex items-center gap-2">
            <span class="relative flex size-1.5 shrink-0">
              <span
                v-if="isRunning"
                class="absolute inline-flex size-full animate-ping rounded-full bg-accent opacity-75"
              />
              <span class="relative inline-flex size-1.5 rounded-full" :class="healthView.dot" />
            </span>
            <span class="text-[13px] font-medium" :class="healthView.tone">
              {{ healthView.label }}
            </span>
          </div>
          <p class="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-secondary">
            {{ healthView.body }}
          </p>
        </div>

        <div class="flex shrink-0 items-center gap-2">
          <button
            type="button"
            class="btn btn-secondary px-2.5 py-1.5 text-[13px]"
            :disabled="triggering || isRunning || !status?.connected"
            :title="status?.connected ? 'Sync now' : 'Connect X first'"
            @click="syncNow(false)"
          >
            <AppIcon
              name="refresh"
              :size="15"
              :class="isRunning || triggering ? 'animate-spin' : ''"
            />
            Sync now
          </button>
        </div>
      </div>

      <dl v-if="status" class="mt-5 grid gap-x-6 gap-y-3 border-t border-line pt-4 sm:grid-cols-2">
        <div>
          <dt class="text-[12px] text-ink-muted">Last successful sync</dt>
          <dd class="mt-0.5 text-[13px] text-ink" :title="absoluteDate(status.lastSuccessfulSyncAt)">
            {{ status.lastSuccessfulSyncAt ? timeAgo(status.lastSuccessfulSyncAt) : 'Never' }}
          </dd>
        </div>
        <div>
          <dt class="text-[12px] text-ink-muted">Next sync</dt>
          <dd class="mt-0.5 text-[13px] text-ink" :title="absoluteDate(status.nextSyncAt)">
            {{ status.nextSyncAt ? timeAgo(status.nextSyncAt) : 'Not scheduled' }}
          </dd>
        </div>
        <div>
          <dt class="text-[12px] text-ink-muted">Archived</dt>
          <dd class="mt-0.5 text-[13px] text-ink">
            {{ plural(status.stats.totalArchived, 'bookmark') }}
          </dd>
        </div>
        <div>
          <dt class="text-[12px] text-ink-muted">Last run</dt>
          <dd class="mt-0.5 text-[13px] text-ink">
            <template v-if="status.stats.totalRuns === 0">No runs yet</template>
            <template v-else>
              {{ status.stats.lastRunNewCount }} new of {{ status.stats.lastRunSeenCount }} seen
            </template>
          </dd>
        </div>
        <div>
          <dt class="text-[12px] text-ink-muted">Schedule</dt>
          <dd class="mt-0.5 text-[13px] text-ink">Every {{ status.intervalHours }} hours</dd>
        </div>
        <div v-if="!status.initialBackfillComplete && status.connected">
          <dt class="text-[12px] text-ink-muted">First archive</dt>
          <dd class="mt-0.5 text-[13px] text-ink">Still working through your history</dd>
        </div>
      </dl>

      <!-- Operator detail. Deliberately closed by default (DESIGN.md §23). -->
      <details
        v-if="status && (status.lastErrorMessage || status.consecutiveFailures > 0)"
        class="mt-4 rounded-card border border-line bg-surface-subtle"
      >
        <summary
          class="cursor-pointer px-3.5 py-2.5 text-[13px] font-medium text-ink-secondary select-none hover:text-ink"
        >
          View details
        </summary>
        <div class="space-y-2 border-t border-line px-3.5 py-3">
          <p v-if="status.consecutiveFailures > 0" class="text-[13px] text-ink-secondary">
            {{ plural(status.consecutiveFailures, 'failed attempt') }} in a row.
          </p>
          <p v-if="status.lastOutcome" class="text-[12px] text-ink-muted">
            Outcome: <span class="font-mono">{{ status.lastOutcome }}</span>
          </p>
          <p
            v-if="status.lastErrorMessage"
            class="overflow-x-auto rounded-control bg-surface p-2.5 font-mono text-[12px] leading-relaxed text-ink-secondary"
          >
            {{ status.lastErrorMessage }}
          </p>
          <p v-if="status.lastRunAt" class="text-[12px] text-ink-muted">
            Last attempt {{ timeAgo(status.lastRunAt) }} ({{ absoluteDate(status.lastRunAt) }}).
          </p>
        </div>
      </details>

      <div class="mt-4 border-t border-line pt-4">
        <template v-if="confirmFullScan">
          <p class="text-[13px] text-ink-secondary">
            A full rescan re-reads your entire bookmark list instead of stopping at the last one it
            knows. Nothing is deleted or duplicated — it is just slower.
          </p>
          <div class="mt-2.5 flex items-center gap-2">
            <button
              type="button"
              class="btn btn-secondary px-2.5 py-1.5 text-[13px]"
              :disabled="triggering"
              @click="syncNow(true)"
            >
              Start full rescan
            </button>
            <button
              type="button"
              class="btn btn-ghost px-2.5 py-1.5 text-[13px]"
              @click="confirmFullScan = false"
            >
              Cancel
            </button>
          </div>
        </template>
        <button
          v-else
          type="button"
          class="text-[13px] text-ink-secondary transition-colors hover:text-ink disabled:opacity-50"
          :disabled="!status?.connected || isRunning || triggering"
          @click="confirmFullScan = true"
        >
          Run a full rescan instead
        </button>
      </div>
    </section>

    <!-- X account ----------------------------------------------------------->
    <section class="card p-5">
      <h2 class="text-[16px] font-semibold tracking-tight text-ink">X account</h2>

      <div v-if="xPending" class="mt-3 space-y-2">
        <div class="skeleton h-4 w-40 rounded-control" />
        <div class="skeleton h-3 w-64 rounded-control" />
      </div>

      <p v-else-if="xError" class="mt-2 text-[13px] text-ink-secondary">{{ xError }}</p>

      <template v-else>
        <div class="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span class="text-[13px] font-medium text-ink">{{ sessionLabel }}</span>
          <span v-if="xAccount?.xHandle" class="font-mono text-[13px] text-ink-secondary">
            @{{ xAccount.xHandle }}
          </span>
        </div>
        <p
          v-if="xAccount?.lastValidatedAt"
          class="mt-1 text-[12px] text-ink-muted"
          :title="absoluteDate(xAccount.lastValidatedAt)"
        >
          Last checked {{ timeAgo(xAccount.lastValidatedAt) }}
        </p>

        <!-- Not connected, or needs reconnecting: show the operator command. -->
        <div v-if="xAccount?.status !== 'active'" class="mt-4">
          <p class="max-w-prose text-[13px] leading-relaxed text-ink-secondary">
            Signing in to X needs a real browser window, so it is done once from the machine running
            XVault rather than from this page. Run:
          </p>
          <div class="mt-2 flex items-center gap-2">
            <code
              class="min-w-0 flex-1 overflow-x-auto rounded-control border border-line bg-surface-subtle px-2.5 py-2 font-mono text-[12px] whitespace-nowrap text-ink"
            >
              {{ connectCommand }}
            </code>
            <button
              type="button"
              class="btn btn-secondary shrink-0 px-2 py-1.5"
              aria-label="Copy command"
              @click="copy(connectCommand, 'Command')"
            >
              <AppIcon name="copy" :size="15" />
            </button>
          </div>
          <p class="mt-2 text-[12px] text-ink-muted">
            A browser opens, you sign in once, and the session is encrypted and stored for you.
            Syncing resumes on the next schedule.
          </p>
        </div>

        <div
          v-if="xAccount && xAccount.status !== 'disconnected'"
          class="mt-4 border-t border-line pt-4"
        >
          <template v-if="confirmDisconnect">
            <p class="max-w-prose text-[13px] text-ink-secondary">
              Disconnecting deletes the stored X session and stops scheduled syncing. Your archived
              bookmarks and media are kept — you would need to run the connect command again to
              resume.
            </p>
            <div class="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                class="btn btn-danger px-2.5 py-1.5 text-[13px]"
                :disabled="disconnecting"
                @click="disconnect"
              >
                <AppIcon v-if="disconnecting" name="spinner" :size="15" class="animate-spin" />
                Disconnect X
              </button>
              <button
                type="button"
                class="btn btn-ghost px-2.5 py-1.5 text-[13px]"
                @click="confirmDisconnect = false"
              >
                Keep connected
              </button>
            </div>
          </template>
          <button
            v-else
            type="button"
            class="text-[13px] text-ink-secondary transition-colors hover:text-error"
            @click="confirmDisconnect = true"
          >
            Disconnect X
          </button>
        </div>
      </template>
    </section>

    <!-- Account ------------------------------------------------------------->
    <section class="card p-5">
      <h2 class="text-[16px] font-semibold tracking-tight text-ink">Account</h2>

      <div class="mt-3 flex items-center gap-3">
        <span
          class="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-subtle text-[13px] font-semibold text-accent"
          aria-hidden="true"
        >
          {{ initials(user?.displayName) }}
        </span>
        <div class="min-w-0">
          <p class="truncate text-[14px] font-medium text-ink">{{ user?.displayName }}</p>
          <p class="truncate text-[13px] text-ink-secondary">{{ user?.email }}</p>
        </div>
        <span
          v-if="isOwner"
          class="ml-auto shrink-0 rounded-full border border-line px-2 py-0.5 text-[11px] font-medium tracking-wide text-ink-secondary"
        >
          Owner
        </span>
      </div>

      <form class="mt-5 space-y-3 border-t border-line pt-4" novalidate @submit.prevent="submitPassword">
        <h3 class="text-[13px] font-semibold text-ink">Change password</h3>
        <div class="grid gap-3 sm:grid-cols-2">
          <div>
            <label class="label" for="set-current">Current password</label>
            <input
              id="set-current"
              v-model="currentPassword"
              type="password"
              autocomplete="current-password"
              class="field"
            />
          </div>
          <div>
            <label class="label" for="set-new">New password</label>
            <input
              id="set-new"
              v-model="newPassword"
              type="password"
              autocomplete="new-password"
              class="field"
              placeholder="At least 10 characters"
            />
          </div>
        </div>

        <p
          v-if="passwordError"
          role="alert"
          class="flex items-start gap-2 text-[13px] text-ink"
        >
          <AppIcon name="alert" :size="15" class="mt-px shrink-0 text-error" />
          <span>{{ passwordError }}</span>
        </p>

        <div class="flex flex-wrap items-center gap-3">
          <button type="submit" class="btn btn-secondary px-2.5 py-1.5 text-[13px]" :disabled="!canChangePassword">
            <AppIcon v-if="passwordPending" name="spinner" :size="15" class="animate-spin" />
            Change password
          </button>
          <p class="text-[12px] text-ink-muted">You'll be signed out on all devices.</p>
        </div>
      </form>

      <div class="mt-5 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <button type="button" class="btn btn-secondary px-2.5 py-1.5 text-[13px]" @click="logout">
          <AppIcon name="logout" :size="15" />
          Sign out
        </button>
        <button
          type="button"
          class="text-[13px] text-ink-secondary transition-colors hover:text-ink disabled:opacity-50"
          :disabled="signingOutAll"
          @click="signOutEverywhere"
        >
          Sign out everywhere
        </button>
      </div>
    </section>

    <!-- Invites ------------------------------------------------------------->
    <section v-if="isOwner" class="card p-5">
      <h2 class="text-[16px] font-semibold tracking-tight text-ink">Invites</h2>
      <p class="mt-1 max-w-prose text-[13px] text-ink-secondary">
        XVault has no public signup. Anyone joining needs a code from here.
      </p>

      <!-- Shown once, never again: only the digest is stored server-side. -->
      <div
        v-if="freshInvite"
        class="mt-4 rounded-card border border-accent/40 bg-accent-subtle p-3.5 animate-fade-up"
      >
        <div class="flex items-start gap-2">
          <AppIcon name="check" :size="15" class="mt-0.5 shrink-0 text-accent" />
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-medium text-ink">
              Copy this code now — it cannot be shown again.
            </p>
            <div class="mt-2 flex items-center gap-2">
              <code
                class="min-w-0 flex-1 overflow-x-auto rounded-control bg-surface px-2.5 py-2 font-mono text-[13px] whitespace-nowrap text-ink"
              >
                {{ freshInvite.code }}
              </code>
              <button
                type="button"
                class="btn btn-secondary shrink-0 px-2 py-1.5"
                aria-label="Copy invite code"
                @click="copyInviteCode()"
              >
                <AppIcon name="copy" :size="15" />
              </button>
            </div>
            <button
              v-if="inviteLink"
              type="button"
              class="mt-2 text-[12px] text-accent hover:underline"
              @click="copy(inviteLink, 'Invite link')"
            >
              Copy sign-up link instead
            </button>
          </div>
          <button
            type="button"
            class="shrink-0 rounded-control p-1 text-ink-muted hover:text-ink"
            aria-label="Dismiss"
            @click="freshInvite = null"
          >
            <AppIcon name="close" :size="15" />
          </button>
        </div>
      </div>

      <form class="mt-4 flex flex-wrap items-end gap-3" novalidate @submit.prevent="createInvite">
        <div class="min-w-0 flex-1">
          <label class="label" for="invite-label">Label (optional)</label>
          <input
            id="invite-label"
            v-model="inviteLabel"
            type="text"
            class="field"
            placeholder="For a friend"
            maxlength="120"
          />
        </div>
        <div>
          <label class="label" for="invite-expiry">Valid for</label>
          <select id="invite-expiry" v-model.number="inviteExpiry" class="field">
            <option v-for="days in EXPIRY_CHOICES" :key="days" :value="days">{{ days }} days</option>
          </select>
        </div>
        <button type="submit" class="btn btn-primary py-2" :disabled="creatingInvite">
          <AppIcon v-if="creatingInvite" name="spinner" :size="15" class="animate-spin" />
          <AppIcon v-else name="plus" :size="15" />
          Create invite
        </button>
      </form>

      <div class="mt-5 border-t border-line pt-4">
        <div v-if="invitesPending" class="space-y-2">
          <div class="skeleton h-4 w-full rounded-control" />
          <div class="skeleton h-4 w-2/3 rounded-control" />
        </div>
        <p v-else-if="invites.length === 0" class="text-[13px] text-ink-muted">
          No invites yet.
        </p>
        <ul v-else class="divide-y divide-line">
          <li
            v-for="invite in invites"
            :key="invite.id"
            class="flex items-center justify-between gap-3 py-2.5"
          >
            <div class="min-w-0">
              <p class="truncate text-[13px] text-ink">{{ invite.label || 'Unlabelled' }}</p>
              <p class="text-[12px] text-ink-muted" :title="absoluteDate(invite.createdAt)">
                Created {{ timeAgo(invite.createdAt) }}
              </p>
            </div>
            <span class="shrink-0 text-[12px]" :class="inviteState(invite).tone">
              {{ inviteState(invite).label }}
            </span>
          </li>
        </ul>
      </div>
    </section>
  </div>
</template>
