# The settings of the release workflow that come from the download host
# (.github/workflows/release.yml), and the settings of the download
# site's deploy workflow (.github/workflows/web-deploy.yml). The values are the outputs of
# infra/cloudflare, read from that folder's state file. Steps: README.md in
# this folder.

terraform {
  required_version = ">= 1.6"
  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}

variable "owner" {
  description = "The GitHub organization that owns the repository."
  type        = string
  default     = "Ascending-AI"
}

variable "repository" {
  description = "The name of the repository."
  type        = string
  default     = "inky"
}

variable "cloudflare_state" {
  description = "The path of the state file of infra/cloudflare."
  type        = string
  default     = "../cloudflare/terraform.tfstate"
}

# The token comes from the environment: GITHUB_TOKEN.
provider "github" {
  owner = var.owner
}

data "terraform_remote_state" "cloudflare" {
  backend = "local"
  config = {
    path = var.cloudflare_state
  }
}

locals {
  cloudflare = data.terraform_remote_state.cloudflare.outputs
}

resource "github_actions_variable" "download" {
  for_each = toset([
    "DOWNLOAD_BASE",
    "DOWNLOAD_BUCKET",
    "DOWNLOAD_S3_ENDPOINT",
    "DOWNLOAD_S3_REGION",
  ])
  repository    = var.repository
  variable_name = each.key
  value         = local.cloudflare[each.key]
}

resource "github_actions_secret" "download" {
  for_each = toset([
    "DOWNLOAD_S3_ACCESS_KEY_ID",
    "DOWNLOAD_S3_SECRET_ACCESS_KEY",
  ])
  repository      = var.repository
  secret_name     = each.key
  plaintext_value = local.cloudflare[each.key]
}

# The download site's deploy workflow: the account and the deploy key.
resource "github_actions_variable" "web" {
  repository    = var.repository
  variable_name = "CLOUDFLARE_ACCOUNT_ID"
  value         = local.cloudflare["CLOUDFLARE_ACCOUNT_ID"]
}

resource "github_actions_secret" "web" {
  repository      = var.repository
  secret_name     = "CLOUDFLARE_API_TOKEN"
  plaintext_value = local.cloudflare["CLOUDFLARE_API_TOKEN"]
}
