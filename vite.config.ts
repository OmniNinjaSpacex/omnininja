import { resolve } from 'node:path';
import vinext from 'vinext';
import { defineConfig, type Plugin } from 'vite';
import { sites } from './scripts/sites-vite-plugin.ts';

const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';
const edgeDatabaseModule = resolve(process.cwd(), 'src/lib/db.edge.ts');
const edgeSandboxModule = resolve(process.cwd(), 'src/lib/sandbox.edge.ts');
const edgeShellModule = resolve(process.cwd(), 'src/lib/shell-agent.edge.ts');

const edgeAliases = new Map([
  ['#omninininja/db', edgeDatabaseModule],
  ['#omninininja/sandbox', edgeSandboxModule],
  ['#omninininja/shell-agent', edgeShellModule],
  ['@/lib/db', edgeDatabaseModule],
  ['@/lib/sandbox', edgeSandboxModule],
  ['@/lib/shell-agent', edgeShellModule],
]);

function edgeRuntimeAliases(): Plugin {
  return {
    name: 'omnininja-edge-runtime-aliases',
    enforce: 'pre',
    resolveId(source) {
      return edgeAliases.get(source);
    },
  };
}

const localBindingConfig = {
  main: './worker/index.ts',
  compatibility_date: '2026-08-11',
  compatibility_flags: [
    'nodejs_compat',
    'nodejs_compat_populate_process_env',
  ],
};

export default defineConfig(async () => {
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';

  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    resolve: {
      alias: [
        { find: '#omninininja/db', replacement: edgeDatabaseModule },
        { find: '#omninininja/sandbox', replacement: edgeSandboxModule },
        { find: '#omninininja/shell-agent', replacement: edgeShellModule },
        { find: '@/lib/db', replacement: edgeDatabaseModule },
        { find: '@/lib/sandbox', replacement: edgeSandboxModule },
        { find: '@/lib/shell-agent', replacement: edgeShellModule },
      ],
    },
    server: {
      host: '0.0.0.0',
      allowedHosts: ['terminal.local'],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      edgeRuntimeAliases(),
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        config: localBindingConfig,
      }),
    ],
  };
});
