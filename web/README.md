# The download site

One static page, made with Astro. It gives people the link to the latest Inky installer.

## Commands

Run them from the repository root.

| Command | What |
|---|---|
| `make web-dev` | The site on http://localhost:5175. |
| `make web-build` | The static files in `web/dist`. |
| `make web-check` | The type check and the tests of the platform rules. |

## How the link stays current

- The button links to `<base>/Inky.dmg`. The release workflow replaces that file at each release (`docs/ops/desktop-release.md`). The page needs no new build after a release.
- The page's script reads `<base>/app/latest.json` and shows the version. If the feed does not answer, the page shows no version. The button still works.
- `<base>` is `https://inky-downloads.ascending.ai`. To build for another download host, set `PUBLIC_DOWNLOAD_BASE`:

  ```sh
  PUBLIC_DOWNLOAD_BASE=https://downloads.example.com make web-build
  ```

The script reads the feed from another origin. The download host must allow that with a CORS rule (`infra/cloudflare/main.tf`, `cloudflare_r2_bucket_cors`). The rule allows `https://inky.ascending.ai` only. On `make web-dev` the page shows no version: `localhost` is not an allowed origin.

## Platforms

`src/lib/platforms.ts` lists macOS, Windows and Linux. A platform with an empty `installers` list shows "Not available yet".

The page selects the visitor's platform. A visitor on a platform without an installer sees a notice in place of the button.

To add a build for a platform:

1. Make the release workflow publish the installer at a fixed path on the download host, for example `Inky-setup.exe`. The file at that path is always the latest version.
2. Make the release workflow add the build to `platforms` in `app/latest.json`, for example `windows-x86_64`.
3. Add the installer to the platform in `src/lib/platforms.ts`, and set the platform's `requirement`:

   ```ts
   installers: [{ label: 'x64', path: 'Inky-setup.exe', feedKey: 'windows-x86_64' }]
   ```

A platform can have more than one installer (for example x64 and ARM). The first one is on the main button. The others are links in the platform list.

## Hosting

The site runs on Cloudflare Workers at `https://inky.ascending.ai` (`wrangler.jsonc`). A push to `main` that changes the site deploys it (`.github/workflows/web-deploy.yml`). The setup and the steps: `docs/ops/web-deploy.md`.

To check the Workers config without a deploy: `pnpm build`, then `pnpm exec wrangler deploy --dry-run`.
