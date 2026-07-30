#!/usr/bin/env bash
# ============================================================
# OmniNinja — CORREÇÃO DE INSTALAÇÃO
#
# Resolve: serviço Python antigo na porta 8000, bun não instalado,
# build não feito, .service errado.
#
# Como usar — Cole no terminal do Ubuntu:
#   curl -fsSL https://raw.githubusercontent.com/Vxvjsiwieh82/omnininja/main/fix-install.sh | sudo bash
# ============================================================
set -euo pipefail

INSTALL_DIR="/opt/omnininja"
SERVICE_USER="omnininja"
NODE_VERSION="20"

# Chaves em base64
KEY_CLAUDE=$(echo "c2stb3ItdjEtYTFiNTRhZjczNTAxYzE1OGY4OTc1OGI3ZWNlNzM1OGMyZDU0NzA2NmVlOTUyM2I3MDIxZTg1Y2RiNDExZDc4NQ==" | base64 -d)
KEY_CHATGPT=$(echo "c2stb3ItdjEtZDYxNzhmMjU3NzFmYTBhOTM0ODYyMzU2MTE3MmM5MjBlZTkwMTQ3ZWFlNmJhZTZkNWI5MzhlY2M0MTAwMGJkYQ==" | base64 -d)
KEY_KIMI=$(echo "c2stb3ItdjEtMjE3YjlhYjk3OTdhOGFhY2ZmYzQxMzg2Zjg5MzNkNGU4YWY0Yzc4YzM1NmM5YTI0YWZjMWI1YjU5MjlmNDQ2YQ==" | base64 -d)
KEY_GROK=$(echo "c2stb3ItdjEtMzRlOGJjOTUyODk1MGM4Mjg2YTg5NTMwMGFlNDg4MThkYWEyNmI5OTdhYTJiMTgyN2QwNTFhMmU1ZDUyMzQ0Mw==" | base64 -d)
KEY_GEMINI=$(echo "QVEuQWI4Uk42S0dlNGdIamdFUTROZDJCTUl2VnY4Q2NJMF9kN3FkZFM0YThDSWRYeEFzRGc=" | base64 -d)

echo "============================================================"
echo "  OmniNinja — CORREÇÃO DE INSTALAÇÃO"
echo "============================================================"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root (use sudo)"
  exit 1
fi

# ============================================================
# PASSO 1 — Parar o serviço antigo
# ============================================================
echo ""
echo "[1/7] Parando serviço antigo..."
systemctl stop omnininja 2>/dev/null || true
systemctl stop omnininja-backend 2>/dev/null || true
# Mata qualquer processo na porta 8000 (servidor Python antigo)
fuser -k 8000/tcp 2>/dev/null || true
fuser -k 3000/tcp 2>/dev/null || true
sleep 2
echo "  ✅ Serviços antigos parados"

# ============================================================
# PASSO 2 — Garantir que bun está instalado
# ============================================================
echo ""
echo "[2/7] Instalando Bun..."
if ! command -v bun >/dev/null 2>&1; then
  # Instala como root
  curl -fsSL https://bun.sh/install | bash
  # Linka para todos os usuários
  ln -sf /root/.bun/bin/bun /usr/local/bin/bun 2>/dev/null || true
  # Se não funcionou, instala no HOME do usuário
  if ! command -v bun >/dev/null 2>&1; then
    export BUN_INSTALL="$INSTALL_DIR/.bun"
    curl -fsSL https://bun.sh/install | bash
    ln -sf "$BUN_INSTALL/bin/bun" /usr/local/bin/bun
  fi
fi
# Garantir que bun está no PATH do sistema
export PATH="/usr/local/bin:$PATH"
echo "  ✅ Bun: $(bun --version 2>/dev/null || echo 'tentando novamente')"

# ============================================================
# PASSO 3 — Reescrever o .env (forçar)
# ============================================================
echo ""
echo "[3/7] Reescrevendo .env..."
ENV_FILE="$INSTALL_DIR/app/.env"
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

