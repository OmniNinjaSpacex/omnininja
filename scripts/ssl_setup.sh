#!/bin/bash
# OmniNinja - Configurar SSL com Let's Encrypt para DuckDNS
set -e

DOMAIN="omnininja.duckdns.org"
EMAIL="seu@email.com"   # <- troque pelo seu email

echo "[SSL] Parando nginx temporariamente..."
sudo systemctl stop nginx 2>/dev/null || true

echo "[SSL] Obtendo certificado SSL para $DOMAIN..."
sudo certbot certonly \
    --standalone \
    --non-interactive \
    --agree-tos \
    --email "$EMAIL" \
    -d "$DOMAIN"

echo "[SSL] Certificado obtido. Reiniciando nginx..."
sudo systemctl start nginx

echo "[SSL] Configurando renovacao automatica..."
(crontab -l 2>/dev/null; echo "0 3 * * * certbot renew --quiet --pre-hook 'systemctl stop nginx' --post-hook 'systemctl start nginx'") | crontab -

echo "[SSL] Concluido! Acesse: https://$DOMAIN"
