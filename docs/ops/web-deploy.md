# Download site deploy

The download site (`web`) runs on Cloudflare Workers at `https://inky.ascending.ai`. It is static files, without Worker code. GitHub Actions deploys it (`.github/workflows/web-deploy.yml`).

A desktop release needs no deploy. The page links to the latest installer and reads the version from the download host.

## When a deploy runs

- A push to `main` that changes `web/` or the workflow file.
- A manual run: `gh workflow run web-deploy.yml --ref main`, or the Actions tab. A run on another branch does nothing.

## What the workflow does

1. It checks that the variable and the secret are set.
2. It installs the site's packages (`web/pnpm-lock.yaml`), then runs `pnpm check`, `pnpm test` and `pnpm build` in `web`.
3. It runs `wrangler deploy`. Wrangler uploads `web/dist` to the Worker `inky-web` and maps the domain (`web/wrangler.jsonc`).
4. It reads `https://inky.ascending.ai` and checks that the page is the new build. It tries for 2 minutes.

## Set up

1. Check that `inky.ascending.ai` has no DNS record in the zone `ascending.ai`. Wrangler makes the record. A record that exists makes the deploy fail.
2. Give your Cloudflare API token one more permission: Zone, Workers Routes, Edit, for the zone `ascending.ai` (`infra/cloudflare/README.md`, "Set up", step 1). The other permissions stay.
3. Apply `infra/cloudflare`. The plan adds the deploy key (`cloudflare_account_token.web_deploy`) and the CORS rule of the download host:

   ```sh
   cd infra
   devenv shell
   cd cloudflare
   tofu plan
   tofu apply
   ```

4. Apply `infra/github`. The plan adds the variable and the secret below:

   ```sh
   cd ../github
   tofu plan
   tofu apply
   ```

5. Merge the site to `main` and push `main`. The first deploy starts.
6. Watch the run: `gh run watch`. The first deploy makes the domain's certificate. That takes about one minute.
7. Open `https://inky.ascending.ai`. Before the first desktop release the download button gives a 404 and the page shows no version.

## Repository settings

`infra/github` sets them from the outputs of `infra/cloudflare`.

| Name | Kind | What |
|---|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | variable | The Cloudflare account id. |
| `CLOUDFLARE_API_TOKEN` | secret | The deploy key. It can change the account's Workers and the Worker routes of the zone `ascending.ai`. It cannot read or write the download bucket. |

## If a run fails

- **Before "Deploy":** the site did not change. Fix the cause on `main`.
- **"Deploy" fails with an authentication error:** apply `infra/cloudflare`, then `infra/github`, and use "Re-run jobs".
- **"Deploy" fails on the domain:** `inky.ascending.ai` has a DNS record already. Delete it in the dashboard, then use "Re-run jobs".
- **"The site serves the new build" fails:** the deploy is done, but the domain does not answer with it yet. Wait a few minutes and open the site. Use "Re-run jobs" if it still shows the old page.

## Go back to an older build

Revert the commit on `main` and push. The workflow deploys the older page.
