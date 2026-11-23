#!/usr/bin/env bash
# Installs the webinar stage on one Ubuntu server (amd64 or arm64):
# LiveKit server (WebRTC, up to 15 on stage), LiveKit Egress (composes the
# stage into HLS for viewers), Redis, and Caddy for TLS on 443.
#
# Viewers never connect here: Egress uploads HLS segments to S3-compatible
# storage (Cloudflare R2) and they watch from the CDN in front of it.
#
# Run as root. Re-run any time to change settings; it is idempotent.
#
#   LIVEKIT_API_KEY=...  LIVEKIT_API_SECRET=...      required
#   LIVEKIT_DOMAIN=live.example.com                  optional; default <ip>.sslip.io
#   WEBHOOK_URL=https://<ref>.supabase.co/functions/v1/livekit-webhook
#   S3_ENDPOINT=https://<account>.r2.cloudflarestorage.com
#   S3_BUCKET=...  S3_ACCESS_KEY=...  S3_SECRET=...   Egress storage
#   S3_REGION=auto
set -euo pipefail

: "${LIVEKIT_API_KEY:?}" "${LIVEKIT_API_SECRET:?}"
DIR=/opt/livekit
mkdir -p "$DIR"

PUBLIC_IP=$(curl -fsS https://api.ipify.org)
DOMAIN=${LIVEKIT_DOMAIN:-${PUBLIC_IP//./-}.sslip.io}

if ! command -v docker >/dev/null; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -q
  apt-get install -yq docker.io docker-compose-v2 iptables-persistent
  systemctl enable --now docker
fi

# Oracle's Ubuntu images reject everything but SSH in iptables; open the
# stage's ports (the cloud firewall must allow them too).
open() {
  iptables -C INPUT -p "$1" --dport "$2" -j ACCEPT 2>/dev/null && return
  local at; at=$(iptables -L INPUT --line-numbers -n | awk '/REJECT/ {print $1; exit}')
  if [ -n "$at" ]; then iptables -I INPUT "$at" -p "$1" --dport "$2" -j ACCEPT
  else iptables -A INPUT -p "$1" --dport "$2" -j ACCEPT; fi
}
open tcp 80; open tcp 443; open tcp 7881; open udp 3478; open udp 50000:60000
netfilter-persistent save >/dev/null 2>&1 || true

cat > "$DIR/livekit.yaml" <<YAML
port: 7880
rtc:
  tcp_port: 7881
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: true
redis:
  address: localhost:6379
keys:
  ${LIVEKIT_API_KEY}: ${LIVEKIT_API_SECRET}
room:
  empty_timeout: 600
turn:
  enabled: true
  domain: ${DOMAIN}
  udp_port: 3478
YAML
if [ -n "${WEBHOOK_URL:-}" ]; then
  cat >> "$DIR/livekit.yaml" <<YAML
webhook:
  api_key: ${LIVEKIT_API_KEY}
  urls:
    - ${WEBHOOK_URL}
YAML
fi

cat > "$DIR/egress.yaml" <<YAML
api_key: ${LIVEKIT_API_KEY}
api_secret: ${LIVEKIT_API_SECRET}
ws_url: ws://localhost:7880
redis:
  address: localhost:6379
health_port: 8080
# A small server: let one composed stream (HLS or recording) run per 2 cores.
cpu_cost:
  room_composite_cpu_cost: 1.5
  track_composite_cpu_cost: 1
  track_cpu_cost: 0.5
YAML
if [ -n "${S3_BUCKET:-}" ]; then
  cat >> "$DIR/egress.yaml" <<YAML
s3:
  access_key: ${S3_ACCESS_KEY}
  secret: ${S3_SECRET}
  region: ${S3_REGION:-auto}
  endpoint: ${S3_ENDPOINT}
  bucket: ${S3_BUCKET}
  force_path_style: true
YAML
fi

cat > "$DIR/Caddyfile" <<CADDY
${DOMAIN} {
  reverse_proxy localhost:7880
}
CADDY

cat > "$DIR/compose.yaml" <<'YAML'
services:
  redis:
    image: redis:7-alpine
    command: redis-server --bind 127.0.0.1 --save "" --appendonly no
    network_mode: host
    restart: unless-stopped
  livekit:
    image: livekit/livekit-server:v1.10
    command: --config /etc/livekit.yaml
    volumes: ["./livekit.yaml:/etc/livekit.yaml:ro"]
    network_mode: host
    restart: unless-stopped
    depends_on: [redis]
  egress:
    image: livekit/egress:v1.12
    environment:
      EGRESS_CONFIG_FILE: /etc/egress.yaml
    volumes: ["./egress.yaml:/etc/egress.yaml:ro"]
    cap_add: [SYS_ADMIN]
    shm_size: 1gb
    network_mode: host
    restart: unless-stopped
    depends_on: [livekit]
  caddy:
    image: caddy:2
    volumes: ["./Caddyfile:/etc/caddy/Caddyfile:ro", "caddy:/data"]
    network_mode: host
    restart: unless-stopped
volumes:
  caddy: {}
YAML

# The keys are in these files: only root can reach the folder.
chmod 700 "$DIR"; chmod 644 "$DIR"/*.yaml "$DIR/Caddyfile"
cd "$DIR"
docker compose pull -q
docker compose up -d --force-recreate
echo "LIVEKIT_URL=wss://${DOMAIN}"
