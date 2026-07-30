#!/bin/bash
# ============================================================
#  OmniNinja - Script de Instalação Completa para Ubuntu 24.04
# ============================================================
set -e

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[OmniNinja]${NC} $1"; }
warn() { echo -e "${YELLOW}[AVISO]${NC} $1"; }

log "=========================================="
log "  OmniNinja - Instalação Ubuntu 24.04"
log "=========================================="

# ----------------------------------------------------------
# 1. Atualizar sistema
# ----------------------------------------------------------
log "1/10 Atualizando sistema..."
sudo apt-get update -y
sudo apt-get upgrade -y

# ----------------------------------------------------------
# 2. Pacotes base (sem conflitos)
# ----------------------------------------------------------
log "2/10 Instalando ferramentas base..."
sudo apt-get install -y \
    curl wget git nano vim htop \
    build-essential gcc g++ make \
    python3 python3-pip python3-venv python3-dev \
    jq zip unzip sqlite3 \
    xvfb cron ufw fail2ban \
    ca-certificates gnupg lsb-release

# ----------------------------------------------------------
# 3. Node.js 20 via NodeSource (remove conflito com npm do Ubuntu)
# ----------------------------------------------------------
log "3/10 Instalando Node.js 20..."
sudo apt-get remove -y nodejs npm 2>/dev/null || true
sudo rm -f /etc/apt/sources.list.d/nodesource.list
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node --version
npm --version

# ----------------------------------------------------------
# 4. Docker
# ----------------------------------------------------------
log "4/10 Instalando Docker..."
sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
sudo apt-get install -y \
    ca-certificates gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg --batch --yes
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | \
sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt-get update -y
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER
log "Docker instalado."

# ----------------------------------------------------------
# 5. Nginx e Certbot
# ----------------------------------------------------------
log "5/10 Instalando Nginx e Certbot..."
sudo apt-get install -y nginx
sudo snap install --classic certbot 2>/dev/null || sudo apt-get install -y certbot
sudo ln -sf /snap/bin/certbot /usr/bin/certbot 2>/dev/null || true
log "Nginx e Certbot instalados."

# ----------------------------------------------------------
# 6. Python packages
# ----------------------------------------------------------
log "6/10 Instalando pacotes Python..."
pip3 install --break-system-packages --upgrade pip 2>/dev/null || pip3 install --upgrade pip

PYTHON_PKGS="fastapi uvicorn[standard] httpx aiohttp requests \
pydantic python-dotenv \
beautifulsoup4 lxml \
playwright \
numpy pandas matplotlib seaborn plotly \
scikit-learn scipy \
pillow \
openpyxl xlrd \
pdfplumber PyPDF2 \
python-docx \
aiofiles sse-starlette \
langchain langchain-community openai anthropic"

pip3 install --break-system-packages $PYTHON_PKGS 2>/dev/null || \
pip3 install $PYTHON_PKGS

# Playwright browser
python3 -m playwright install chromium --with-deps 2>/dev/null || warn "Playwright browser falhou, continuando..."

log "Pacotes Python instalados."

# ----------------------------------------------------------
# 7. Clonar / atualizar projeto
# ----------------------------------------------------------
log "7/10 Configurando projeto OmniNinja..."
INSTALL_DIR="/opt/omnininja"

# Copiar .env se já existe
if [ -f "$INSTALL_DIR/.env" ]; then
    cp "$INSTALL_DIR/.env" /tmp/omnininja_env_backup
    log ".env salvo como backup."
fi

cd $INSTALL_DIR
git fetch origin
git reset --hard origin/main

# Restaurar .env
if [ -f /tmp/omnininja_env_backup ]; then
    cp /tmp/omnininja_env_backup "$INSTALL_DIR/.env"
    log ".env restaurado."
fi

# ----------------------------------------------------------
# 8. Build do frontend React
# ----------------------------------------------------------
log "8/10 Buildando frontend React..."
cd $INSTALL_DIR/frontend
npm install --legacy-peer-deps
npm run build
cd $INSTALL_DIR
log "Frontend buildado."

# ----------------------------------------------------------
# 9. Nginx config
# ----------------------------------------------------------
log "9/10 Configurando Nginx..."

# Config temporaria HTTP (antes do SSL)
sudo tee /etc/nginx/sites-available/omnininja > /dev/null << 'NGINXEOF'
server {
    listen 80;
    server_name omnininja.duckdns.org;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location /api/task/stream {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_buffering    off;
        proxy_read_timeout 3600s;
        chunked_transfer_encoding on;
    }

    location /api/ {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_read_timeout 120s;
    }

    location / {
        proxy_pass         http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
    }
}
NGINXEOF

sudo ln -sf /etc/nginx/sites-available/omnininja /etc/nginx/sites-enabled/omnininja
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl enable nginx && sudo systemctl restart nginx
log "Nginx configurado (HTTP)."

# ----------------------------------------------------------
# 10. Systemd service
# ----------------------------------------------------------
log "10/10 Criando serviço systemd..."

sudo tee /etc/systemd/system/omnininja.service > /dev/null << SVCEOF
[Unit]
Description=OmniNinja AI Agent Platform
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$(which python3) -m uvicorn backend.api.server:app --host 0.0.0.0 --port 8000 --workers 2
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SVCEOF

sudo systemctl daemon-reload
sudo systemctl enable omnininja
sudo systemctl start omnininja
log "Serviço omnininja iniciado."

# ----------------------------------------------------------
# Firewall
# ----------------------------------------------------------
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 8000/tcp
sudo ufw --force enable

# ----------------------------------------------------------
# DuckDNS cron
# ----------------------------------------------------------
(crontab -l 2>/dev/null | grep -v duck.sh; echo "*/5 * * * * $HOME/duckdns/duck.sh >/dev/null 2>&1") | crontab -

# ----------------------------------------------------------
# SSL
# ----------------------------------------------------------
log "Obtendo certificado SSL..."
sudo mkdir -p /var/www/certbot
PUBLIC_IP=$(curl -s ifconfig.me)
sudo certbot --nginx \
    -d omnininja.duckdns.org \
    --non-interactive \
    --agree-tos \
    -m "admin@omnininja.duckdns.org" \
    --redirect 2>/dev/null && log "SSL configurado!" || \
    warn "SSL falhou. Acesse via HTTP por enquanto: http://$PUBLIC_IP:8000"

# ----------------------------------------------------------
# Status final
# ----------------------------------------------------------
PUBLIC_IP=$(curl -s ifconfig.me)
log "=========================================="
log "  INSTALAÇÃO CONCLUÍDA!"
log "=========================================="
echo ""
echo -e "${GREEN}Acesse:${NC} https://omnininja.duckdns.org"
echo -e "${GREEN}Ou direto:${NC} http://$PUBLIC_IP:8000"
echo ""
echo "Comandos úteis:"
echo "  sudo systemctl status omnininja"
echo "  sudo journalctl -u omnininja -f"
echo "  sudo systemctl restart omnininja"
echo ""
sudo systemctl status omnininja --no-pager -l
