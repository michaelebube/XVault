import { createServer } from 'node:http';
import { env, r2Configured } from '../config/env.js';
import { deleteObject, objectExists, presignGet, uploadRemoteAsset } from '../modules/media/r2.js';

/**
 * End-to-end check of the R2 storage adapter, without needing Mongo, Redis, the
 * API or the worker — and without depending on X's CDN being reachable.
 *
 * **Why it exists.** The storage layer is the one part of the pipeline whose
 * failure mode is invisible from the outside: an upload that silently does
 * nothing still leaves a bookmark that looks fine in the library until the image
 * 404s. There is no test suite covering it, so this script is the verification
 * step for it.
 *
 * It serves a generated PNG from a loopback HTTP server and then runs it through
 * the *real* upload path — the same `uploadRemoteAsset` the media worker calls —
 * so the fetch, stream, key derivation, PUT and presign code are all exercised
 * rather than mocked. Everything it writes is deleted again at the end.
 *
 * Usage:
 *   npm run verify-r2 --workspace server
 *
 * Requires working R2_* credentials in server/.env. It talks to the real bucket.
 */

/** 1x1 transparent PNG. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

const failures: string[] = [];

function check(label: string, ok: boolean, detail = ''): void {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}\n`);
  if (!ok) failures.push(label);
}

/** Serve the PNG on a random loopback port so `uploadRemoteAsset` has a real URL. */
async function withSourceServer<T>(fn: (url: string) => Promise<T>): Promise<T> {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': String(PNG.length) });
    res.end(PNG);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('could not determine the local source server port');
  }

  try {
    return await fn(`http://127.0.0.1:${address.port}/pixel.png`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function main(): Promise<void> {
  process.stdout.write(`bucket: ${env.R2_BUCKET_NAME}\n`);
  process.stdout.write(`prefix: ${env.R2_ROOT_PREFIX}\n`);
  process.stdout.write(`signed url ttl: ${env.R2_SIGNED_URL_TTL_SECONDS}s\n\n`);

  if (!r2Configured) {
    process.stderr.write(
      'R2 is not configured. Fill in R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, ' +
        'R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME in server/.env first.\n',
    );
    process.exit(1);
  }

  await withSourceServer(async (sourceUrl) => {
    // A fixed prefix so a failed run is easy to find and clean up by hand.
    const prefix = `_verify/${Date.now()}`;

    const upload = await uploadRemoteAsset({ sourceUrl, prefix, name: '0' });
    check(
      'upload wrote an object and returned its key',
      upload.key.startsWith(`${env.R2_ROOT_PREFIX}/${prefix}/0.`),
      upload.key,
    );
    check('upload recorded the real byte count', upload.bytes === PNG.length, `${upload.bytes} bytes`);
    check('upload stored the image content type', upload.contentType === 'image/png', upload.contentType);

    check('the object exists in R2', await objectExists(upload.key));

    const signed = await presignGet(upload.key);
    if (!signed) {
      check('presigned a GET url', false);
      return;
    }
    check('presigned a GET url', signed.startsWith('https://'));

    const fetched = await fetch(signed);
    const bytes = Buffer.from(await fetched.arrayBuffer());
    check('presigned url returns the object', fetched.status === 200, `HTTP ${fetched.status}`);
    check('the downloaded bytes are identical', bytes.equals(PNG));

    /**
     * Requirement: a missing object must fail clearly, not look like success.
     * A presigned URL is only a signature — R2, not this process, decides
     * whether the object is there — so the honest check is what R2 answers.
     */
    const missingKey = `${env.R2_ROOT_PREFIX}/${prefix}/does-not-exist.png`;
    check('a missing key is reported as missing', (await objectExists(missingKey)) === false);

    const missingSigned = await presignGet(missingKey);
    const missingResponse = missingSigned ? await fetch(missingSigned) : null;
    check(
      'a presigned url for a missing object returns 404, not 200',
      missingResponse?.status === 404,
      `HTTP ${missingResponse?.status ?? 'no url'}`,
    );

    await deleteObject(upload.key);
    check('the test object was cleaned up', (await objectExists(upload.key)) === false);
  });

  process.stdout.write(
    failures.length === 0
      ? '\nAll R2 checks passed.\n'
      : `\n${failures.length} check(s) failed: ${failures.join(', ')}\n`,
  );
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err: unknown) => {
  process.stderr.write(`${(err as Error).message}\n`);
  process.exit(1);
});
