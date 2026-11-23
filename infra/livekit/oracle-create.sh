#!/usr/bin/env bash
# Creates the webinar stage server on Oracle Cloud's Always Free tier.
# Run in OCI Cloud Shell (it is already signed in to your tenancy):
#
#   curl -fsSL https://raw.githubusercontent.com/illuxus-bm/illuxus/<branch>/infra/livekit/oracle-create.sh | REF=<branch> bash
#
# Makes a fresh LiveKit API key and secret in ~/livekit-keys.env (only in
# your Cloud Shell; copy them into Supabase yourself), an SSH key in
# ~/.ssh/illuxus_live, a network security group with the stage's ports,
# and an Ampere A1 VM (2 OCPU, 12 GB: the Always Free allowance) that runs
# setup.sh on first boot.
set -euo pipefail

C=${OCI_TENANCY:?run this in OCI Cloud Shell}
REF=${REF:-main}
NAME=${NAME:-illuxus-live}
WEBHOOK_URL=${WEBHOOK_URL:-https://xhjdcimginceibzcwzlk.supabase.co/functions/v1/livekit-webhook}
KEYS=~/livekit-keys.env

if [ ! -f "$KEYS" ]; then
  umask 077
  {
    echo "LIVEKIT_API_KEY=API$(openssl rand -hex 6)"
    echo "LIVEKIT_API_SECRET=$(openssl rand -base64 48 | tr -dc 'A-Za-z0-9' | head -c 48)"
  } > "$KEYS"
fi
# shellcheck disable=SC1090
. "$KEYS"
[ -f ~/.ssh/illuxus_live ] || ssh-keygen -t ed25519 -N "" -f ~/.ssh/illuxus_live -q

existing=$(oci compute instance list -c "$C" --display-name "$NAME" --lifecycle-state RUNNING --query 'data[0].id' --raw-output 2>/dev/null || true)
if [ -n "$existing" ] && [ "$existing" != "null" ]; then
  echo "Server $NAME already exists: $existing"; ID=$existing
else
  SUBNET=$(oci network subnet list -c "$C" --all --query 'data[?"prohibit-public-ip-on-vnic"==`false`] | [0].id' --raw-output)
  VCN=$(oci network subnet get --subnet-id "$SUBNET" --query 'data."vcn-id"' --raw-output)
  echo "Subnet $SUBNET"

  NSG=$(oci network nsg list -c "$C" --vcn-id "$VCN" --display-name "$NAME" --query 'data[0].id' --raw-output 2>/dev/null || true)
  if [ -z "$NSG" ] || [ "$NSG" = "null" ]; then
    NSG=$(oci network nsg create -c "$C" --vcn-id "$VCN" --display-name "$NAME" --wait-for-state AVAILABLE --query 'data.id' --raw-output)
    tcp() { printf '{"direction":"INGRESS","protocol":"6","source":"0.0.0.0/0","sourceType":"CIDR_BLOCK","tcpOptions":{"destinationPortRange":{"min":%s,"max":%s}}}' "$1" "$2"; }
    udp() { printf '{"direction":"INGRESS","protocol":"17","source":"0.0.0.0/0","sourceType":"CIDR_BLOCK","udpOptions":{"destinationPortRange":{"min":%s,"max":%s}}}' "$1" "$2"; }
    echo "[$(tcp 80 80),$(tcp 443 443),$(tcp 7881 7881),$(udp 3478 3478),$(udp 50000 60000)]" > /tmp/nsg-rules.json
    oci network nsg rules add --nsg-id "$NSG" --security-rules file:///tmp/nsg-rules.json >/dev/null
  fi
  echo "Firewall group $NSG"

  IMG=$(oci compute image list -c "$C" --operating-system "Canonical Ubuntu" --operating-system-version "24.04" \
    --shape VM.Standard.A1.Flex --sort-by TIMECREATED --sort-order DESC --query 'data[0].id' --raw-output)
  AD=$(oci iam availability-domain list -c "$C" --query 'data[0].name' --raw-output)
  echo "Image $IMG in $AD"

  umask 077
  cat > /tmp/userdata.sh <<UD
#!/bin/bash
cat > /root/livekit.env <<ENV
export LIVEKIT_API_KEY=${LIVEKIT_API_KEY}
export LIVEKIT_API_SECRET=${LIVEKIT_API_SECRET}
export WEBHOOK_URL=${WEBHOOK_URL}
ENV
chmod 600 /root/livekit.env
curl -fsSL https://raw.githubusercontent.com/illuxus-bm/illuxus/${REF}/infra/livekit/setup.sh -o /root/setup.sh
. /root/livekit.env && bash /root/setup.sh > /var/log/livekit-setup.log 2>&1
UD

  ID=$(oci compute instance launch -c "$C" --availability-domain "$AD" \
    --shape VM.Standard.A1.Flex --shape-config '{"ocpus":2,"memoryInGBs":12}' \
    --image-id "$IMG" --subnet-id "$SUBNET" --nsg-ids "[\"$NSG\"]" --assign-public-ip true \
    --boot-volume-size-in-gbs 50 --display-name "$NAME" \
    --ssh-authorized-keys-file ~/.ssh/illuxus_live.pub --user-data-file /tmp/userdata.sh \
    --wait-for-state RUNNING --query 'data.id' --raw-output)
  rm -f /tmp/userdata.sh
fi

IP=$(oci compute instance list-vnics --instance-id "$ID" --query 'data[0]."public-ip"' --raw-output)
echo
echo "SERVER_IP=$IP"
echo "LIVEKIT_URL=wss://${IP//./-}.sslip.io"
echo "Setup runs on first boot (about 5 minutes). Follow it with:"
echo "  ssh -i ~/.ssh/illuxus_live ubuntu@$IP sudo tail -f /var/log/livekit-setup.log"
