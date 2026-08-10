# OmniNinja AI Lab execution host

This directory prepares a dedicated Ubuntu machine to run the OmniNinja remote execution provider through [lemonade-sdk/ailab](https://github.com/lemonade-sdk/ailab).

## Why this host is separate

The OmniNinja web application, PostgreSQL database, OpenAI credentials, and user sessions should not live on the same machine that executes agent shell commands. AI Lab gives every task a separate LXD-backed environment, while OmniNinja talks to the AI Lab management API through the provider in `src/lib/ailab-sandbox.ts`.

AI Lab currently uses privileged LXD containers. Treat this as useful workload isolation, not as a hard security boundary against deliberately hostile code. The execution host should therefore be dedicated and disposable where practical.

## Supported host

The upstream project requires Ubuntu 22.04 or later and recommends Ubuntu 24.04 or 26.04. The bootstrap uses the upstream Snap installation flow:

- LXD Snap
- `lxd init --auto`
- AI Lab Snap
- `snap connect ailab:lxd lxd:lxd`
- `ailab doctor`

## Bootstrap

On a fresh Ubuntu execution VM, clone the OmniNinja repository and run:

```bash
bash infra/ailab-host/bootstrap.sh
```

The script is intentionally conservative. It does **not** open port 11500 publicly. It configures the AI Lab web/API daemon to listen on `127.0.0.1:11500`.

After installation, run locally on the execution host:

```bash
sudo ailab dashboard
```

AI Lab prints a token-bearing local dashboard URL. Keep that token private. Put it in the OmniNinja deployment secret manager as `AILAB_API_TOKEN`; never commit it to the repository or paste it into application logs.

## OmniNinja deployment variables

The web service uses:

```text
OMNININJA_SANDBOX_PROVIDER=ailab
AILAB_BASE_URL=<private or authenticated AI Lab endpoint>
AILAB_API_TOKEN=<secret>
AILAB_PROVISION_TIMEOUT_MS=300000
OMNININJA_AILAB_WORKSPACE=.omnininja-workspace
```

`AILAB_BASE_URL` must be reachable from the OmniNinja web service. Prefer a private network or an authenticated TLS tunnel. Do not simply bind AI Lab to `0.0.0.0:11500` on the public internet.

## Verification order

1. `ailab doctor` succeeds on the execution host.
2. `sudo ailab dashboard` opens locally.
3. The private/authenticated transport is established.
4. `GET /api/health/sandbox` on OmniNinja returns the AI Lab provider as configured and reachable.
5. Run a disposable test task that writes a file, reads it back, lists the workspace, and executes a harmless command.
6. Confirm the task container can be deleted after the test.

The provider is fail-closed: if AI Lab cannot be reached or its token is missing, OmniNinja does not fall back to executing the command on the web server.
