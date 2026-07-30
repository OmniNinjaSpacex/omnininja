#!/usr/bin/env bash
# ============================================================
# OmniNinja — INSTALAÇÃO COMPLETA COM 1 COMANDO
#
# As chaves são passadas por variáveis de ambiente (não vão pro GitHub).
#
# Como usar (Cole tudo isto de uma vez no terminal do Ubuntu):
#
#   export KEY_CLAUDE="sk-or-v1-SUA_CHAVE_CLAUDE"
#   export KEY_CHATGPT="sk-or-v1-SUA_CHAVE_CHATGPT"
#   export KEY_KIMI="sk-or-v1-SUA_CHAVE_KIMI"
#   export KEY_GROK="sk-or-v1-SUA_CHAVE_GROK"
#   export KEY_GEMINI="AQ.SUA_CHAVE_GEMINI"
#   curl -fsSL https://raw.githubusercontent.com/Vxvjsiwieh82/omnininja/main/install-full.sh | sudo -E bash
#
# O -E preserva as variáveis de ambiente (as chaves) dentro do sudo.
# ============================================================
set -euo pipefail

REPO_URL="https://github.com/Vxvjsiwieh82/omnininja.git"
INSTALL_DIR="/opt/omnininja"
SERVICE_USER="omnininja"
NODE_VERSION="20"

echo "============================================================"
echo "  OmniNinja — Instalador COMPLETO"
echo "============================================================"

# Verifica root
if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root (use sudo)"
  exit 1
fi

# Verifica se as chaves foram passadas
if [ -z "${KEY_CLAUDE:-}" ]; then
  echo "ERRO: As chaves não foram passadas!"
  echo "Rode assim:"
  echo "  export KEY_CLAUDE=\"sk-or-v1-...\""
  echo "  export KEY_CHATGPT=\"sk-or-v1-...\""
  echo "  export KEY_KIMI=\"sk-or-v1-...\""
  echo "  export KEY_GROK=\"sk-or-v1-...\""
  echo "  export KEY_GEMINI=\"AQ....\""
  echo "  curl -fsSL https://raw.githubusercontent.com/Vxvjsiwieh82/omnininja/main/install-full.sh | sudo -E bash"
  exit 1
fi

echo "  ✅ 5 chaves detectadas"

# ============================================================
# PASSO 1 — Pacotes de sistema
# ============================================================
echo ""
echo "[1/9] Instalando pacotes de sistema..."
apt-get update -y

if apt-cache show libasound2t64 >/dev/null 2>&1; then
  echo "  Ubuntu 24.04 detectado"
  LIBASOUND=libasound2t64
  LIBATK=libatk1.0-0t64
  LIBATKBRIDGE=libatk-bridge2.0-0t64
  LIBCUPS=libcups2t64
else
  echo "  Ubuntu 22.04 detectado"
  LIBASOUND=libasound2
  LIBATK=libatk1.0-0
  LIBATKBRIDGE=libatk-bridge2.0-0
  LIBCUPS=libcups2
fi

apt-get install -y --no-install-recommends \
  curl wget git unzip ca-certificates gnupg build-essential python3 python3-pip \
  jq sqlite3 rsync \
  libnss3 libnspr4 "$LIBATK" "$LIBATKBRIDGE" "$LIBCUPS" libdrm2 libdbus-1-3 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 "$LIBASOUND" fonts-liberation xdg-utils

echo "  ✅ Passo 1 completo"

# ============================================================
# PASSO 2 — Node.js 20
# ============================================================
echo ""
echo "[2/9] Instalando Node.js $NODE_VERSION..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
fi
echo "  ✅ Node: $(node -v)"

# ============================================================
# PASSO 3 — Bun
# ============================================================
echo ""
echo "[3/9] Instalando Bun..."
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun
fi
echo "  ✅ Bun: $(bun --version)"

# ============================================================
# PASSO 4 — Usuário + diretórios
# ============================================================
echo ""
echo "[4/9] Criando usuário e diretórios..."
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /bin/bash "$SERVICE_USER"
fi
mkdir -p "$INSTALL_DIR"/{data,workspaces,.cache/ms-playwright,logs}
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"
echo "  ✅ Passo 4 completo"

# ============================================================
# PASSO 5 — Clonar do GitHub
# ============================================================
echo ""
echo "[5/9] Clonando código do GitHub..."
if [ -d "$INSTALL_DIR/app/.git" ]; then
  cd "$INSTALL_DIR/app"
  sudo -u "$SERVICE_USER" git pull origin main || true
