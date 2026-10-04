#!/usr/bin/env bash
# Applies the repository's settings as code: merge settings, security features, Actions policy
# and rulesets. Idempotent: run it once as a repository admin after the first push
# (once ci-ok has run at least once), and again after any change to this script or to
# .github/rulesets/. Never run it from CI.
#
# Usage:
#   scripts/github/apply-repo-settings.sh [--dry-run] [OWNER/REPO]
#
# Environment:
#   REQUIRED_APPROVALS    Approvals required on pull requests (default 1). 0 suits a solo
#                         maintainer: it also turns off code-owner review and last-push approval.
#
# Requires gh (authenticated with a token that has admin rights on the repository) and jq.
# The script detects the repository's visibility and available features, applies what it can and
# prints a summary of anything skipped.

set -euo pipefail

API_VERSION=2026-03-10
GITHUB_ACTIONS_APP_ID=15368
REPOSITORY_ADMIN_ROLE_ID=5

DRY_RUN=false
REPO=""
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    -h | --help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *) REPO="$arg" ;;
  esac
done

for tool in gh jq; do
  command -v "$tool" >/dev/null || { echo "error: $tool is required" >&2; exit 1; }
done

ROOT=$(cd "$(dirname "$0")/../.." && pwd)
REPO=${REPO:-$(gh repo view --json nameWithOwner --jq .nameWithOwner)}
REQUIRED_APPROVALS=${REQUIRED_APPROVALS:-1}
[[ "$REQUIRED_APPROVALS" =~ ^[0-9]+$ ]] || { echo "error: REQUIRED_APPROVALS must be a number" >&2; exit 1; }

APPLIED=()
SKIPPED=()
MANUAL=()

applied() { APPLIED+=("$1"); }
skipped() { SKIPPED+=("$1"); }
manual() { MANUAL+=("$1"); }

# Read-only calls always run, so a dry run still detects features accurately.
api_get() {
  gh api -H "X-GitHub-Api-Version: ${API_VERSION}" "$@"
}

# Write calls; with --dry-run they are printed instead. Returns gh's exit status.
api_write() {
  local method=$1 path=$2 body=${3:-}
  if $DRY_RUN; then
    echo "DRY RUN: ${method} ${path} ${body}"
    return 0
  fi
  if [ -n "$body" ]; then
    gh api --silent -X "$method" -H "X-GitHub-Api-Version: ${API_VERSION}" "$path" --input - <<<"$body"
  else
    gh api --silent -X "$method" -H "X-GitHub-Api-Version: ${API_VERSION}" "$path"
  fi
}

# Runs one write and records the outcome; a failure is reported, not fatal.
step() {
  local label=$1
  shift
  if api_write "$@"; then
    applied "$label"
  else
    skipped "$label (failed; see the error above)"
  fi
}

echo "Repository: ${REPO}$($DRY_RUN && echo ' (dry run: features are assumed available)')"

repo_json=$(api_get "repos/${REPO}")
if [ "$(jq -r .permissions.admin <<<"$repo_json")" != true ]; then
  echo "error: you need admin rights on ${REPO}" >&2
  exit 1
fi
VISIBILITY=$(jq -r .visibility <<<"$repo_json")
IS_PUBLIC=$([ "$VISIBILITY" = public ] && echo true || echo false)
echo "Visibility: ${VISIBILITY}"

# 1. Merge settings: rebase merges only, so every reviewed commit lands on main unchanged.
merge_settings=$(jq -n '{
  allow_rebase_merge: true,
  allow_squash_merge: false,
  allow_merge_commit: false,
  delete_branch_on_merge: true,
  allow_auto_merge: true,
  allow_update_branch: true,
  has_wiki: true,
  has_projects: false
}')
step "merge settings (rebase only, auto-merge, wiki on)" PATCH "repos/${REPO}" "$merge_settings"
if $IS_PUBLIC; then
  manual "Settings > General > Features > Wikis: enable \"Restrict editing to collaborators only\""
