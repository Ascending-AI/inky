# GitHub: the workflows' settings from Cloudflare

This folder sets, with OpenTofu, the repository variables and secrets that come from Cloudflare. The values are the outputs of `infra/cloudflare`. The `DOWNLOAD_` names are for the release workflow. The `CLOUDFLARE_` names are for the deploy workflow of the download site (`docs/ops/web-deploy.md`). OpenTofu reads them from that folder's state file, so nobody copies a key by hand.

| Name | Kind |
|---|---|
| `DOWNLOAD_BASE` | variable |
| `DOWNLOAD_BUCKET` | variable |
| `DOWNLOAD_S3_ENDPOINT` | variable |
| `DOWNLOAD_S3_REGION` | variable |
| `DOWNLOAD_S3_ACCESS_KEY_ID` | secret |
| `DOWNLOAD_S3_SECRET_ACCESS_KEY` | secret |
| `CLOUDFLARE_ACCOUNT_ID` | variable |
| `CLOUDFLARE_API_TOKEN` | secret |

The other settings of the workflow do not come from Cloudflare. Set them by hand: `docs/ops/desktop-release.md`.

## Set up

1. Start the infra shell: `cd infra`, then `devenv shell` (`infra/cloudflare/README.md`).
2. Apply `infra/cloudflare` first. Its state file must be at `infra/cloudflare/terraform.tfstate`.
3. Give OpenTofu a GitHub token of an admin of the repository. The token of the `gh` CLI works:

   ```sh
   export GITHUB_TOKEN=$(gh auth token)
   ```

   A fine-grained token needs these repository permissions: Secrets (read and write) and Variables (read and write).
4. Look at the plan, from `infra/`. It shows eight resources to add:

   ```sh
   cd github
   tofu init
   tofu plan
   ```

5. Apply it:

   ```sh
   tofu apply
   ```

6. Check the names (GitHub does not show a secret's value):

   ```sh
   gh variable list
   gh secret list
   ```

## After a change in infra/cloudflare

Run `tofu apply` here again. This is needed after a new upload key, a new domain or a new bucket name.

## If a name is already set by hand

`tofu apply` fails with "already exists" for a variable. Delete it (`gh variable delete <name>`), then apply again. A secret is replaced without an error.

## The state file

- `terraform.tfstate` stays on your Mac. It is gitignored. **It holds the upload key and the deploy key.** Treat it as a secret.
- If it is lost, delete the eight names in GitHub and apply again.
- `.terraform.lock.hcl` is committed. It pins the provider version.
- The owner and the repository are variables (`owner`, `repository`). The defaults are `Ascending-AI` and `inky`.
