#!/usr/bin/env bash
# ============================================================
# OmniNinja — CORREÇÃO DE INSTALAÇÃO v2
#
# Resolve: bun inacessível, build não feito, permissões erradas.
# Instala bun em /opt/omnininja/.bun (acessível a todos).
# Faz build como root e dá permissão depois.
#
# Como usar:
#   curl -fsSL https://raw.githubusercontent.com/Vxvjsiwieh82/omnininja/main/fix-install.sh | sudo bash
# ============================================================
set -euo pipefail

INSTALL_DIR="/opt/omnininja"
SERVICE_USER="omnininja"
APP_DIR="$INSTALL_DIR/app"

# Chaves em base64
KEY_CLAUDE=$(echo "c2stb3ItdjEtYTFiNTRhZjczNTAxYzE1OGY4OTc1OGI3ZWNlNzM1OGMyZDU0NzA2NmVlOTUyM2I3MDIxZTg1Y2RiNDExZDc4NQ==" | base64 -d)
KEY_CHATGPT=$(echo "c2stb3ItdjEtZDYxNzhmMjU3NzFmYTBhOTM0ODYyMzU2MTE3MmM5MjBlZTkwMTQ3ZWFlNmJhZTZkNWI5MzhlY2M0MTAwMGJkYQ==" | base64 -d)
KEY_KIMI=$(echo "c2stb3ItdjEtMjE3YjlhYjk3OTdhOGFhY2ZmYzQxMzg2Zjg5MzNkNGU4YWY0Yzc4YzM1NmM5YTI0YWZjMWI1YjU5MjlmNDQ2YQ==" | base64 -d)
KEY_GROK=$(echo "c2stb3ItdjEtMzRlOGJjOTUyODk1MGM4Mjg2YTg5NTMwMGFlNDg4MThkYWEyNmI5OTdhYTJiMTgyN2QwNTFhMmU1ZDUyMzQ0Mw==" | base64 -d)
KEY_GEMINI=$(echo "QVEuQWI4Uk42S0dlNGdIamdFUTROZDJCTUl2VnY4Q2NJMF9kN3FkZFM0YThDSWRYeEFzRGc=" | base64 -d)

echo "============================================================"
echo "  OmniNinja — CORREÇÃO DE INSTALAÇÃO v2"
echo "============================================================"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root (use sudo)"
  exit 1
fi

# ============================================================
# PASSO 1 — Parar serviço antigo + limpar
# ============================================================
echo ""
echo "[1/8] Parando serviços antigos..."
systemctl stop omnininja 2>/dev/null || true
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
sleep 2
echo "  ✅ Parado"

# ============================================================
# PASSO 2 — Instalar Bun em local acessível a TODOS
# ============================================================
echo ""
echo "[2/8] Instalando Bun em /opt/omnininja/.bun..."
BUN_INSTALL="$INSTALL_DIR/.bun"
export BUN_INSTALL
mkdir -p "$BUN_INSTALL"
# Remove instalação antiga que pode estar quebrada
rm -f /usr/local/bin/bun 2>/dev/null || true

curl -fsSL https://bun.sh/install | bash
# O instalador do bun cria $BUN_INSTALL/bin/bun
BUN_BIN="$BUN_INSTALL/bin/bun"
if [ -f "$BUN_BIN" ]; then
  chmod +x "$BUN_BIN"
  ln -sf "$BUN_BIN" /usr/local/bin/bun
  # Dar permissão para todos lerem e executarem
  chmod 755 "$BUN_INSTALL"
  chmod 755 "$BUN_INSTALL/bin"
  chmod 755 "$BUN_BIN"
fi

# Verificar
if [ -x "$BUN_BIN" ]; then
  echo "  ✅ Bun instalado: $("$BUN_BIN" --version)"
else
  echo "  ❌ Falha ao instalar bun"
  ls -la "$BUN_INSTALL/bin/" 2>/dev/null || true
  exit 1
fi

# ============================================================
# PASSO 3 — Reescrever .env
# ============================================================
echo ""
echo "[3/8] Reescrevendo .env..."
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
chown "$SERVICE_USER":"$SERVICE_USER" "$ENV_FILE"
echo "  ✅ .env com 5 chaves + IP: $PUBLIC_IP"

