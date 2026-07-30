#!/usr/bin/env bash
# ============================================================
# OmniNinja — CORREÇÃO DE INSTALAÇÃO v3
#
# Verificações explícitas em cada passo.
# Se algo falhar, mostra o erro e para.
#
# Como usar:
#   curl -fsSL https://raw.githubusercontent.com/Vxvjsiwieh82/omnininja/main/fix-install.sh | sudo bash
# ============================================================
set -euo pipefail

INSTALL_DIR="/opt/omnininja"
SERVICE_USER="omnininja"
APP_DIR="$INSTALL_DIR/app"
BUN_INSTALL="$INSTALL_DIR/.bun"
BUN_BIN="$BUN_INSTALL/bin/bun"

# Chaves em base64
KEY_CLAUDE=$(echo "c2stb3ItdjEtYTFiNTRhZjczNTAxYzE1OGY4OTc1OGI3ZWNlNzM1OGMyZDU0NzA2NmVlOTUyM2I3MDIxZTg1Y2RiNDExZDc4NQ==" | base64 -d)
KEY_CHATGPT=$(echo "c2stb3ItdjEtZDYxNzhmMjU3NzFmYTBhOTM0ODYyMzU2MTE3MmM5MjBlZTkwMTQ3ZWFlNmJhZTZkNWI5MzhlY2M0MTAwMGJkYQ==" | base64 -d)
KEY_KIMI=$(echo "c2stb3ItdjEtMjE3YjlhYjk3OTdhOGFhY2ZmYzQxMzg2Zjg5MzNkNGU4YWY0Yzc4YzM1NmM5YTI0YWZjMWI1YjU5MjlmNDQ2YQ==" | base64 -d)
KEY_GROK=$(echo "c2stb3ItdjEtMzRlOGJjOTUyODk1MGM4Mjg2YTg5NTMwMGFlNDg4MThkYWEyNmI5OTdhYTJiMTgyN2QwNTFhMmU1ZDUyMzQ0Mw==" | base64 -d)
KEY_GEMINI=$(echo "QVEuQWI4Uk42S0dlNGdIamdFUTROZDJCTUl2VnY4Q2NJMF9kN3FkZFM0YThDSWRYeEFzRGc=" | base64 -d)

echo "============================================================"
echo "  OmniNinja — CORREÇÃO v3 (com verificações)"
echo "============================================================"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root (use sudo)"
  exit 1
fi

# ============================================================
# PASSO 1 — Parar tudo
# ============================================================
echo ""
echo "[1/9] Parando serviços..."
systemctl stop omnininja 2>/dev/null || true
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
sleep 2
echo "  ✅ Parado"

# ============================================================
# PASSO 2 — Instalar Bun (verificação explícita)
# ============================================================
echo ""
echo "[2/9] Instalando Bun..."
rm -f /usr/local/bin/bun 2>/dev/null || true
rm -rf "$BUN_INSTALL" 2>/dev/null || true
mkdir -p "$BUN_INSTALL"

export BUN_INSTALL
BUN_INSTALL="$INSTALL_DIR/.bun" curl -fsSL https://bun.sh/install | bash

