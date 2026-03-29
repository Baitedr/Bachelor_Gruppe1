# Run Kamal with backend as cwd (config/deploy.yml + Gemfile live there).
$RepoRoot = Split-Path $PSScriptRoot -Parent
$Backend = Join-Path $RepoRoot "backend"
Set-Location $Backend
if (Test-Path "Gemfile") {
  & bundle exec kamal @args
} else {
  & kamal @args
}
exit $LASTEXITCODE
