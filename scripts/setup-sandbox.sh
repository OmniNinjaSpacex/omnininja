#!/usr/bin/env bash
# ============================================================
# OmniNinja — Setup do Sandbox VM (estilo Manus AI / E2B)
#
# Prepara o ambiente de isolamento no Ubuntu para que cada task
# do agente rode numa "máquina virtual" separada.
#
# Níveis de isolamento (do melhor ao mais simples):
#   Nível 2: unshare + proot (namespace real do kernel)
#   Nível 1: chroot com debootstrap (Ubuntu base isolado)
#   Nível 0: diretório isolado (fallback — sempre funciona)
#
# Este script tenta instalar Nível 2 e Nível 1. Se falhar, cai
# automaticamente para Nível 0 (que só precisa de mkdir).
#
# Uso:  sudo bash scripts/setup-sandbox.sh
# ============================================================
set -uo pipefail

SANDBOX_IMAGE="${OMNININJA_SANDBOX_IMAGE:-/opt/omnininja/sandbox-base}"
SANDBOX_BASE="${OMNININJA_SANDBOX_BASE:-/opt/omnininja/sandboxes}"
WORKSPACE_ROOT="${OMNININJA_WORKSPACE_ROOT:-/opt/omnininja/workspaces}"

echo "============================================================"
echo "  OmniNinja — Setup do Sandbox VM"
echo "============================================================"
echo ""

# Cria diretórios base
mkdir -p "$WORKSPACE_ROOT" "$SANDBOX_BASE" "$(dirname "$SANDBOX_IMAGE")"
echo "✅ Diretórios criados: $WORKSPACE_ROOT, $SANDBOX_BASE"

# ============================================================
# NÍVEL 2: unshare + proot (namespace do kernel)
# ============================================================
echo ""
echo "[Nível 2] Verificando unshare + proot..."

INSTALLED_LEVEL2=false

# Habilita user namespaces no kernel (Ubuntu 24.04 pode ter restrito)
if [ -f /proc/sys/kernel/unprivileged_userns_clone ]; then
  echo "  Habilitando unprivileged_userns_clone..."
  echo 1 > /proc/sys/kernel/unprivileged_userns_clone 2>/dev/null || true
fi

# Ubuntu 24.04 usa /proc/sys/user/max_user_namespaces
if [ -f /proc/sys/user/max_user_namespaces ]; then
  CURRENT=$(cat /proc/sys/user/max_user_namespaces 2>/dev/null || echo 0)
  if [ "$CURRENT" -lt 1000 ] 2>/dev/null; then
    echo "  Aumentando max_user_namespaces (era $CURRENT)..."
    sysctl -w user.max_user_namespaces=65536 2>/dev/null || true
    # Persiste
    echo "user.max_user_namespaces=65536" > /etc/sysctl.d/99-omnininja-namespaces.conf 2>/dev/null || true
  fi
fi

# Instala proot e utilitários de namespace
if ! command -v proot >/dev/null 2>&1; then
  echo "  Instalando proot..."
  apt-get install -y --no-install-recommends proot uidmap 2>/dev/null || true
fi

# Testa se unshare --user funciona
if command -v unshare >/dev/null 2>&1; then
  if unshare --user --map-root-user true >/dev/null 2>&1; then
    echo "  ✅ unshare --user funciona!"
    if command -v proot >/dev/null 2>&1; then
      echo "  ✅ proot disponível!"
      INSTALLED_LEVEL2=true
    else
      echo "  ⚠️ proot não disponível — Nível 2 não completo"
    fi
  else
    echo "  ⚠️ unshare --user não funciona neste kernel/config"
  fi
else
  echo "  ⚠️ unshare não disponível"
fi

# ============================================================
# NÍVEL 1: chroot com debootstrap (Ubuntu base)
# ============================================================
echo ""
echo "[Nível 1] Verificando imagem base chroot..."

INSTALLED_LEVEL1=false

if [ -x "$SANDBOX_IMAGE/bin/bash" ]; then
  echo "  ✅ Imagem base já existe: $SANDBOX_IMAGE"
  INSTALLED_LEVEL1=true
else
  echo "  Criando imagem base Ubuntu (debootstrap)..."
  echo "  Isso baixa ~80MB e pode levar 2-5 minutos..."

  # Instala debootstrap se não tiver
  if ! command -v debootstrap >/dev/null 2>&1; then
    apt-get install -y --no-install-recommends debootstrap 2>/dev/null || true
  fi

  if command -v debootstrap >/dev/null 2>&1; then
    # Detecta versão do Ubuntu
    CODENAME=$(lsb_release -cs 2>/dev/null || echo "noble")
    echo "  debootstrap: $CODENAME -> $SANDBOX_IMAGE"

    if debootstrap --variant=minbase --include=python3,python3-pip,curl,wget,git,bash,ca-certificates,gnupg,sqlite3,jq,vim-tiny,less,procps,iproute2,net-tools,openssh-client \
        "$CODENAME" "$SANDBOX_IMAGE" 2>&1 | tail -5; then

      echo "  ✅ Imagem base criada!"

      # Instala Node.js dentro do sandbox base
      echo "  Instalando Node.js 20 no sandbox base..."
      chroot "$SANDBOX_IMAGE" /bin/bash -c "
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - 2>/dev/null
        apt-get install -y --no-install-recommends nodejs 2>/dev/null
        node --version
      " 2>&1 | tail -3 || echo "  ⚠️ Node no sandbox falhou (Python/bash continuam disponíveis)"

      # Configura resolv.conf dentro do sandbox
      cp /etc/resolv.conf "$SANDBOX_IMAGE/etc/resolv.conf" 2>/dev/null || true

      # Cria /workspace no sandbox (será bind-mountado em runtime)
      mkdir -p "$SANDBOX_IMAGE/workspace"

      INSTALLED_LEVEL1=true
    else
      echo "  ⚠️ debootstrap falhou — Nível 1 indisponível"
    fi
  else
    echo "  ⚠️ debootstrap não pôde ser instalado — Nível 1 indisponível"
  fi
fi

# ============================================================
# RESUMO
# ============================================================
echo ""
echo "============================================================"
echo "  RESUMO DO SANDBOX"
echo "============================================================"

if [ "$INSTALLED_LEVEL2" = "true" ]; then
  echo "  ✅ Nível 2 (namespace+proot): DISPONÍVEL — isolamento máximo"
  echo "     Cada task roda em namespace Linux isolado (PID/mount/net/user)"
elif [ "$INSTALLED_LEVEL1" = "true" ]; then
  echo "  ✅ Nível 1 (chroot): DISPONÍVEL — isolamento de filesystem"
  echo "     Cada task roda em chroot Ubuntu isolado"
else
  echo "  ✅ Nível 0 (diretório): isolamento por diretório de trabalho"
  echo "     Cada task tem seu workspace, sem chroot/namespace"
  echo "     Funcional, mas sem isolamento forte de filesystem"
fi

echo ""
echo "  Imagem base:  $SANDBOX_IMAGE"
echo "  Workspaces:   $WORKSPACE_ROOT"
echo "  Sandboxes:    $SANDBOX_BASE"
echo ""
echo "  O OmniNinja detecta automaticamente o melhor nível disponível."
echo "============================================================"
