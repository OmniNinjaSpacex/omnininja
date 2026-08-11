// Cloudflare Workers cannot provide the kernel-isolated local sandbox.
// Remote AI Lab remains available through shell-agent.edge when configured.

export type SandboxLevel = 0 | 1 | 2;

export function sandboxHealth() {
  return {
    level: 0 as SandboxLevel,
    levelName: 'unavailable-in-worker',
    productionSafe: false,
    hasUnshare: false,
    hasProot: false,
    hasBaseImage: false,
    workspaceRoot: '',
    sandboxBase: '',
    baseImage: '',
  };
}
