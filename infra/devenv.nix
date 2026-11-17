{ pkgs, ... }:

# The shell for infra/cloudflare and infra/github: `devenv shell` in infra/,
# or direnv (`direnv allow`). Steps: the README.md of each folder.
{
  packages = [
    # Applies the two folders (`tofu init`, `tofu plan`, `tofu apply`).
    pkgs.opentofu
    # Reads and writes the bucket by hand, when needed (infra/cloudflare/README.md).
    pkgs.awscli2
    # Gives infra/github its token (`gh auth token`) and lists the settings.
    pkgs.gh
  ];
}
