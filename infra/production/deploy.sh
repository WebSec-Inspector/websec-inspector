#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

sha=${1:-}
if [[ ! $sha =~ ^[a-f0-9]{40}$ ]]; then
    echo 'A full lowercase commit SHA is required.' >&2
    exit 2
fi
root=${WEBSEC_ROOT:-/opt/websec-inspector}
release="$root/releases/$sha"
[[ -d $release && -f $release/compose.yml && -f $release/Caddyfile && -f $root/.env ]] || {
    echo 'Release files or server configuration are missing.' >&2; exit 2;
}
exec 9>"$root/.deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 3; }

candidate=$(mktemp "$root/.candidate.XXXXXX")
previous=$(mktemp "$root/.previous.XXXXXX")
trap 'rm -f "$candidate" "$previous"' EXIT
printf 'IMAGE_TAG=sha-%s\nRELEASE_DIR=%s\n' "$sha" "$release" > "$candidate"
had_previous=false
if [[ -f $root/.release.env ]]; then
    cp "$root/.release.env" "$previous"
    had_previous=true
fi

compose() {
    local version_file=$1 config_dir=$2
    shift 2
    docker compose --project-name websec-production --env-file "$root/.env" \
        --env-file "$version_file" -f "$config_dir/compose.yml" "$@"
}
compose "$candidate" "$release" config --quiet
compose "$candidate" "$release" pull
if $had_previous; then
    WEBSEC_ROOT="$root" bash "$release/backup.sh"
fi

rollback() {
    local failure=$1
    trap - ERR
    if $had_previous; then
        cp "$previous" "$candidate"
        mv "$candidate" "$root/.release.env"
        local old_dir
        old_dir=$(sed -n 's/^RELEASE_DIR=//p' "$root/.release.env")
        if [[ -d $old_dir ]] && compose "$root/.release.env" "$old_dir" up -d --wait --wait-timeout 600; then
            echo 'Deployment failed; previous images and configuration restored.' >&2
        else
            echo 'Deployment and rollback failed; operator intervention required.' >&2
        fi
    else
        rm -f "$root/.release.env"
        echo 'First deployment failed; no previous release is available.' >&2
    fi
    exit "$failure"
}
trap 'rollback $?' ERR
mv "$candidate" "$root/.release.env"
compose "$root/.release.env" "$release" up -d --wait --wait-timeout 600
host=$(sed -n 's/^SITE_HOST=//p' "$root/.env" | head -n 1)
[[ $host =~ ^[a-zA-Z0-9.-]+$ ]] || { echo 'Invalid SITE_HOST.' >&2; false; }
curl --fail --silent --show-error --retry 10 --retry-all-errors --retry-delay 5 \
    --connect-timeout 10 --max-time 20 "https://$host/" >/dev/null
actual_sha=$(curl --fail --silent --show-error --connect-timeout 10 --max-time 20 "https://$host/version.txt")
[[ $actual_sha == "$sha" ]] || { echo 'Published version does not match deployment commit.' >&2; false; }
ln -sfn "$release" "$root/current"
echo "Deployment verified: $sha"