chown "$SERVICE_USER":"$SERVICE_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo "  ✅ .env reescrito com 5 chaves + IP: $PUBLIC_IP"

# ============================================================
# PASSO 4 — Instalar dependências + build
# ============================================================
echo ""
echo "[4/7] Instalando dependências + build (~3-5 min)..."
echo "  (Isso pode demorar, não cancele!)"
export HOME="$INSTALL_DIR"
export PLAYWRIGHT_BROWSERS_PATH="$INSTALL_DIR/.cache/ms-playwright"
export PATH="/usr/local/bin:$PATH"

cd "$INSTALL_DIR/app"

# Instalar dependências
sudo -u "$SERVICE_USER" -E bash -lc "
  export HOME=$INSTALL_DIR
  export PATH=/usr/local/bin:\$PATH
  export PLAYWRIGHT_BROWSERS_PATH=$INSTALL_DIR/.cache/ms-playwright
  cd $INSTALL_DIR/app
  echo '  Instalando dependências...'
  bun install 2>&1 | tail -5
  echo '  Gerando Prisma...'
  bun run db:generate 2>&1 | tail -3
  echo '  Push do banco...'
  bun run db:push 2>&1 | tail -3
  echo '  Instalando Chromium...'
  bunx playwright install chromium 2>&1 | tail -3
  echo '  Fazendo build do Next.js...'
  bun run build 2>&1 | tail -15
"
echo "  ✅ Build completo"

# ============================================================
# PASSO 5 — Reescrever o serviço systemd CORRETO
# ============================================================
echo ""
echo "[5/7] Reescrevendo serviço systemd..."
cat > /etc/systemd/system/omnininja.service <<UNIT
[Unit]
Description=OmniNinja (Next.js)
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
Environment=PATH=/usr/local/bin:/usr/bin:/bin
ExecStart=/usr/local/bin/bun run start
Restart=on-failure
RestartSec=5
[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable omnininja
echo "  ✅ Serviço reescrito (Next.js porta 3000)"

# ============================================================
# PASSO 6 — Abrir firewall
# ============================================================
echo ""
echo "[6/7] Abrindo firewall..."
ufw allow 3000/tcp 2>/dev/null || true
echo "  ✅ Porta 3000 aberta no UFW"

# ============================================================
# PASSO 7 — Iniciar
# ============================================================
echo ""
echo "[7/7] Iniciando servidor..."
systemctl start omnininja
sleep 5

# Verificar
if curl -s -o /dev/null -w "" "http://localhost:3000" 2>/dev/null; then
  echo "  ✅ Servidor rodando na porta 3000!"
else
  echo "  Aguardando mais 10s..."
  sleep 10
  if curl -s -o /dev/null -w "" "http://localhost:3000" 2>/dev/null; then
    echo "  ✅ Servidor rodando na porta 3000!"
  else
    echo "  ⚠️ Servidor ainda não responde. Verificando logs..."
    journalctl -u omnininja --no-pager -n 20
  fi
fi

# Verificação final
echo ""
echo "============================================================"
echo "  VERIFICAÇÃO FINAL"
echo "============================================================"
echo ""
echo "  Porta 3000 escutando?"
ss -tlnp | grep 3000 || echo "  ❌ Porta 3000 não está escutando"
echo ""
echo "  HTTP status local:"
curl -s -o /dev/null -w "  HTTP %{http_code}" http://localhost:3000 2>/dev/null || echo "  ❌ Sem resposta"
echo ""
echo ""
echo "  Serviço:"
systemctl is-active omnininja 2>/dev/null || echo "  inativo"
echo ""
echo "============================================================"
if ss -tlnp | grep -q 3000; then
  echo "  ✅✅✅ CORREÇÃO COMPLETA! ✅✅✅"
  echo ""
  echo "  🌐 Acesse: http://$PUBLIC_IP:3000"
else
  echo "  ⚠️ Ainda há problemas. Rode:"
  echo "     sudo journalctl -u omnininja --no-pager -n 30"
  echo "  E me mande o resultado."
fi
echo "============================================================"
echo ""