# ============================================================
# PASSO 4 — Instalar dependências (como ROOT, sem sudo -u)
# ============================================================
echo ""
echo "[4/8] Instalando dependências..."
export HOME="$INSTALL_DIR"
export BUN_INSTALL="$INSTALL_DIR/.bun"
export PATH="$BUN_INSTALL/bin:/usr/local/bin:/usr/bin:/bin"
export PLAYWRIGHT_BROWSERS_PATH="$INSTALL_DIR/.cache/ms-playwright"

cd "$APP_DIR"
echo "  Rodando: bun install..."
bun install 2>&1 | tail -5
echo "  ✅ Dependências instaladas"

# ============================================================
# PASSO 5 — Prisma + Chromium
# ============================================================
echo ""
echo "[5/8] Prisma + Chromium..."
echo "  Gerando Prisma..."
bun run db:generate 2>&1 | tail -3
echo "  Push do banco..."
bun run db:push 2>&1 | tail -3
echo "  Instalando Chromium..."
bunx playwright install chromium 2>&1 | tail -3
echo "  ✅ Prisma + Chromium pronto"

# ============================================================
# PASSO 6 — Build do Next.js
# ============================================================
echo ""
echo "[6/8] Build do Next.js (~2-3 min)..."
bun run build 2>&1 | tail -15

# Verificar se o build foi feito
if [ -d "$APP_DIR/.next/standalone" ]; then
  echo "  ✅ Build completo! .next/standalone existe"
else
  echo "  ⚠️ Build pode ter falhado. Verificando..."
  ls -la "$APP_DIR/.next/" 2>/dev/null | head -10
fi

# Dar permissão ao usuário omnininja
chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR/.cache"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR/data"

# ============================================================
# PASSO 7 — Reescrever serviço systemd
# ============================================================
echo ""
echo "[7/8] Reescrevendo serviço systemd..."
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
Environment=BUN_INSTALL=$INSTALL_DIR/.bun
Environment=PLAYWRIGHT_BROWSERS_PATH=$INSTALL_DIR/.cache/ms-playwright
Environment=PATH=$INSTALL_DIR/.bun/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$INSTALL_DIR/.bun/bin/bun run start
Restart=on-failure
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable omnininja
echo "  ✅ Serviço reescrito"

# ============================================================
# PASSO 8 — Iniciar e verificar
# ============================================================
echo ""
echo "[8/8] Iniciando servidor..."
ufw allow 3000/tcp 2>/dev/null || true

systemctl start omnininja
sleep 5

# Verificar
if curl -s -o /dev/null -w "" "http://localhost:3000" 2>/dev/null; then
  echo "  ✅ Servidor rodando na porta 3000!"
else
  echo "  Aguardando mais 10s..."
  sleep 10
fi

# Verificação final
echo ""
echo "============================================================"
echo "  VERIFICAÇÃO FINAL"
echo "============================================================"
echo ""
echo "  Porta 3000:"
ss -tlnp | grep 3000 && echo "  ✅ Escutando!" || echo "  ❌ Não escutando"
echo ""
echo "  HTTP local:"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:3000 2>/dev/null || echo "  ❌ Sem resposta"
echo ""
echo "  Serviço:"
systemctl is-active omnininja 2>/dev/null
echo ""
echo "============================================================"
if ss -tlnp | grep -q 3000; then
  echo "  ✅✅✅ TUDO FUNCIONANDO! ✅✅✅"
  echo ""
  echo "  🌐 Acesse: http://$PUBLIC_IP:3000"
  echo ""
  echo "  📊 Comandos:"
  echo "     Status:    sudo systemctl status omnininja"
  echo "     Logs:      sudo journalctl -u omnininja -f"
  echo "     Reiniciar: sudo systemctl restart omnininja"
else
  echo "  ⚠️ Ainda há problemas."
  echo "  Rode: sudo journalctl -u omnininja --no-pager -n 30"
  echo "  E mande o resultado."
fi
echo "============================================================"
echo ""
