# Cloudflare: the download host

This folder sets up the download host of the desktop app with OpenTofu:

- The R2 bucket `inky-downloads`, in the EU jurisdiction.
- The domain `inky-downloads.ascending.ai`, which serves the bucket's objects to everyone, read only.
- The upload key: an API token that can read and write objects in this bucket only.
- The CORS rule: a browser on `https://inky.ascending.ai` can read the objects. The download page (`web/`) reads `app/latest.json` with it.
- The deploy key of the download site: an API token that can change the account's Workers and the Worker routes of the zone. The deploy workflow uses it (`docs/ops/web-deploy.md`).

The release workflow uploads to the bucket (`docs/ops/desktop-release.md`). The app downloads its updates from the domain.

The bucket holds:

| Path in the bucket | What | Who uploads |
|---|---|---|
| `app/latest.json`, `app/<version>/…` | The update feed, and the update file and installer of each version. | The release workflow. |
| `Inky.dmg` | The latest installer. | The release workflow. |

You hold the account and the tokens: every step here is yours. The state of this folder is separate from the one of other apps (faust has its own bucket and keys).

## Before you start

1. The zone `ascending.ai` is in the Cloudflare account.
2. R2 is turned on in the account (dashboard, R2).
3. You are in the infra shell. It brings `tofu`, `aws` and `gh`:

   ```sh
   cd infra
   devenv shell
   ```

   With direnv, run `direnv allow` in `infra/` once. The shell then starts when you enter the folder. devenv itself: <https://devenv.sh/getting-started/>.

## Set up

1. Make an API token (dashboard, My Profile, API Tokens, Create Custom Token) with four permissions:
   - Account, Workers R2 Storage, Edit.
   - Account, API Tokens, Edit (OpenTofu makes the upload key with it).
   - Zone, DNS, Edit, for the zone `ascending.ai` only.
   - Zone, Workers Routes, Edit, for the zone `ascending.ai` only (OpenTofu gives it to the deploy key).
2. Keep the token in your shell, not in a file:

   ```sh
   export CLOUDFLARE_API_TOKEN=<the token>
   ```

3. Copy the settings file, from `infra/`, and fill in the two ids:

   ```sh
   cd cloudflare
   cp terraform.tfvars.example terraform.tfvars
   ```

4. Look at the plan. It shows five resources to add:

   ```sh
   tofu init
   tofu plan
   ```

5. Apply it:

   ```sh
   tofu apply
   ```

6. Wait about one minute for the certificate. Then check the domain:

   ```sh
   curl -sS -o /dev/null -w '%{http_code}\n' https://inky-downloads.ascending.ai/app/latest.json
   ```

   Expect `404` before the first release, and `200` after it. An error of TLS or DNS means that the domain is not ready.

## Values for the release workflow

The outputs are the settings of the release workflow that come from this host, and the two settings of the download site's deploy workflow:

| Output | Kind | Value |
|---|---|---|
| `DOWNLOAD_BASE` | variable | `https://inky-downloads.ascending.ai` |
| `DOWNLOAD_BUCKET` | variable | `s3://inky-downloads` |
| `DOWNLOAD_S3_ENDPOINT` | variable | `https://<account id>.eu.r2.cloudflarestorage.com` |
| `DOWNLOAD_S3_REGION` | variable | `auto` |
| `DOWNLOAD_S3_ACCESS_KEY_ID` | secret | The id of the upload key. |
| `DOWNLOAD_S3_SECRET_ACCESS_KEY` | secret | The SHA-256 of the upload key's value. |
| `CLOUDFLARE_ACCOUNT_ID` | variable | The account id. The deploy workflow of the download site uses it. |
| `CLOUDFLARE_API_TOKEN` | secret | The deploy key of the download site. |

The endpoint has `.eu.` in it: the bucket is in the EU jurisdiction.

Do not copy them by hand. `infra/github` reads them from this folder's state file and sets them in the repository (`infra/github/README.md`).

## Look into the bucket

The upload key from the state reads and writes the bucket. Start in `infra/cloudflare`:

```sh
export AWS_ACCESS_KEY_ID=$(tofu output -raw DOWNLOAD_S3_ACCESS_KEY_ID)
export AWS_SECRET_ACCESS_KEY=$(tofu output -raw DOWNLOAD_S3_SECRET_ACCESS_KEY)
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
aws s3 ls --recursive "$(tofu output -raw DOWNLOAD_BUCKET)" \
  --endpoint-url "$(tofu output -raw DOWNLOAD_S3_ENDPOINT)" --region auto
```

## The state file

- `terraform.tfstate` stays on your Mac. It is gitignored. **It holds the upload key and the deploy key.** Treat it as a secret: do not send it and do not commit it.
- If it is lost, import the bucket and the domain again (`tofu import`, see the provider docs for the id format). The upload key cannot be read again: delete it in the dashboard, apply, then apply `infra/github`.
- To make a new upload key: `tofu apply -replace=cloudflare_account_token.upload`, then apply `infra/github`.
- `.terraform.lock.hcl` is committed. It pins the provider version.
- `tofu destroy` refuses to delete the bucket (`prevent_destroy`). A deleted bucket stops updates for every installed app.