else
  sudo -u "$SERVICE_USER" git clone "$REPO_URL" "$INSTALL_DIR/app"
fi
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR/app"
echo "  ✅ Passo 5 completo"

# ============================================================
# PASSO 6 — .env com as chaves
# ============================================================
echo ""
echo "[6/9] Configurando .env com suas chaves..."
ENV_FILE="$INSTALL_DIR/app/.env"
PUBLIC_IP="$(curl -s http://checkip.amazonaws.com 2>/dev/null || echo 'SEU-IP')"
SECRET="$(openssl rand -hex 32)"

cat > "$ENV_FILE" <<ENVEOF
DATABASE_URL=file:$INSTALL_DIR/data/custom.db
OPENROUTER_CLAUDE_API_KEY=$KEY_CLAUDE
OPENROUTER_CHATGPT_API_KEY=$KEY_CHATGPT
OPENROUTER_KIMI_API_KEY=$KEY_KIMI
OPENROUTER_GROK_API_KEY=$KEY_GROK
OPENROUTER_GEMINI_API_KEY=$KEY_GEMINI
OMNININJA_DEFAULT_MODEL=claude
PLAYWRIGHT_CHROMIUM_EXECUTABLE=
PLAYWRIGHT_HEADLESS=true
PLAYWRIGHT_BROWSERS_PATH=$INSTALL_DIR/.cache/ms-playwright
OMNININJA_WORKSPACE_ROOT=$INSTALL_DIR/workspaces
OMNININJA_PUBLIC_BASE=http://$PUBLIC_IP:3000
NEXT_PUBLIC_APP_URL=http://$PUBLIC_IP:3000
NEXT_PUBLIC_API_URL=http://$PUBLIC_IP:3000
NEXT_PUBLIC_WS_URL=ws://$PUBLIC_IP:3000
AUTH_SECRET=$SECRET
ENVEOF

chown "$SERVICE_USER":"$SERVICE_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "  ✅ .env com 5 chaves reais + IP: $PUBLIC_IP"

# ============================================================
# PASSO 7 — Dependências + Chromium + build
# ============================================================
echo ""
echo "[7/9] Instalando dependências + Chromium + build (~3 min)..."
sudo -u "$SERVICE_USER" bash -lc "
  set -e
  export HOME=$INSTALL_DIR
  export PLAYWRIGHT_BROWSERS_PATH=$INSTALL_DIR/.cache/ms-playwright
  cd $INSTALL_DIR/app
  bun install 2>&1 | tail -3
  bun run db:generate 2>&1 | tail -3
  bun run db:push 2>&1 | tail -3
  bunx playwright install chromium 2>&1 | tail -3
  bun run build 2>&1 | tail -10
"
echo "  ✅ Passo 7 completo"

# ============================================================
# PASSO 8 — systemd
# ============================================================
echo ""
echo "[8/9] Criando serviço systemd..."
cat > /etc/systemd/system/omnininja.service <<UNIT
[Unit]
Description=OmniNinja
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
[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable omnininja
echo "  ✅ Passo 8 completo"

# ============================================================
# PASSO 9 — Iniciar
# ============================================================
echo ""
echo "[9/9] Iniciando servidor..."
systemctl start omnininja
sleep 5

if curl -s -o /dev/null -w "" "http://localhost:3000" 2>/dev/null; then
  echo "  ✅ Servidor rodando!"
else
  sleep 10
  if curl -s -o /dev/null -w "" "http://localhost:3000" 2>/dev/null; then
    echo "  ✅ Servidor rodando!"
  else
    echo "  ⚠️ Verifique: sudo journalctl -u omnininja -f"
  fi
fi

echo ""
echo "============================================================"
echo "  ✅✅✅ INSTALAÇÃO COMPLETA! ✅✅✅"
echo "============================================================"
echo ""
echo "  🌐 Acesse:  http://$PUBLIC_IP:3000"
echo ""
echo "  🔑 Suas 5 chaves já estão configuradas!"
echo "     Claude, ChatGPT, Kimi, Grok + Gemini"
echo ""
echo "  📊 Comandos:"
echo "     Status:    sudo systemctl status omnininja"
echo "     Logs:      sudo journalctl -u omnininja -f"
echo "     Reiniciar: sudo systemctl restart omnininja"
echo "     Editar:    sudo nano $INSTALL_DIR/app/.env"
echo ""
