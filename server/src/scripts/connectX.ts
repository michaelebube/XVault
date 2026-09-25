import { connectDatabase, disconnectDatabase } from '../lib/db.js';
import { User } from '../models/User.js';
import { openBrowserSession, closeBrowserSession } from '../scraper/browser.js';
import { isLoggedOut, isOnAuthUrl, readSignedInHandle } from '../browser/extract.js';
import { loadSessionState, saveSessionState, type StorageState } from '../scraper/session.js';
import { ensureUserSchedule } from '../jobs/queues.js';
import { closeQueues } from '../jobs/queues.js';

/**
 * One-time X connection for a user.
 *
 * **Why this is a CLI script and not an API endpoint.**
 *
 * Logging into X is not a request/response interaction: it needs a visible
 * browser, it frequently asks for a code by email or an unusual-activity
 * confirmation, and it can take minutes of human attention. Driving that from
 * an Express handler would mean holding an HTTP connection open around a
 * headful Chromium on the server, and would put the login form — the single
 * most credential-sensitive surface in the system — behind a web UI that could
 * be phished or replayed.
 *
 * Running it as an operator script keeps the X password out of this application
 * entirely: it is typed into X's own page, in a real browser, and all this
 * process ever sees is the resulting session state, which is immediately
 * encrypted with SESSION_ENCRYPTION_KEY before it touches the database.
 *
 * Usage:
 *   npm run connect-x --workspace server -- you@example.com
 *   npx tsx src/scripts/connectX.ts --email you@example.com
 *
 * The email identifies the **XVault account**. The X account logged into in the
 * browser is a separate identity and may use any email at all.
 */

const HOME_URL = 'https://x.com/home';
const LOGIN_URL = 'https://x.com/i/flow/login';

/** How long the operator has to finish logging in before we give up. */
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const POLL_MS = 3000;
/**
 * Minimum gap between our own navigations while polling. The operator may be
 * mid-verification on a page we did not expect, and reloading under them both
 * destroys their progress and creates the navigation race this loop exists to
 * avoid.
 */
const RENAVIGATE_AFTER_MS = 30_000;

/**
 * npm swallows `--email`: it is one of npm's own config keys, so
 * `npm run connect-x --workspace server -- --email me@example.com` reaches the
 * script as `connectX.ts me@example.com` with the flag removed. Accept the flag,
 * the `--email=` spelling, and a bare positional address, so every invocation
 * path works without depending on npm's version-specific arg handling.
 */
function readEmailArg(argv: string[]): string | undefined {
  const flagIndex = argv.indexOf('--email');
  if (flagIndex !== -1) return argv[flagIndex + 1];
  const inline = argv.find((a) => a.startsWith('--email='));
  if (inline) return inline.slice('--email='.length);
  return argv.find((a) => !a.startsWith('-') && a.includes('@'));
}

const say = (line: string) => process.stdout.write(`${line}\n`);

async function main(): Promise<void> {
  const email = readEmailArg(process.argv.slice(2))?.toLowerCase().trim();
  if (!email) {
    throw new Error(
      'Pass the XVault account email, e.g. npm run connect-x --workspace server -- you@example.com',
    );
  }

  await connectDatabase();

  const user = await User.findOne({ email }).select('_id email displayName').lean();
  if (!user) throw new Error(`No XVault user with email ${email}`);
  const userId = String(user._id);

  // Seed with the existing session if there is one: re-running this script
  // after a session goes stale should let X recognise the browser rather than
  // treating it as a brand-new login, which is what triggers extra challenges.
  const existing = await loadSessionState(userId);

  const handles = await openBrowserSession(existing, { headless: false });

  try {
    const { page } = handles;

    await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' });

    if (await isLoggedOut(page)) {
      await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded' });
      say('');
      say('  A browser window has opened on X.');
      say(`  Log in as whichever X account should be archived for ${user.displayName} <${email}>.`);
      say("  The X login can use a different email — it does not have to match the XVault one.");
      say('  Complete any verification X asks for, then leave the window alone.');
      say('');
      say('  Waiting for a signed-in session...');
    }

    const deadline = Date.now() + LOGIN_WINDOW_MS;
    let handle: string | null = null;
    let lastNavigationAt = Date.now();

    while (Date.now() < deadline) {
      await page.waitForTimeout(POLL_MS);

      /**
       * While X is showing its own login/verification flow the page navigates
       * between steps, and touching it is what produced "Execution context was
       * destroyed". `page.url()` is read in Node, so this check never touches
       * the page at all — we simply wait the flow out.
       */
      if (isOnAuthUrl(page.url())) {
        lastNavigationAt = Date.now();
        continue;
      }

      // The account switcher is the proof of a real signed-in session: being on
      // some non-login URL is not enough to store a session against a user.
      handle = await readSignedInHandle(page);
      if (handle) break;

      // Signed in somewhere that does not render the side nav (a settings
      // interstitial, the logged-out landing page, a stalled tab). Nudge it to
      // the timeline — but rarely, and never while a navigation is in flight.
      if (
        !page.url().startsWith(HOME_URL) &&
        Date.now() - lastNavigationAt > RENAVIGATE_AFTER_MS
      ) {
        lastNavigationAt = Date.now();
        await page.goto(HOME_URL, { waitUntil: 'domcontentloaded' }).catch((err: unknown) => {
          // Reported, not swallowed: X aborts our navigation with its own
          // redirects fairly often, and the loop's deadline is the real failure
          // surface. A persistent problem shows up as repeated lines here.
          say(`  (could not open x.com/home: ${(err as Error).message})`);
        });
      }
    }

    if (!handle) {
      throw new Error('Timed out waiting for an X login. Nothing was saved.');
    }

    const state = (await handles.context.storageState()) as StorageState;
    await saveSessionState(userId, state, handle);

    // The schedule follows the session (see jobs/scheduler.ts): connecting X is
    // exactly the point at which this user becomes eligible for 72-hour syncs.
    await ensureUserSchedule(userId);

    say('');
    say(`  Connected as @${handle}.`);
    say('  The session is encrypted at rest and a recurring sync has been scheduled.');
    say('  Run a first sync from the app, or trigger it with POST /api/sync/run.');
    say('');
  } finally {
    await closeBrowserSession(handles);
  }

  await closeQueues();
  await disconnectDatabase();
}

main().catch(async (err: unknown) => {
  process.stderr.write(`Could not connect X: ${(err as Error).message}\n`);
  await closeQueues().catch(() => undefined);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