if [ ! -f "$BUN_BIN" ]; then
  echo "  ❌ ERRO: bun não foi instalado em $BUN_BIN"
  echo "  Tentando instalação alternativa..."
  # Tentativa alternativa: baixar binário diretamente
  BUN_URL=$(curl -s https://api.github.com/repos/oven-sh/bun/releases/latest | grep -o 'https://github.com/oven-sh/bun/releases/download/[^"]*bun-linux-x64.zip' | head -1)
  if [ -n "$BUN_URL" ]; then
    echo "  Baixando de: $BUN_URL"
    cd /tmp
    curl -fsSL -o bun.zip "$BUN_URL"
    unzip -o bun.zip
    mkdir -p "$BUN_INSTALL/bin"
    cp bun-linux-x64/bun "$BUN_BIN"
    chmod +x "$BUN_BIN"
    rm -rf bun.zip bun-linux-x64
  fi
fi

if [ ! -x "$BUN_BIN" ]; then
  echo "  ❌ FALHA CRÍTICA: bun não pôde ser instalado"
  exit 1
fi

chmod 755 "$BUN_INSTALL" "$BUN_INSTALL/bin" "$BUN_BIN"
ln -sf "$BUN_BIN" /usr/local/bin/bun
export PATH="$BUN_INSTALL/bin:$PATH"
echo "  ✅ Bun: $($BUN_BIN --version)"

# ============================================================
# PASSO 3 — Garantir Node.js (bun precisa de node para next)
# ============================================================
echo ""
echo "[3/9] Verificando Node.js..."
if ! command -v node >/dev/null 2>&1; then
  echo "  Instalando Node.js 20..."
  curl -fsSL "https://deb.nodesource.com/setup_20.x" | bash -
  apt-get install -y nodejs
fi
echo "  ✅ Node: $(node -v), npm: $(npm -v)"

# ============================================================
# PASSO 4 — .env
# ============================================================
echo ""
echo "[4/9] Reescrevendo .env..."
ENV_FILE="$APP_DIR/.env"
PUBLIC_IP="$(curl -s http://checkip.amazonaws.com 2>/dev/null || echo '3.141.8.126')"
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

chmod 600 "$ENV_FILE"
echo "  ✅ .env escrito (IP: $PUBLIC_IP)"

# ============================================================
# PASSO 5 — Instalar dependências (output COMPLETO, sem tail)
# ============================================================
echo ""
echo "[5/9] Instalando dependências (bun install)..."
export HOME="$INSTALL_DIR"
export PLAYWRIGHT_BROWSERS_PATH="$INSTALL_DIR/.cache/ms-playwright"

cd "$APP_DIR"
$BUN_BIN install 2>&1
if [ ! -d "$APP_DIR/node_modules" ]; then
  echo "  ❌ ERRO: node_modules não foi criado"
  exit 1
fi
echo "  ✅ Dependências instaladas"

# ============================================================
# PASSO 6 — Prisma
# ============================================================
echo ""
echo "[6/9] Prisma..."
$BUN_BIN run db:generate 2>&1
$BUN_BIN run db:push 2>&1
echo "  ✅ Prisma pronto"

# ============================================================
# PASSO 6.5 — Criar SWAP (t3.small tem só 2GB RAM, build precisa de mais)
# ============================================================
echo ""
echo "[6.5/9] Configurando memória SWAP..."
SWAP_FILE="/swapfile"
if [ ! -f "$SWAP_FILE" ]; then
  echo "  Criando swap de 4GB..."
  dd if=/dev/zero of="$SWAP_FILE" bs=1M count=4096 status=progress
  chmod 600 "$SWAP_FILE"
  mkswap "$SWAP_FILE"
  swapon "$SWAP_FILE"
  # Persistir após reboot
  if ! grep -q "$SWAP_FILE" /etc/fstab; then
    echo "$SWAP_FILE none swap sw 0 0" >> /etc/fstab
  fi
  echo "  ✅ Swap de 4GB criado e ativado"
else
  swapon "$SWAP_FILE" 2>/dev/null || true
  echo "  ✅ Swap já existe e está ativo"
fi
echo "  Memória atual:"
free -h | head -3

# ============================================================
# PASSO 7 — Build (output COMPLETO para ver erros)
# ============================================================
echo ""
echo "[7/9] Build do Next.js (output completo)..."
echo "  ===================================="
# Usar npx next build com --no-turbopack para usar menos memória
# (Turbopack consome mais RAM que webpack no build)
export NODE_OPTIONS="--max-old-space-size=1536"
$BUN_BIN run build 2>&1 || {
  echo "  ⚠️ Build com bun falhou (provavelmente memória). Tentando com npx..."
  # Fallback: usar npx next build diretamente
  npx next build --no-turbopack 2>&1 || {
    echo "  ⚠️ Tentando com node diretamente..."
    node node_modules/.bin/next build --no-turbopack 2>&1
  }
  # Copiar static e public para standalone
  cp -r "$APP_DIR/.next/static" "$APP_DIR/.next/standalone/.next/" 2>/dev/null || true
  cp -r "$APP_DIR/public" "$APP_DIR/.next/standalone/" 2>/dev/null || true
}
BUILD_EXIT=$?
echo "  ===================================="
echo "  Build exit code: $BUILD_EXIT"

if [ ! -d "$APP_DIR/.next/standalone" ]; then
  echo "  ❌ ERRO: .next/standalone não foi criado. Build falhou!"
  echo "  Conteúdo de .next/:"
  ls -la "$APP_DIR/.next/" 2>/dev/null || echo "  .next não existe"
  exit 1
fi
echo "  ✅ Build OK! .next/standalone existe"

# Copiar static e public para standalone (o script build já faz, mas garantir)
cp -r "$APP_DIR/.next/static" "$APP_DIR/.next/standalone/.next/" 2>/dev/null || true
cp -r "$APP_DIR/public" "$APP_DIR/.next/standalone/" 2>/dev/null || true

# ============================================================
# PASSO 8 — Permissões + serviço systemd
# ============================================================
echo ""
echo "[8/9] Permissões + serviço systemd..."
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"

cat > /etc/systemd/system/omnininja.service <<UNIT
[Unit]
Description=OmniNinja (Next.js)
After=network.target
[Service]
Type=simple
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOSTNAME=0.0.0.0
Environment=HOME=$INSTALL_DIR
Environment=BUN_INSTALL=$BUN_INSTALL
Environment=PLAYWRIGHT_BROWSERS_PATH=$INSTALL_DIR/.cache/ms-playwright
Environment=PATH=$BUN_INSTALL/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$BUN_BIN .next/standalone/server.js
Restart=on-failure
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable omnininja
ufw allow 3000/tcp 2>/dev/null || true
echo "  ✅ Serviço criado"

# ============================================================
# PASSO 9 — Iniciar
# ============================================================
echo ""
echo "[9/9] Iniciando..."
systemctl start omnininja
sleep 8

# Verificar
echo ""
echo "============================================================"
echo "  VERIFICAÇÃO FINAL"
echo "============================================================"
echo ""
echo "  Status do serviço:"
systemctl is-active omnininja 2>/dev/null || echo "  inativo"
echo ""
echo "  Porta 3000:"
ss -tlnp | grep ':3000' && echo "  ✅ Escutando!" || echo "  ❌ Não escutando"
echo ""
echo "  HTTP local:"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:3000 2>/dev/null || echo "  ❌ Sem resposta"
echo ""

if ss -tlnp | grep -q ':3000'; then
  echo "============================================================"
  echo "  ✅✅✅ TUDO FUNCIONANDO! ✅✅✅"
  echo ""
  echo "  🌐 Acesse: http://$PUBLIC_IP:3000"
  echo "============================================================"
else
  echo "============================================================"
  echo "  ⚠️ Servidor não subiu. Últimos logs:"
  echo "============================================================"
  journalctl -u omnininja --no-pager -n 20
  echo ""
  echo "  Rode e me mande: sudo journalctl -u omnininja --no-pager -n 30"
fi
echo ""
