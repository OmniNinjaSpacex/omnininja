#!/usr/bin/env bash
set -euo pipefail

# OmniNinja AI Lab execution-host bootstrap.
#
# Based on the upstream lemonade-sdk/ailab Snap installation flow. This script
# deliberately keeps the AI Lab management API bound to 127.0.0.1:11500. It
# does NOT open firewall ports or expose the bearer-token API to the internet.
# Remote connectivity to the OmniNinja web service must be added separately via
# a private/authenticated tunnel or network layer.

if [[ "${EUID}" -eq 0 ]]; then
  echo "Run this script as a normal sudo-capable user, not directly as root." >&2
  exit 1
fi

if ! command -v sudo >/dev/null 2>&1; then
  echo "sudo is required." >&2
  exit 1
fi

if [[ ! -r /etc/os-release ]]; then
  echo "Could not detect the operating system." >&2
  exit 1
fi

# shellcheck disable=SC1091
source /etc/os-release
if [[ "${ID:-}" != "ubuntu" ]]; then
  echo "This bootstrap supports Ubuntu only. Detected: ${PRETTY_NAME:-unknown}." >&2
  exit 1
fi

major="${VERSION_ID%%.*}"
if [[ -z "${major}" || "${major}" -lt 22 ]]; then
  echo "AI Lab requires Ubuntu 22.04 or later. Detected: ${VERSION_ID:-unknown}." >&2
  exit 1
fi

echo "[1/6] Installing snapd if needed..."
if ! command -v snap >/dev/null 2>&1; then
  sudo apt-get update
  sudo apt-get install -y snapd
fi

echo "[2/6] Installing LXD..."
if ! snap list lxd >/dev/null 2>&1; then
  sudo snap install lxd
else
  echo "LXD is already installed."
fi

# Make snap-provided commands available in this non-login shell.
export PATH="/snap/bin:${PATH}"

echo "[3/6] Initialising LXD when no storage pool exists..."
if ! sudo lxc storage list --format csv 2>/dev/null | grep -q .; then
  sudo lxd init --auto
else
  echo "LXD already appears initialised; existing configuration preserved."
fi

echo "[4/6] Installing AI Lab..."
if ! snap list ailab >/dev/null 2>&1; then
  sudo snap install ailab
else
  echo "AI Lab is already installed."
fi

sudo snap connect ailab:lxd lxd:lxd

# Keep management access local by default. The OmniNinja architecture expects
# remote access to be provided by a separate private/authenticated transport.
echo "[5/6] Locking the AI Lab web API to localhost..."
sudo snap set ailab web.host=127.0.0.1
sudo snap set ailab web.port=11500

echo "[6/6] Running AI Lab diagnostics..."
ailab doctor

cat <<'EOF'

AI Lab host bootstrap complete.

Security defaults kept intentionally:
  - AI Lab API: 127.0.0.1:11500 only
  - No public firewall port was opened
  - No API token was printed by this script

Next on this execution host:
  1. Run: sudo ailab dashboard
  2. Use the displayed dashboard URL locally to confirm the service works.
  3. Store the AI Lab bearer token only in your deployment secret manager as
     AILAB_API_TOKEN. Do not commit it to GitHub.
  4. Configure a private/authenticated path from the OmniNinja web service to
     this host, then set AILAB_BASE_URL to that private endpoint.
  5. Test OmniNinja /api/health/sandbox before enabling public shell tasks.

Important: upstream AI Lab currently uses privileged LXD containers. Keep this
machine dedicated to execution workloads and separate from the OmniNinja web
service, database, and production secrets.
EOF
