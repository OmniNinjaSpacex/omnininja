#!/usr/bin/env bash
# ============================================================
# OmniNinja — Instalador para Ubuntu (AWS) compartilhado
# Roda uma vez numa instância Ubuntu 22.04/24.04 limpa.
# Instala: bun, Node, dependências de sistema, Chromium, OmniNinja.
# Uso:  sudo bash install.sh
# ============================================================
set -euo pipefail

# ---- Configurações (edite se quiser) ----
INSTALL_DIR="${OMNININJA_INSTALL_DIR:-/opt/omnininja}"
SERVICE_USER="${OMNININJA_USER:-omnininja}"
NODE_VERSION="20"

echo "============================================================"
echo "  OmniNinja — Instalador para Ubuntu"
echo "  Diretório: $INSTALL_DIR"
echo "  Usuário do serviço: $SERVICE_USER"
echo "============================================================"

# Verifica root
if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root (sudo bash install.sh)"
  exit 1
fi

# 1) Pacotes de sistema
echo "[1/8] Atualizando apt e instalando pacotes de sistema..."
apt-get update -y
apt-get install -y --no-install-recommends \
  curl wget git unzip ca-certificates gnupg build-essential python3 python3-pip \
  jq sqlite3 \
  libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libdbus-1-3 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2 fonts-liberation xdg-utils

# 2) Node.js 20 (via NodeSource)
echo "[2/8] Instalando Node.js $NODE_VERSION..."
if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q "v$NODE_VERSION"; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
fi
echo "  Node: $(node -v)  npm: $(npm -v)"

# 3) Bun
echo "[3/8] Instalando Bun..."
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun
fi
echo "  Bun: $(bun --version)"

# 4) Usuário de serviço + diretórios
echo "[4/8] Criando usuário '$SERVICE_USER' e diretórios..."
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /bin/bash "$SERVICE_USER"
fi
mkdir -p "$INSTALL_DIR" \
         "$INSTALL_DIR/data" \
         "$INSTALL_DIR/workspaces" \
         "$INSTALL_DIR/.cache/ms-playwright" \
         "$INSTALL_DIR/logs"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"

# 5) Copiar o código do projeto
# O instalador espera que o projeto esteja no mesmo diretório que este script.
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "[5/8] Copiando código de $SCRIPT_DIR para $INSTALL_DIR/app..."
if [ -f "$SCRIPT_DIR/package.json" ]; then
  rsync -a --delete --exclude node_modules --exclude .next \
        --exclude .git --exclude workspaces --exclude db \
        "$SCRIPT_DIR/" "$INSTALL_DIR/app/"
elif [ -d "$SCRIPT_DIR/app" ]; then
  rsync -a --delete --exclude node_modules --exclude .next \
        --exclude .git --exclude workspaces --exclude db \
        "$SCRIPT_DIR/app/" "$INSTALL_DIR/app/"
else
  echo "AVISO: não encontrei package.json nem pasta app/ ao lado do install.sh."
  echo "       Coloque o código do OmniNinja no diretório $INSTALL_DIR/app manualmente."
  exit 1
fi
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR/app"

# 6) .env (se não existir, copia do exemplo)
echo "[6/8] Configurando .env..."
ENV_FILE="$INSTALL_DIR/app/.env"
if [ ! -f "$ENV_FILE" ]; then
  if [ -f "$INSTALL_DIR/app/.env.example" ]; then
    cp "$INSTALL_DIR/app/.env.example" "$ENV_FILE"
  fi
fi
# Garante caminhos absolutos do Ubuntu no .env
sed -i "s#file:.*#file:$INSTALL_DIR/data/custom.db#" "$ENV_FILE" 2>/dev/null || true
sed -i "s#OMNININJA_WORKSPACE_ROOT=.*#OMNININJA_WORKSPACE_ROOT=$INSTALL_DIR/workspaces#" "$ENV_FILE" 2>/dev/null || true
sed -i "s#PLAYWRIGHT_BROWSERS_PATH=.*#PLAYWRIGHT_BROWSERS_PATH=$INSTALL_DIR/.cache/ms-playwright#" "$ENV_FILE" 2>/dev/null || true
# AUTH_SECRET aleatório se ainda for o placeholder
if grep -q "troque-por-uma-string-aleatoria-longa" "$ENV_FILE"; then
  SECRET="$(openssl rand -hex 32)"
  sed -i "s/troque-por-uma-string-aleatoria-longa/$SECRET/" "$ENV_FILE"
fi
chown "$SERVICE_USER":"$SERVICE_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

# 7) Instalar dependências do projeto + Chromium
echo "[7/8] Instalando dependências Node + Chromium (pode demorar)..."
sudo -u "$SERVICE_USER" bash -lc "
  set -e
  export HOME=$INSTALL_DIR
  export PLAYWRIGHT_BROWSERS_PATH=$INSTALL_DIR/.cache/ms-playwright
  cd $INSTALL_DIR/app
  bun install
  bun run db:generate
  bun run db:push
  bunx playwright install chromium
  bun run build
"

# 8) Serviço systemd
echo "[8/8] Instalando serviço systemd..."
CAT > /etc/systemd/system/omnininja.service <<UNIT
[Unit]
Description=OmniNinja — Agente de IA autônomo (estilo Manus)
After=network.target

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR/app
EnvironmentFile=$INSTALL_DIR/app/.env
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
Environment=HOME=$INSTALL_DIR
Environment=PLAYWRIGHT_BROWSERS_PATH=$INSTALL_DIR/.cache/ms-playwright
ExecStart=/usr/local/bin/bun run start
Restart=on-failure
RestartSec=5
StandardOutput=append:$INSTALL_DIR/logs/omnininja.log
StandardError=append:$INSTALL_DIR/logs/omnininja.err

[Install]
WantedBy=multi-user.target
UNIT

# Serviço do event-stream (WebSocket gateway na porta 3003)
cat > /etc/systemd/system/omnininja-event-stream.service <<UNIT2
[Unit]
Description=OmniNinja — Event Stream (Socket.io gateway)
After=network.target omnininja.service

[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$INSTALL_DIR/app/mini-services/event-stream
Environment=HOME=$INSTALL_DIR
ExecStart=/usr/local/bin/bun run dev
Restart=on-failure
RestartSec=5
StandardOutput=append:$INSTALL_DIR/logs/event-stream.log
StandardError=append:$INSTALL_DIR/logs/event-stream.err

[Install]
WantedBy=multi-user.target
UNIT2

systemctl daemon-reload
systemctl enable omnininja omnininja-event-stream

echo ""
echo "============================================================"
echo "  ✅ Instalação concluída!"
echo "============================================================"
echo ""
echo "Próximos passos:"
echo "  1. Edite o .env e ajuste SEU-DOMINIO.com e as chaves OpenRouter:"
echo "       sudo -u $SERVICE_USER nano $INSTALL_DIR/app/.env"
echo "  2. (Opcional) Instale o Caddy para HTTPS — veja TUTORIAL_UBUNTU.md"
echo "  3. Inicie os serviços:"
echo "       sudo systemctl start omnininja omnininja-event-stream"
echo "       sudo systemctl status omnininja"
echo "  4. Acesse: http://SEU-IP:3000"
echo ""
echo "Logs:  sudo journalctl -u omnininja -f"
echo "       sudo tail -f $INSTALL_DIR/logs/omnininja.log"
echo ""
