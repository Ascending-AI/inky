# Desktop release

A tag `vX.Y.Z` releases the macOS app. GitHub Actions does the build (`.github/workflows/release.yml`). You push the tag.

Setup first: the download host (`infra/cloudflare/README.md`), the variables and the secrets below.

## Release a version

1. Merge the work to `main` and push `main`.
2. Choose the version. It must be higher than the last one: an installed app offers only a higher version.
3. Tag the commit on `main` and push the tag:

   ```sh
   git tag v0.2.0 main
   git push origin v0.2.0
   ```

4. Watch the run: `gh run watch` or the Actions tab. A run takes about 20 minutes.

The version is the tag's `X.Y.Z`. Do not change `version` in `tauri.conf.json` for a release.

## What the workflow does

1. It checks the tag: the form is `vX.Y.Z` and the commit is on `main`.
2. It checks that each variable and secret is set.
3. It imports the Developer ID certificate into a temporary keychain. It fails if the certificate is from another team.
4. It runs the checks and the tests.
5. It runs `make release` with `APP_VERSION`, `DOWNLOAD_BASE` and the update key. Tauri signs, notarizes and staples the app. The script then notarizes and staples the DMG. It fails if the update is not signed with the key of `tauri.conf.json`.
6. It checks the signature, the team, Gatekeeper (`spctl`) and the staple, for the app and for the DMG.
7. It uploads the files to the download host. The feed `app/latest.json` goes last.
8. It reads the feed back from `DOWNLOAD_BASE` and checks the version.
9. It makes the GitHub release `vX.Y.Z` with the DMG, the update file, its signature and a copy of the feed.

Files on the download host (`<base>` is `DOWNLOAD_BASE`):

| File | What |
|---|---|
| `<base>/Inky.dmg` | The latest installer. The download site (`web/`) links to it. |
| `<base>/app/<version>/Inky_<version>_aarch64.dmg` | The installer of one version. It does not change. |
| `<base>/app/<version>/Inky.app.tar.gz` | The update file of one version. It does not change. |
| `<base>/app/latest.json` | The feed that the app's updater reads. It is not cached. |

The build is for Apple silicon only.

## Apps from before the download host

An app built before this setup reads its updates from the latest GitHub release (`releases/latest/download/latest.json`). The workflow puts a copy of the feed on each GitHub release for that reason. Such an app installs the new version from the download host, and the new version reads the download host's feed. Keep the copy on the GitHub releases while such apps are in use.

## A build on your Mac

`make release` runs the same script without a tag. It needs the update key at `~/.tauri/inky.key` (or `KEY=<file>`, or `TAURI_SIGNING_PRIVATE_KEY`). Without `APPLE_SIGNING_IDENTITY` the app is signed ad hoc and not notarized: another Mac refuses it until `xattr -cr /Applications/Inky.app`. The files for the download host are in `src-tauri/target/release/upload/`. `make dmg` is the quick build for your own Mac.

## Download host

The download host is a Cloudflare R2 bucket in the EU jurisdiction, served at `https://inky-downloads.ascending.ai`. The workflow uploads with R2's S3 API.

1. Set up the bucket, the domain and the upload key: `infra/cloudflare/README.md`. The upload key can write to this bucket only.
2. Set the host's variables and secrets in the repository: `infra/github/README.md`.

## Repository variables

Set them in GitHub: Settings, Secrets and variables, Actions, Variables. `infra/github` sets the four `DOWNLOAD_` variables.

| Variable | What |
|---|---|
| `APPLE_TEAM_ID` | The Apple Developer team id (10 characters). The build fails on a certificate or a signature from another team. |
| `DOWNLOAD_BASE` | `https://inky-downloads.ascending.ai` |
| `DOWNLOAD_BUCKET` | `s3://inky-downloads` |
| `DOWNLOAD_S3_ENDPOINT` | `https://<account id>.eu.r2.cloudflarestorage.com` |
| `DOWNLOAD_S3_REGION` | `auto` |

## Repository secrets

Set them in GitHub: Settings, Secrets and variables, Actions, Secrets. `infra/github` sets the two `DOWNLOAD_S3_` secrets.

| Secret | What |
|---|---|
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | The update key: the text of the key file `~/.tauri/inky.key`, and its password. The key is set already and has no password, so the second secret stays unset. |
| `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD` | The "Developer ID Application" certificate, exported from Keychain Access as a `.p12` file and encoded with `base64 -i cert.p12`, and that file's password. |
| `APPLE_API_KEY`, `APPLE_API_ISSUER`, `APPLE_API_PRIVATE_KEY` | Notarization with an App Store Connect API key (Users and Access, Integrations, Team Keys, role Developer): the key id, the issuer id, and the text of `AuthKey_<id>.p8`. |
| `APPLE_ID`, `APPLE_PASSWORD` | Instead of the API key: a member of the team and an app-specific password. The workflow uses them only when the API key secrets are not set. |
| `DOWNLOAD_S3_ACCESS_KEY_ID`, `DOWNLOAD_S3_SECRET_ACCESS_KEY` | The access key that can write to the download bucket only. |

The Apple secrets are the team's: the same values as in the other apps of the team. Set each one with `gh secret set <name>` (it asks for the value), and the team id with `gh variable set APPLE_TEAM_ID --body <id>`.

The update key is not the Apple certificate. Its public half is in `src-tauri/tauri.conf.json` (`plugins.updater.pubkey`). Keep two copies of the key outside GitHub: GitHub does not show a secret again. A lost key stops updates for every installed app: people must install the DMG again.

Do not change the update key between releases. An installed app accepts only an update signed with the key it was built with.

## If a run fails

- **Before "Publish to the download host":** nothing is published. Fix the cause, then use "Re-run jobs" on the run.
- **During or after the publish:** use "Re-run jobs". The uploads replace the same files.
- **The code is wrong:** fix it on `main` and release a new, higher version. Do not move a tag that was published.
- **A bad release is out:** release a higher version with the fix. The updater does not go back to a lower version.

To remove a tag that published nothing: `git push origin :refs/tags/vX.Y.Z`, then `git tag -d vX.Y.Z`.
