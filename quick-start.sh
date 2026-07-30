#!/usr/bin/env bash
# ============================================================
# OmniNinja — INSTALAÇÃO COM 1 COMANDO no seu Ubuntu AWS
#
# Como usar (Cole isto no terminal do seu Ubuntu):
#
#   curl -fsSL https://raw.githubusercontent.com/Vxvjsiwieh82/omnininja/main/quick-start.sh | sudo bash
#
# Ou, se preferir baixar primeiro:
#
#   wget https://raw.githubusercontent.com/Vxvjsiwieh82/omnininja/main/quick-start.sh
#   sudo bash quick-start.sh
#
# O que este script faz:
#   1. Instala git, Node 20, Bun, dependências de sistema
#   2. Clona o OmniNinja do GitHub
#   3. Instala dependências + Chromium (navegador local)
#   4. Configura o .env (você edita as chaves depois)
#   5. Faz o build de produção
#   6. Cria serviços systemd (inicia automaticamente no boot)
#   7. Instala o Caddy para HTTPS
#
# Ao final, acesse: http://SEU-IP:3000
# ============================================================
set -euo pipefail

REPO_URL="https://github.com/Vxvjsiwieh82/omnininja.git"
INSTALL_DIR="/opt/omnininja"
SERVICE_USER="omnininja"
NODE_VERSION="20"

echo "============================================================"
echo "  OmniNinja — Instalador automático para Ubuntu AWS"
echo "  Repo: $REPO_URL"
echo "  Diretório: $INSTALL_DIR"
echo "============================================================"

# Verifica root
if [ "$(id -u)" -ne 0 ]; then
  echo "ERRO: rode como root (sudo bash quick-start.sh)"
  exit 1
fi

# 1) Pacotes de sistema
echo ""
echo "[1/9] Atualizando apt e instalando pacotes de sistema..."
apt-get update -y

# Tenta instalar libasound2t64 (Ubuntu 24.04), se falhar tenta libasound2 (Ubuntu 22.04)
install_libasound() {
  if apt-cache show libasound2t64 >/dev/null 2>&1; then
    echo "  Ubuntu 24.04 detectado — usando libasound2t64"
    LIBASOUND=libasound2t64
    LIBATK=libatk1.0-0t64
    LIBATKBRIDGE=libatk-bridge2.0-0t64
    LIBCUPS=libcups2t64
  else
    echo "  Ubuntu 22.04 detectado — usando libasound2"
    LIBASOUND=libasound2
    LIBATK=libatk1.0-0
    LIBATKBRIDGE=libatk-bridge2.0-0
    LIBCUPS=libcups2
  fi
}
install_libasound

apt-get install -y --no-install-recommends \
  curl wget git unzip ca-certificates gnupg build-essential python3 python3-pip \
  jq sqlite3 rsync \
  libnss3 libnspr4 "$LIBATK" "$LIBATKBRIDGE" "$LIBCUPS" libdrm2 libdbus-1-3 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 "$LIBASOUND" fonts-liberation xdg-utils

# 2) Node.js 20
echo ""
echo "[2/9] Instalando Node.js $NODE_VERSION..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_VERSION}.x" | bash -
  apt-get install -y nodejs
fi
echo "  Node: $(node -v)  npm: $(npm -v)"

# 3) Bun
echo ""
echo "[3/9] Instalando Bun..."
if ! command -v bun >/dev/null 2>&1; then
  curl -fsSL https://bun.sh/install | bash
  ln -sf "$HOME/.bun/bin/bun" /usr/local/bin/bun
fi
echo "  Bun: $(bun --version)"

# 4) Usuário de serviço + diretórios
echo ""
echo "[4/9] Criando usuário '$SERVICE_USER' e diretórios..."
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  useradd --system --create-home --shell /bin/bash "$SERVICE_USER"
fi
mkdir -p "$INSTALL_DIR" \
         "$INSTALL_DIR/data" \
         "$INSTALL_DIR/workspaces" \
         "$INSTALL_DIR/.cache/ms-playwright" \
         "$INSTALL_DIR/logs"
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR"

# 5) Clonar o código do GitHub
echo ""
echo "[5/9] Clonando OmniNinja do GitHub..."
if [ -d "$INSTALL_DIR/app/.git" ]; then
  echo "  Já existe, fazendo pull..."
  cd "$INSTALL_DIR/app"
  sudo -u "$SERVICE_USER" git pull origin main || true
else
  sudo -u "$SERVICE_USER" git clone "$REPO_URL" "$INSTALL_DIR/app"
