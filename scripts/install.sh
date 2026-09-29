#!/usr/bin/env sh
set -e

TOKEN=""
TUNNEL=""
BIND="0.0.0.0:9600"

while [ $# -gt 0 ]; do
  case "$1" in
    --token)
      TOKEN="$2"
      shift 2
      ;;
    --tunnel)
      TUNNEL="$2"
      shift 2
      ;;
    --bind)
      BIND="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

if [ -z "$TOKEN" ]; then
  echo "Error: --token is required." >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "Error: This script must be run as root (use sudo)." >&2
  exit 1
fi

ARCH="$(uname -m)"
case "$ARCH" in
  x86_64)
    TARGET="x86_64-unknown-linux-gnu"
    ;;
  aarch64|arm64)
    TARGET="aarch64-unknown-linux-gnu"
    ;;
  *)
    echo "Error: Unsupported architecture $ARCH" >&2
    exit 1
    ;;
esac

mkdir -p /etc/kairo
chmod 700 /etc/kairo

CONFIG_FILE="/etc/kairo/agent.env"
touch "$CONFIG_FILE"
chmod 600 "$CONFIG_FILE"

cat <<EOF > "$CONFIG_FILE"
KAIRO_AUTH_TOKEN="$TOKEN"
KAIRO_BIND="$BIND"
EOF

if [ -n "$TUNNEL" ]; then
  echo "KAIRO_TUNNEL_RELAY=\"$TUNNEL\"" >> "$CONFIG_FILE"
fi

if ! command -v kairo-agent >/dev/null 2>&1; then
  RELEASE_URL="https://github.com/debaucheryparty/Kairo/releases/latest/download/kairo-agent-$TARGET.tar.gz"
  TMP_DIR="$(mktemp -d)"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$RELEASE_URL" -o "$TMP_DIR/kairo-agent.tar.gz" || true
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$TMP_DIR/kairo-agent.tar.gz" "$RELEASE_URL" || true
  fi

  if [ -f "$TMP_DIR/kairo-agent.tar.gz" ]; then
    tar -xzf "$TMP_DIR/kairo-agent.tar.gz" -C "$TMP_DIR"
    install -m 755 "$TMP_DIR/kairo-agent" /usr/local/bin/kairo-agent
  fi
  rm -rf "$TMP_DIR"
fi

if command -v systemctl >/dev/null 2>&1; then
  cat <<'EOF' > /etc/systemd/system/kairo-agent.service
[Unit]
Description=Kairo Agent Service
After=network.target

[Service]
Type=simple
EnvironmentFile=-/etc/kairo/agent.env
ExecStart=/usr/local/bin/kairo-agent --bind ${KAIRO_BIND}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable kairo-agent
  systemctl restart kairo-agent
  echo "Kairo Agent paired and service started."
else
  echo "Kairo Agent paired. Configuration saved to $CONFIG_FILE."
fi
