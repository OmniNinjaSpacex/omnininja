# Nova Agent Runner

Serviço que roda na sua VM Ubuntu (AWS) e executa as tarefas do agente de verdade:
shell, arquivos, browser (Playwright), busca web e exposição de portas.

## Instalação (Ubuntu 22.04+)

```bash
git clone https://github.com/Vxvjsiwieh82/nova-agent-runner.git
cd nova-agent-runner
sudo bash install.sh
```

O script instala Node 22 + Chromium/Playwright, cria o usuário `nova`,
sobe o serviço systemd `nova-runner` na porta **8787** e imprime no final:

- `RUNNER_URL`
- `RUNNER_TOKEN`
- `RUNNER_CALLBACK_TOKEN`

Libere a porta 8787 no Security Group da AWS e envie esses 3 valores para o app.

## Comandos úteis

```bash
sudo systemctl status nova-runner
sudo journalctl -u nova-runner -f
sudo systemctl restart nova-runner
```
