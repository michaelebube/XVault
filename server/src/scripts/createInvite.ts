import { connectDatabase, disconnectDatabase } from '../lib/db.js';
import { createInvite } from '../modules/auth/invites.js';

/**
 * Bootstrap invite generator.
 *
 * Registration is invite-only (AGENT.md §5), which creates a chicken-and-egg
 * problem: the first invite cannot be issued through the owner-only API,
 * because there is no owner yet. This script is the way out — it runs on the
 * machine that already has the database credentials, so it grants nothing that
 * its operator did not already have.
 *
 * Usage:
 *   npm run invite --workspace server -- --label "Alex" --days 14
 */

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const label = arg('label');
  const days = Number(arg('days') ?? 14);

  if (!Number.isFinite(days) || days <= 0) {
    throw new Error('--days must be a positive number');
  }

  await connectDatabase();

  const invite = await createInvite({
    expiresInDays: days,
    ...(label ? { label } : {}),
  });

  // Printed, never logged: the raw code exists only in this moment — the
  // database stores its SHA-256 digest.
  process.stdout.write(
    [
      '',
      '  Invite code created',
      '  ───────────────────────────────────────────',
      `  Code:      ${invite.code}`,
      `  Label:     ${invite.label ?? '(none)'}`,
      `  Expires:   ${invite.expiresAt.toISOString()}`,
      '',
      '  Give this code to the new user. It can only be used once,',
      '  and it cannot be recovered after this message.',
      '',
      '',
    ].join('\n'),
  );

  await disconnectDatabase();
}

main().catch(async (err: unknown) => {
  process.stderr.write(`Failed to create invite: ${(err as Error).message}\n`);
  await disconnectDatabase().catch(() => undefined);
  process.exit(1);
});