fi

# 2. Security features. Each is enabled on its own, so one unavailable feature doesn't block
#    the others; failures on private repositories mean the plan doesn't include it.
enable_feature() {
  local key=$1 label=$2
  local body
  body=$(jq -n --arg key "$key" '{security_and_analysis: {($key): {status: "enabled"}}}')
  if api_write PATCH "repos/${REPO}" "$body" 2>/dev/null; then
    applied "$label"
    return 0
  fi
  skipped "$label (not available for this repository)"
  return 1
}

SECRET_PROTECTION=false
CODE_SECURITY=false
if $IS_PUBLIC; then
  SECRET_PROTECTION=true
  CODE_SECURITY=true
else
  # Private repositories need GitHub Secret Protection / Code Security for these.
  enable_feature secret_scanning "secret scanning" && SECRET_PROTECTION=true || true
  enable_feature code_security "GitHub Code Security" && CODE_SECURITY=true || true
fi
if $SECRET_PROTECTION; then
  if $IS_PUBLIC; then enable_feature secret_scanning "secret scanning" || true; fi
  enable_feature secret_scanning_push_protection "secret scanning push protection" || true
  enable_feature secret_scanning_non_provider_patterns "secret scanning non-provider patterns" || true
  # Validity checks are no longer listed under security_and_analysis in the REST API; try, and
  # fall back to the settings page.
  enable_feature secret_scanning_validity_checks "secret scanning validity checks" ||
    manual "Settings > Code security > Secret Protection: enable validity checks"
else
  skipped "secret scanning, push protection, validity checks (no Secret Protection: CI runs gitleaks)"
fi

step "Dependabot alerts" PUT "repos/${REPO}/vulnerability-alerts"
step "Dependabot security updates" PUT "repos/${REPO}/automated-security-fixes"
step "private vulnerability reporting" PUT "repos/${REPO}/private-vulnerability-reporting"

if $CODE_SECURITY; then
  # Advanced setup lives in .github/workflows/codeql.yml; default setup conflicts with it.
  if api_write PATCH "repos/${REPO}/code-scanning/default-setup" '{"state":"not-configured"}' 2>/dev/null; then
    applied "CodeQL default setup off (advanced setup in codeql.yml)"
  else
    skipped "CodeQL default setup (couldn't read or change it)"
  fi
  manual "Settings > Code security > Code scanning: enable Copilot Autofix (no REST setting)"
else
  skipped "code scanning (no Code Security: CodeQL and dependency review jobs are skipped)"
fi

# 3. Gating variables read by the workflows.
set_variable() {
  local name=$1 value=$2
  local body
  body=$(jq -n --arg name "$name" --arg value "$value" '{name: $name, value: $value}')
  if api_get "repos/${REPO}/actions/variables/${name}" >/dev/null 2>&1; then
    step "variable ${name}=${value}" PATCH "repos/${REPO}/actions/variables/${name}" "$body"
  else
    step "variable ${name}=${value}" POST "repos/${REPO}/actions/variables" "$body"
  fi
}
set_variable CODE_SECURITY "$CODE_SECURITY"
set_variable SECRET_PROTECTION "$SECRET_PROTECTION"

# 4. Actions policy: GitHub-owned actions plus exactly the third-party actions the workflows use,
#    all pinned by SHA; a read-only default token that can't create or approve pull requests.
step "Actions: selected actions only, SHA pinning required" \
  PUT "repos/${REPO}/actions/permissions" \
  '{"enabled":true,"allowed_actions":"selected","sha_pinning_required":true}'
