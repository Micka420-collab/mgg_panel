#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────
#  MGG — host firewall (nftables) for DDoS mitigation on Ubuntu.
#
#    sudo bash deploy/firewall.sh apply     # normal protection
#    sudo bash deploy/firewall.sh attack    # tightened limits (under attack)
#    sudo bash deploy/firewall.sh flush      # remove MGG rules
#
#  Layers it adds (L3/L4):
#    • drop conntrack-INVALID packets
#    • accept established/related (stateful)
#    • per-source SYN-flood rate limiting on new TCP
#    • per-source UDP rate limiting (anti-amplification / UDP floods)
#    • ICMP echo rate limiting
#    • SSH brute-force rate limiting on new connections
#  Tune the ports/rates with the env vars below.
# ─────────────────────────────────────────────────────────────────────────
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then echo "Run as root (sudo)."; exit 1; fi
if ! command -v nft >/dev/null 2>&1; then
  echo "Installing nftables…"; apt-get update -y && apt-get install -y nftables
fi

CMD="${1:-apply}"

# Ports to keep open (rate-limited where it makes sense)
SSH_PORT="${SSH_PORT:-22}"
PANEL_PORTS="${PANEL_PORTS:-80, 443}"
DAEMON_PORT="${DAEMON_PORT:-8080}"
SFTP_PORT="${SFTP_PORT:-2022}"

# Source allowlist for the CONTROL plane (daemon 8080 + SFTP 2022). These are
# root-equivalent / credentialed surfaces and should NOT be world-open. Set
# CONTROL_ALLOW to a comma/space-separated list of trusted IPs/CIDRs (e.g. the
# panel host and your admin IP) to restrict them. Empty = open (legacy).
CONTROL_ALLOW="${CONTROL_ALLOW:-}"
if [ -n "$CONTROL_ALLOW" ]; then
  ALLOW_SET="$(echo "$CONTROL_ALLOW" | tr ', ' '\n' | grep -v '^$' | paste -sd, -)"
  CONTROL_RULES="tcp dport { $DAEMON_PORT, $SFTP_PORT } ip saddr { $ALLOW_SET } accept"
else
  CONTROL_RULES="tcp dport $DAEMON_PORT accept
    tcp dport $SFTP_PORT accept"
fi

# Per-source new-connection / packet rates (normal vs attack mode)
if [ "$CMD" = "attack" ]; then
  TCP_RATE="${TCP_RATE:-15/second}"; TCP_BURST="${TCP_BURST:-30}"
  UDP_RATE="${UDP_RATE:-25/second}"; UDP_BURST="${UDP_BURST:-50}"
  echo "⚔  Applying ATTACK-MODE firewall (tightened limits)…"
else
  TCP_RATE="${TCP_RATE:-60/second}"; TCP_BURST="${TCP_BURST:-100}"
  UDP_RATE="${UDP_RATE:-90/second}"; UDP_BURST="${UDP_BURST:-150}"
fi

if [ "$CMD" = "flush" ]; then
  nft delete table inet mgg 2>/dev/null || true
  echo "✓ MGG firewall rules removed."
  exit 0
fi

nft -f - <<EOF
table inet mgg {
  chain input {
    type filter hook input priority 0; policy drop;

    # stateful baseline
    ct state established,related accept
    ct state invalid drop
    iif "lo" accept

    # ICMP (allow but rate-limit echo to blunt ping floods)
    ip protocol icmp icmp type echo-request limit rate 5/second accept
    ip protocol icmp icmp type { destination-unreachable, time-exceeded, parameter-problem } accept
    ip6 nexthdr icmpv6 icmpv6 type { nd-neighbor-solicit, nd-neighbor-advert, nd-router-advert, echo-request } limit rate 10/second accept

    # SSH — rate-limit new connections per source (brute-force/flood guard)
    tcp dport $SSH_PORT ct state new meter ssh4 { ip saddr limit rate over 6/minute burst 5 packets } drop
    tcp dport $SSH_PORT accept

    # Never accept the Caddy admin API from the host (it is internal-only).
    tcp dport 2019 drop

    # Panel (public web) — open.
    tcp dport { $PANEL_PORTS } accept

    # SFTP — per-source new-connection rate limit (credential-stuffing guard).
    tcp dport $SFTP_PORT ct state new meter sftp4 { ip saddr limit rate over 10/minute burst 8 packets } drop

    # Daemon (8080) + SFTP (2022) control surfaces — restricted to CONTROL_ALLOW
    # when set, otherwise open (legacy). Prefer setting CONTROL_ALLOW.
    $CONTROL_RULES

    # Game TCP (everything else >= 1024): per-source SYN-flood rate limit
    tcp flags & (fin|syn|rst|ack) == syn tcp dport >= 1024 \
        meter syn4 { ip saddr limit rate over $TCP_RATE burst $TCP_BURST packets } drop
    tcp dport >= 1024 ct state new accept

    # Game UDP: per-source rate limit (anti-amplification / UDP flood)
    udp dport >= 1024 meter udp4 { ip saddr limit rate over $UDP_RATE burst $UDP_BURST packets } drop
    udp dport >= 1024 accept

    # everything else falls through to the drop policy
  }
}
EOF

echo "✓ MGG firewall applied (mode: $CMD)."
echo "  TCP new-conn limit: $TCP_RATE (burst $TCP_BURST) · UDP: $UDP_RATE (burst $UDP_BURST)"
if [ -n "$CONTROL_ALLOW" ]; then
  echo "  Control plane (daemon $DAEMON_PORT + sftp $SFTP_PORT) RESTRICTED to: $CONTROL_ALLOW"
else
  echo "  ⚠ Control plane (daemon $DAEMON_PORT + sftp $SFTP_PORT) is OPEN — set CONTROL_ALLOW=<trusted IPs> to restrict it."
fi
echo "  Open: SSH $SSH_PORT, panel $PANEL_PORTS, games >=1024 (rate-limited); admin :2019 dropped."
echo "  Make persistent:  nft list table inet mgg > /etc/nftables.conf  (and enable nftables.service)"
