// Build step (tools/desktop.sh), never shipped in the app: flips Electron's fuses on a packaged app before it is
// signed, as Electron's security checklist recommends. The app never runs as plain Node.js, takes no NODE_OPTIONS or
// --inspect, gives file:// pages no extra privileges (the game is served as https://no2arca.de/ inside the app),
// and loads only from its app.asar, checking that archive's hash (macOS and Windows).
// Cookie encryption stays off: the game keeps no cookies, and on an ad-hoc signed Mac app it would ask for the
// keychain at every launch. Usage: node desktop/fuses.cjs <path to .app, .exe or Linux binary>
const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses');
flipFuses(process.argv[2], {
  version: FuseVersion.V1,
  [FuseV1Options.RunAsNode]: false,
  [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
  [FuseV1Options.EnableNodeCliInspectArguments]: false,
  [FuseV1Options.GrantFileProtocolExtraPrivileges]: false,
  [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
  [FuseV1Options.OnlyLoadAppFromAsar]: true,
}).then(() => console.log('fuses flipped:', process.argv[2]), e => { console.error(e); process.exit(1); });
