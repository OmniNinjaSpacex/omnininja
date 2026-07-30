#!/usr/bin/env bash
# ============================================================
# OmniNinja — Diagnóstico do Sistema
# Verifica se todos os componentes estão funcionando no Ubuntu.
#
# Uso:  sudo bash scripts/diagnose.sh
# ============================================================
set -uo pipefail

echo "============================================================"
echo "  OmniNinja — Diagnóstico do Sistema"
echo "  $(date)"
echo "============================================================"
echo ""

# 1. Serviço
echo "[1] Serviço systemd..."
if systemctl is-active --quiet omnininja 2>/dev/null; then
  echo "  ✅ omnininja está rodando"
  PORT=$(systemctl show omnininja -p Environment | grep -oP 'PORT=\K\d+' || echo 3000)
  if curl -s -o /dev/null -w "%{http_code}" "http://localhost:$PORT" 2>/dev/null | grep -q '200\|3'; then
    echo "  ✅ HTTP respondendo na porta $PORT"
  else
    echo "  ⚠️ Serviço ativo mas HTTP não responde na porta $PORT"
  fi
else
  echo "  ❌ omnininja NÃO está rodando"
  echo "     Inicie com: sudo systemctl start omnininja"
fi
echo ""

# 2. Node/Bun
echo "[2] Runtimes..."
echo "  Node: $(node -v 2>/dev/null || echo 'NÃO INSTALADO')"
echo "  Bun:  $(bun --version 2>/dev/null || echo 'NÃO INSTALADO')"
echo "  NPM:  $(npm -v 2>/dev/null || echo 'NÃO INSTALADO')"
echo ""

# 3. Banco de dados
echo "[3] Banco de dados (Prisma/SQLite)..."
DB_FILE="/opt/omnininja/data/custom.db"
if [ -f "$DB_FILE" ]; then
  SIZE=$(du -h "$DB_FILE" | cut -f1)
  TABLES=$(sqlite3 "$DB_FILE" ".tables" 2>/dev/null | tr ' ' '\n' | grep -c . || echo 0)
  echo "  ✅ DB existe: $DB_FILE ($SIZE, $TABLES tabelas)"
else
  echo "  ⚠️ DB não encontrado em $DB_FILE"
  echo "     Rode: cd /opt/omnininja/app && bun run db:push"
fi
echo ""

# 4. Sandbox VM
echo "[4] Sandbox VM (estilo Manus)..."
WORKSPACE_ROOT="${OMNININJA_WORKSPACE_ROOT:-/opt/omnininja/workspaces}"
SANDBOX_IMAGE="${OMNININJA_SANDBOX_IMAGE:-/opt/omnininja/sandbox-base}"

echo "  Workspaces: $WORKSPACE_ROOT ($(ls -d $WORKSPACE_ROOT/*/ 2>/dev/null | wc -l) tasks)"
echo "  Imagem base: $SANDBOX_IMAGE"

# Testa unshare
if command -v unshare >/dev/null 2>&1; then
  if unshare --user --map-root-user true >/dev/null 2>&1; then
    echo "  ✅ unshare --user: FUNCIONA (Nível 2 possível)"
  else
    echo "  ⚠️ unshare --user: não funciona"
    MAX_NS=$(cat /proc/sys/user/max_user_namespaces 2>/dev/null || echo "?")
    echo "     max_user_namespaces = $MAX_NS (precisa >= 1000)"
  fi
else
  echo "  ❌ unshare não instalado"
fi

# Testa proot
if command -v proot >/dev/null 2>&1; then
  echo "  ✅ proot: instalado"
else
  echo "  ⚠️ proot não instalado (instale com: apt install proot)"
fi

# Imagem base
if [ -x "$SANDBOX_IMAGE/bin/bash" ]; then
  echo "  ✅ Imagem base chroot: existe e tem bash"
  PYV=$(chroot "$SANDBOX_IMAGE" python3 --version 2>/dev/null || echo "erro")
  echo "     Python no sandbox: $PYV"
else
  echo "  ℹ️ Imagem base chroot não criada (Nível 1 indisponível, usa Nível 0/2)"
  echo "     Para criar: sudo bash /opt/omnininja/app/scripts/setup-sandbox.sh"
fi
echo ""

# 5. Browser (Chromium/Playwright)
echo "[5] Browser (Chromium/Playwright)..."
PW_PATH="${PLAYWRIGHT_BROWSERS_PATH:-/opt/omnininja/.cache/ms-playwright}"
CHROMIUM=$(find "$PW_PATH" -name 'chrome' -type f 2>/dev/null | head -1)
if [ -n "$CHROMIUM" ]; then
  echo "  ✅ Chromium encontrado: $CHROMIUM"
  if "$CHROMIUM" --version 2>/dev/null; then
    echo "  ✅ Chromium executa"
  else
    echo "  ⚠️ Chromium não executa (pode faltar libs)"
  fi
else
  echo "  ⚠️ Chromium não encontrado em $PW_PATH"
  echo "     Instale: cd /opt/omnininja/app && bunx playwright install chromium"
fi
echo ""

# 6. Chaves API
echo "[6] Chaves API (.env)..."
ENV_FILE="/opt/omnininja/app/.env"
if [ -f "$ENV_FILE" ]; then
  for KEY in OPENROUTER_CLAUDE_API_KEY OPENROUTER_CHATGPT_API_KEY OPENROUTER_KIMI_API_KEY OPENROUTER_GROK_API_KEY OPENROUTER_GEMINI_API_KEY; do
    VAL=$(grep "^$KEY=" "$ENV_FILE" 2>/dev/null | cut -d= -f2-)
    if [ -n "$VAL" ] && [ "$VAL" != "" ]; then
      echo "  ✅ $KEY (definida, ${#VAL} chars)"
    else
      echo "  ❌ $KEY (NÃO DEFINIDA)"
    fi
  done
else
  echo "  ⚠️ .env não encontrado em $ENV_FILE"
fi
echo ""

# 7. Memória/Disco
echo "[7] Recursos..."
echo "  Memória: $(free -h | awk '/Mem:/{print $2 " total, " $7 " disponível"}')"
echo "  Disco:   $(df -h /opt | awk 'NR==2{print $2 " total, " $4 " livre"}')"
echo "  CPU:     $(nproc) cores"
echo ""

# 8. Teste rápido do agente
echo "[8] Teste rápido do agente (shell)..."
TEST_TASK="diag-test-$(date +%s)"
TEST_WS="$WORKSPACE_ROOT/$TEST_TASK"
mkdir -p "$TEST_WS"
if echo 'print("OmniNinja sandbox OK")' > "$TEST_WS/test.py" && python3 "$TEST_WS/test.py" 2>/dev/null; then
  echo "  ✅ Python executa no workspace"
else
  echo "  ⚠️ Python não executou no workspace"
fi
rm -rf "$TEST_WS"
echo ""

echo "============================================================"
echo "  Diagnóstico completo."
echo "  Para setup completo do sandbox: sudo bash /opt/omnininja/app/scripts/setup-sandbox.sh"
echo "============================================================"
