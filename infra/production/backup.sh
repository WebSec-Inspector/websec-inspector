#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
root=$(realpath -e -- "${WEBSEC_ROOT:-/opt/websec-inspector}")
[[ -f $root/.release.env ]] || { echo 'No release to back up.' >&2; exit 2; }
release=$(sed -n 's/^RELEASE_DIR=//p' "$root/.release.env")
backup_dir="$root/backups/$(date -u +%Y%m%dT%H%M%S)-$$"
mkdir -p "$backup_dir"
compose=(docker compose --project-name websec-production --env-file "$root/.env" --env-file "$root/.release.env" -f "$release/compose.yml")
"${compose[@]}" exec -T postgres pg_dump -U websec -d websec --format=custom > "$backup_dir/postgres.dump"
test -s "$backup_dir/postgres.dump"
"${compose[@]}" exec -T postgres pg_restore --list < "$backup_dir/postgres.dump" > "$backup_dir/database-archive-list.txt"
worker=$("${compose[@]}" ps --all --quiet worker)
[[ $worker =~ ^[a-f0-9]{12,64}$ ]] || { echo 'Exactly one existing worker container is required to locate reports.' >&2; exit 2; }
# Docker can archive from a stopped container; never start a scanner for backup.
docker cp "$worker:/data/reports/." - | gzip > "$backup_dir/reports.tar.gz"
gzip -t "$backup_dir/reports.tar.gz"
tar -tzf "$backup_dir/reports.tar.gz" > "$backup_dir/reports-archive-list.txt"
cp "$root/.release.env" "$backup_dir/release.env"
touch "$backup_dir/COMPLETE"
printf 'Backup created: %s\n' "$backup_dir"
# Delete only older directories created under this dedicated backup location.
mapfile -t obsolete < <(find "$root/backups" -mindepth 1 -maxdepth 1 -type d -name '????????T??????-*' -exec test -f '{}/COMPLETE' \; -print | sort -r | tail -n +8)
for directory in "${obsolete[@]}"; do
    resolved=$(realpath -e -- "$directory")
    [[ $resolved == "$root/backups/"* && ! -L $directory ]] || exit 2
    rm -rf -- "$directory"
done