selected_actions=$(jq -n '{
  github_owned_allowed: true,
  verified_allowed: false,
  patterns_allowed: [
    "docker/setup-buildx-action@*",
    "docker/bake-action@*",
    "pnpm/action-setup@*",
    "dependabot/fetch-metadata@*",
    "aquasecurity/trivy-action@*",
    "raven-actions/actionlint@*",
    "zizmorcore/zizmor-action@*",
    "ossf/scorecard-action@*"
  ]
}')
step "Actions: allowlist of third-party actions" \
  PUT "repos/${REPO}/actions/permissions/selected-actions" "$selected_actions"
step "Actions: read-only default token, can't create or approve pull requests" \
  PUT "repos/${REPO}/actions/permissions/workflow" \
  '{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}'
if $IS_PUBLIC; then
  step "Actions: fork pull requests need approval for all external contributors" \
    PUT "repos/${REPO}/actions/permissions/fork-pr-contributor-approval" \
    '{"approval_policy":"all_external_contributors"}'
fi

# 5. Rulesets from .github/rulesets/*.json, created or updated by name.
ruleset_body() {
  local file=$1
  local body
  body=$(cat "$file")
  if [ "$(jq -r .name <<<"$body")" = main ]; then
    body=$(jq --argjson approvals "$REQUIRED_APPROVALS" '
      .rules |= map(
        if .type == "pull_request" then
          .parameters.required_approving_review_count = $approvals
          | if $approvals == 0 then
              .parameters.require_code_owner_review = false
              | .parameters.require_last_push_approval = false
            else . end
        else . end)' <<<"$body")
    if ! $CODE_SECURITY; then
      body=$(jq '.rules |= map(select(.type != "code_scanning"))' <<<"$body")
    fi
  fi
  echo "$body"
}

apply_ruleset() {
  local body=$1 name id
  name=$(jq -r .name <<<"$body")
  id=$(api_get "repos/${REPO}/rulesets?includes_parents=false" --paginate \
    --jq ".[] | select(.name == \"${name}\") | .id" | head -n1)
  if [ -n "$id" ]; then
    api_write PUT "repos/${REPO}/rulesets/${id}" "$body"
  else
    api_write POST "repos/${REPO}/rulesets" "$body"
  fi
}

for file in "$ROOT"/.github/rulesets/*.json; do
  body=$(ruleset_body "$file")
  name=$(jq -r .name <<<"$body")
  if apply_ruleset "$body"; then
    applied "ruleset ${name}"
  elif jq -e --argjson app "$GITHUB_ACTIONS_APP_ID" \
    '.bypass_actors | any(.actor_type == "Integration" and .actor_id == $app)' <<<"$body" >/dev/null; then
    # Some repositories (personal ones, for example) don't accept the GitHub Actions app as a
    # bypass actor. Repository admins bypass instead, and creation is no longer blocked, so the
    # Release workflow can still create tags; only admins can move or delete them.
    body=$(jq --argjson role "$REPOSITORY_ADMIN_ROLE_ID" '
      .bypass_actors = [{actor_id: $role, actor_type: "RepositoryRole", bypass_mode: "always"}]
      | .rules |= map(select(.type != "creation"))' <<<"$body")
    if apply_ruleset "$body"; then
      applied "ruleset ${name} (the GitHub Actions app wasn't accepted: admins bypass, creation allowed)"
    else
      skipped "ruleset ${name} (rejected; see the error above)"
    fi
  else
    skipped "ruleset ${name} (rejected; see the error above)"
  fi
done
if [ "$REQUIRED_APPROVALS" -eq 0 ]; then
  manual "REQUIRED_APPROVALS=0: pull requests merge without review; use only for a solo maintainer"
fi

echo
echo "Applied:"
printf '  - %s\n' "${APPLIED[@]}"
if [ ${#SKIPPED[@]} -gt 0 ]; then
  echo "Skipped:"
  printf '  - %s\n' "${SKIPPED[@]}"
fi
if [ ${#MANUAL[@]} -gt 0 ]; then
  echo "Do by hand:"
  printf '  - %s\n' "${MANUAL[@]}"
fi
