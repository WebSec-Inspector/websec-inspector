#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root=${WEBSEC_ROOT:-/opt/websec-inspector}
[[ -f $root/.release.env ]] || { echo 'No release to back up.' >&2; exit 2; }
release=$(sed -n 's/^RELEASE_DIR=//p' "$root/.release.env")
backup_dir="$root/backups/$(date -u +%Y%m%dT%H%M%S)-$$"
mkdir -p "$backup_dir"
compose=(docker compose --project-name websec-production --env-file "$root/.env" --env-file "$root/.release.env" -f "$release/compose.yml")
"${compose[@]}" exec -T postgres pg_dump -U websec -d websec --format=custom > "$backup_dir/postgres.dump"
"${compose[@]}" exec -T worker tar -C /data/reports -czf - . > "$backup_dir/reports.tar.gz"
cp "$root/.release.env" "$backup_dir/release.env"
printf 'Backup created: %s\n' "$backup_dir"
# Delete only older directories created under this dedicated backup location.
mapfile -t obsolete < <(find "$root/backups" -mindepth 1 -maxdepth 1 -type d -name '????????T??????-*' | sort -r | tail -n +8)
for directory in "${obsolete[@]}"; do
    [[ $directory == "$root/backups/"* && ! -L $directory ]] || exit 2
    rm -rf -- "$directory"
done
