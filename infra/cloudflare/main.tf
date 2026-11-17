# The download host of the desktop app: an R2 bucket in the EU jurisdiction,
# served at https://<domain>. The release workflow uploads to the bucket
# (.github/workflows/release.yml). The app reads its updates from
# the domain. Steps: README.md in this folder.

terraform {
  required_version = ">= 1.6"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }
}

# The API token comes from the environment: CLOUDFLARE_API_TOKEN.
provider "cloudflare" {}

variable "account_id" {
  description = "The Cloudflare account id (dashboard, Account home, the menu next to the account name)."
  type        = string
}

variable "zone_id" {
  description = "The zone id of the domain's zone (dashboard, the zone's Overview page). The zone must be in this account."
  type        = string
}

variable "domain" {
  description = "The public host name of the download host."
  type        = string
  default     = "inky-downloads.ascending.ai"
}

variable "bucket" {
  description = "The name of the R2 bucket."
  type        = string
  default     = "inky-downloads"
}

variable "site_origins" {
  description = "The origins of the download page (web/). A browser on these origins can read the bucket's objects."
  type        = list(string)
  default     = ["https://inky.ascending.ai"]
}

resource "cloudflare_r2_bucket" "downloads" {
  account_id = var.account_id
  name       = var.bucket
  # The objects stay in the EU.
  jurisdiction = "eu"

  lifecycle {
    # The bucket holds each released version and the update feed.
    prevent_destroy = true
  }
}

# The domain serves the bucket's objects to everyone, read only. Cloudflare
# makes the DNS record and the certificate. The r2.dev address stays off.
resource "cloudflare_r2_custom_domain" "downloads" {
  account_id   = var.account_id
  bucket_name  = cloudflare_r2_bucket.downloads.name
  jurisdiction = "eu"
  domain       = var.domain
  zone_id      = var.zone_id
  enabled      = true
  min_tls      = "1.2"
}

# The download page (web/) reads app/latest.json from a browser on another
# origin. Only the page's origin can do that. The rule is for browsers only:
# the app, curl and a download link do not use CORS.
resource "cloudflare_r2_bucket_cors" "downloads" {
  account_id   = var.account_id
  bucket_name  = cloudflare_r2_bucket.downloads.name
  jurisdiction = "eu"
  rules = [{
    allowed = {
      methods = ["GET", "HEAD"]
      origins = var.site_origins
    }
    max_age_seconds = 3600
  }]
}

# The upload key of the release workflow: it can read and write objects in
# this bucket only. R2's S3 API takes the token's id as the access key id and
# the SHA-256 of the token's value as the secret access key.
data "cloudflare_account_api_token_permission_groups_list" "r2_bucket_item_write" {
  account_id = var.account_id
  name       = "Workers R2 Storage Bucket Item Write"
}

resource "cloudflare_account_token" "upload" {
  account_id = var.account_id
  name       = "inky desktop release upload"
  policies = [{
    effect            = "allow"
    permission_groups = [{ id = data.cloudflare_account_api_token_permission_groups_list.r2_bucket_item_write.result[0].id }]
    resources = jsonencode({
      "com.cloudflare.edge.r2.bucket.${var.account_id}_eu_${cloudflare_r2_bucket.downloads.name}" = "*"
    })
  }]
}

# The deploy key of the download site (web/, a Worker with static files
# at inky.ascending.ai): it can change the account's Workers and the zone's
# Worker routes. Wrangler makes the site's domain with it
# (.github/workflows/web-deploy.yml).
data "cloudflare_account_api_token_permission_groups_list" "workers_scripts_write" {
  account_id = var.account_id
  name       = "Workers Scripts Write"
}

data "cloudflare_account_api_token_permission_groups_list" "workers_routes_write" {
  account_id = var.account_id
  name       = "Workers Routes Write"
}

resource "cloudflare_account_token" "web_deploy" {
  account_id = var.account_id
  name       = "inky download site deploy"
  policies = [
    {
      effect            = "allow"
      permission_groups = [{ id = data.cloudflare_account_api_token_permission_groups_list.workers_scripts_write.result[0].id }]
      resources = jsonencode({
        "com.cloudflare.api.account.${var.account_id}" = "*"
      })
    },
    {
      effect            = "allow"
      permission_groups = [{ id = data.cloudflare_account_api_token_permission_groups_list.workers_routes_write.result[0].id }]
      resources = jsonencode({
        "com.cloudflare.api.account.zone.${var.zone_id}" = "*"
      })
    },
  ]
}

# The values for the release workflow. infra/github reads them from this
# folder's state and sets them in the repository.
output "DOWNLOAD_BASE" {
  value = "https://${var.domain}"
}

output "DOWNLOAD_BUCKET" {
  value = "s3://${cloudflare_r2_bucket.downloads.name}"
}

output "DOWNLOAD_S3_ENDPOINT" {
  value = "https://${var.account_id}.eu.r2.cloudflarestorage.com"
}

output "DOWNLOAD_S3_REGION" {
  value = "auto"
}

output "DOWNLOAD_S3_ACCESS_KEY_ID" {
  value = cloudflare_account_token.upload.id
}

output "DOWNLOAD_S3_SECRET_ACCESS_KEY" {
  value     = sha256(cloudflare_account_token.upload.value)
  sensitive = true
}

# The values for the deploy workflow of the download site.
output "CLOUDFLARE_ACCOUNT_ID" {
  value = var.account_id
}

output "CLOUDFLARE_API_TOKEN" {
  value     = cloudflare_account_token.web_deploy.value
  sensitive = true
}
