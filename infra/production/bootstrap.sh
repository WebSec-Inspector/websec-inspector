#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

[[ $EUID == 0 ]] || { echo 'Run with sudo on the new Ubuntu VM.' >&2; exit 2; }
host=${1:-}
public_key_file=${2:-}
[[ $host =~ ^[a-zA-Z0-9.-]+$ && -f $public_key_file ]] || {
    echo 'Usage: sudo bash bootstrap.sh <hostname> <deploy-public-key-file>' >&2; exit 2;
}
ssh-keygen -l -f "$public_key_file" >/dev/null
. /etc/os-release
[[ $ID == ubuntu ]] || { echo 'Ubuntu is required.' >&2; exit 2; }
apt-get update
apt-get install -y ca-certificates curl openssl
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: ${UBUNTU_CODENAME:-$VERSION_CODENAME}
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
id websec >/dev/null 2>&1 || useradd --create-home --shell /bin/bash websec
usermod -aG docker websec
install -d -m 0700 -o websec -g websec /home/websec/.ssh
touch /home/websec/.ssh/authorized_keys
key=$(cat "$public_key_file")
grep -qxF "$key" /home/websec/.ssh/authorized_keys || printf '%s\n' "$key" >> /home/websec/.ssh/authorized_keys
chmod 0600 /home/websec/.ssh/authorized_keys
chown websec:websec /home/websec/.ssh/authorized_keys
install -d -m 0700 -o websec -g websec /opt/websec-inspector /opt/websec-inspector/releases /opt/websec-inspector/backups
if [[ ! -e /opt/websec-inspector/.env ]]; then
    config=$(mktemp /opt/websec-inspector/.env.XXXXXX)
    printf 'SITE_HOST=%s\nPOSTGRES_PASSWORD=%s\nJWT_SECRET=%s\n' "$host" "$(openssl rand -hex 32)" "$(openssl rand -hex 64)" > "$config"
    chown websec:websec "$config"
    mv "$config" /opt/websec-inspector/.env
fi
install -d -m 0755 /etc/ssh/sshd_config.d
printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\n' > /etc/ssh/sshd_config.d/00-websec-keys.conf
sshd -t
systemctl reload ssh
docker compose version
echo 'Bootstrap complete. Configure cloud and host firewall, verify host keys and GHCR access before deploying.'
