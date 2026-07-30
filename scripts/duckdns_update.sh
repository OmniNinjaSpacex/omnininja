#!/bin/bash
# OmniNinja - DuckDNS Auto IP Update
# Este script atualiza o IP do dominio omnininja.duckdns.org automaticamente.
# Roda a cada 5 minutos via cron.

TOKEN="SEU_TOKEN_DUCKDNS_AQUI"   # <- troque pelo seu token em duckdns.org
DOMAIN="omnininja"
LOG_FILE="$(dirname "$0")/duck.log"

echo url="https://www.duckdns.org/update?domains=${DOMAIN}&token=${TOKEN}&ip=" \
    | curl -k -s -o "$LOG_FILE" -K -

# Verificar resultado
if grep -q "OK" "$LOG_FILE"; then
    echo "[$(date)] IP atualizado com sucesso" >> "$(dirname "$0")/update_history.log"
else
    echo "[$(date)] FALHA ao atualizar IP: $(cat $LOG_FILE)" >> "$(dirname "$0")/update_history.log"
fi