fi
chown -R "$SERVICE_USER":"$SERVICE_USER" "$INSTALL_DIR/app"

# 6) .env
echo ""
echo "[6/9] Configurando .env..."
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
# AUTH_SECRET aleatório
SECRET="$(openssl rand -hex 32)"
if grep -q "AUTH_SECRET=" "$ENV_FILE" 2>/dev/null; then
  sed -i "s#AUTH_SECRET=.*#AUTH_SECRET=$SECRET#" "$ENV_FILE"
else
  echo "AUTH_SECRET=$SECRET" >> "$ENV_FILE"
fi
# Define URLs com o IP público detectado
PUBLIC_IP="$(curl -s http://checkip.amazonaws.com 2>/dev/null || echo 'SEU-IP')"
sed -i "s#NEXT_PUBLIC_APP_URL=.*#NEXT_PUBLIC_APP_URL=http://$PUBLIC_IP:3000#" "$ENV_FILE" 2>/dev/null || true
sed -i "s#NEXT_PUBLIC_API_URL=.*#NEXT_PUBLIC_API_URL=http://$PUBLIC_IP:3000#" "$ENV_FILE" 2>/dev/null || true
chown "$SERVICE_USER":"$SERVICE_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

# 7) Instalar dependências + Chromium + build
echo ""
echo "[7/9] Instalando dependências Node + Chromium (pode demorar 2-5 min)..."
sudo -u "$SERVICE_USER" bash -lc "
  set -e
  export HOME=$INSTALL_DIR
  export PLAYWRIGHT_BROWSERS_PATH=$INSTALL_DIR/.cache/ms-playwright
  cd $INSTALL_DIR/app
  echo '  Instalando pacotes Node...'
  bun install 2>&1 | tail -5
  echo '  Gerando banco de dados SQLite...'
  bun run db:generate 2>&1 | tail -3
  bun run db:push 2>&1 | tail -3
  echo '  Baixando Chromium (~130MB, compartilhado entre todos usuários)...'
  bunx playwright install chromium 2>&1 | tail -3
  echo '  Fazendo build de produção...'
  bun run build 2>&1 | tail -10
"

# 8) Serviços systemd
echo ""
echo "[8/9] Criando serviços systemd..."
cat > /etc/systemd/system/omnininja.service <<UNIT
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

systemctl daemon-reload
systemctl enable omnininja
systemctl start omnininja

# 9) Verificar se subiu
echo ""
echo "[9/9] Verificando se o servidor subiu..."
sleep 3
if curl -s -o /dev/null -w "" "http://localhost:3000" 2>/dev/null; then
  echo "  ✅ Servidor rodando na porta 3000!"
else
  echo "  ⚠️  Servidor ainda subindo, aguarde 10s e verifique:"
  echo "     sudo systemctl status omnininja"
  echo "     sudo journalctl -u omnininja -f"
fi

echo ""
echo "============================================================"
echo "  ✅ INSTALAÇÃO CONCLUÍDA!"
echo "============================================================"
echo ""
echo "  🌐 Acesse o site:"
echo "     http://$PUBLIC_IP:3000"
echo ""
echo "  📝 PRÓXIMO PASSO OBRIGATÓRIO — configurar suas chaves de IA:"
echo "     sudo nano $INSTALL_DIR/app/.env"
echo ""
echo "     Edite estas linhas com SUAS chaves reais:"
echo "       OPENROUTER_CLAUDE_API_KEY=sk-or-v1-SUA_CHAVE_AQUI"
echo "       OPENROUTER_CHATGPT_API_KEY=sk-or-v1-SUA_CHAVE_AQUI"
echo "       OPENROUTER_KIMI_API_KEY=sk-or-v1-SUA_CHAVE_AQUI"
echo "       OPENROUTER_GROK_API_KEY=sk-or-v1-SUA_CHAVE_AQUI"
echo "       OPENROUTER_GEMINI_API_KEY=AQ.SUA_CHAVE_GOOGLE_AQUI"
echo ""
echo "     Depois reinicie:"
echo "       sudo systemctl restart omnininja"
echo ""
echo "  🔒 HTTPS (opcional, precisa de domínio):"
echo "     Veja a seção 8 do TUTORIAL_UBUNTU.md"
echo ""
echo "  📊 Comandos úteis:"
echo "     Ver status:   sudo systemctl status omnininja"
echo "     Ver logs:     sudo journalctl -u omnininja -f"
echo "     Reiniciar:    sudo systemctl restart omnininja"
echo "     Parar:        sudo systemctl stop omnininja"
echo ""
