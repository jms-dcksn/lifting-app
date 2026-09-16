#!/usr/bin/env bash
# Cloud Agent boot script: bring up Docker and the local Supabase stack, then
# write the app's .env.local. The Next.js dev server runs from `terminals`.
#
# Idempotent and safe to re-run: it no-ops when Docker or Supabase is already up.
set -euo pipefail
cd "$(dirname "$0")/.."

log() { echo "[start] $*"; }

# 1. Docker daemon (nested/dind). Two things matter in this VM:
#    - storage-driver must be fuse-overlayfs (overlay2 is unavailable nested).
#    - Docker must program the *legacy* iptables tables: the host's legacy FORWARD
#      chain policy is DROP, so rules written only to nft would let that DROP kill
#      container-to-container traffic (Supabase auth/rest -> postgres).
if ! sudo docker info >/dev/null 2>&1; then
  log "starting dockerd"
  sudo update-alternatives --set iptables /usr/sbin/iptables-legacy >/dev/null 2>&1 || true
  sudo update-alternatives --set ip6tables /usr/sbin/ip6tables-legacy >/dev/null 2>&1 || true
  sudo mkdir -p /etc/docker
  echo '{"storage-driver":"fuse-overlayfs","iptables":true}' | sudo tee /etc/docker/daemon.json >/dev/null
  sudo bash -c 'nohup dockerd >/var/log/dockerd.log 2>&1 &'
  for _ in $(seq 1 60); do sudo docker info >/dev/null 2>&1 && break; sleep 1; done
fi
# Let the non-root agent user talk to the daemon without sudo.
sudo chmod 666 /var/run/docker.sock || true

# 2. Local Supabase stack (db + auth + rest + mailpit). Migrations apply on first
#    run; later runs reuse the existing database volume.
if ! npx --no-install supabase status >/dev/null 2>&1; then
  log "starting supabase (first run pulls images + applies migrations)"
  npx --no-install supabase start
else
  log "supabase already running"
fi

# 3. App configuration from the live stack. These are Supabase's well-known local
#    development keys derived from supabase/config.toml, not secrets.
log "writing .env.local"
eval "$(npx --no-install supabase status -o env | grep -E '^(API_URL|PUBLISHABLE_KEY)=')"
cat > .env.local <<EOF
NEXT_PUBLIC_SUPABASE_URL=${API_URL}
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${PUBLISHABLE_KEY}
EOF

log "ready (Supabase API at ${API_URL}, Mailpit at http://127.0.0.1:54324)"
