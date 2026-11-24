// macOS signing for tools/desktop.sh, after the fuses are flipped.
// With a "Developer ID Application" identity in the keychain: signs the app with the hardened runtime and
// desktop/entitlements.mac.plist, then, with the notarytool keychain profile "r3z-notary", notarizes it
// (xcrun notarytool submit --wait), staples the ticket and checks it with stapler and spctl.
// Without the identity (until the R3Z Games LLC enrollment is approved): ad-hoc signs as before and exits 0.
// One-time setup on the signing Mac: create the Developer ID Application certificate, then
//   xcrun notarytool store-credentials r3z-notary
// Usage: node desktop/sign-mac.mjs "<path to .app>"
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = process.argv[2];
if (!app || !fs.existsSync(app)) { console.error('usage: node desktop/sign-mac.mjs <app>'); process.exit(1); }
const here = path.dirname(fileURLToPath(import.meta.url));
const PROFILE = 'r3z-notary';
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: opts.quiet ? 'pipe' : 'inherit', encoding: 'utf8' });

const ids = run('security', ['find-identity', '-v', '-p', 'codesigning'], { quiet: true });
const identity = (ids.match(/"(Developer ID Application: [^"]+)"/) || [])[1];
if (!identity) {
  console.log('macOS: no Developer ID Application identity, ad-hoc signed (not notarized)');
  run('codesign', ['--force', '--deep', '--sign', '-', app]);
  process.exit(0);
}

console.log('macOS: signing with', identity, '(hardened runtime)');
const entitlements = path.join(here, 'entitlements.mac.plist');
const { sign } = await import('@electron/osx-sign'); /* loaded only when there is an identity to sign with */
await sign({ app, identity, platform: 'darwin', optionsForFile: () => ({ hardenedRuntime: true, entitlements }) });
run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);

let profile = true;
try { run('xcrun', ['notarytool', 'history', '--keychain-profile', PROFILE], { quiet: true }); } catch { profile = false; }
if (!profile) {
  console.log(`macOS: signed, NOT notarized: no notarytool keychain profile "${PROFILE}" (xcrun notarytool store-credentials ${PROFILE})`);
  process.exit(0);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'no2-notarize-'));
const zip = path.join(tmp, 'app.zip');
try {
  run('ditto', ['-c', '-k', '--keepParent', app, zip]);
  console.log('macOS: notarizing (this waits for Apple)');
  run('xcrun', ['notarytool', 'submit', zip, '--keychain-profile', PROFILE, '--wait']);
  run('xcrun', ['stapler', 'staple', app]);
  run('xcrun', ['stapler', 'validate', app]);
  run('spctl', ['--assess', '--type', 'execute', '--verbose=4', app]);
  console.log('macOS: notarized and stapled');
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
