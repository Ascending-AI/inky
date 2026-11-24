<script lang="ts">
  import * as Dialog from "$lib/components/ui/dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import { invoke } from "@tauri-apps/api/core";
  import { writeText } from "@tauri-apps/plugin-clipboard-manager";
  import { toast } from "svelte-sonner";
  import Copy from "@lucide/svelte/icons/copy";
  import { app } from "$lib/state.svelte";

  let binary = $state("/Applications/Inky.app/Contents/MacOS/Inky");
  /** Secret the HTTP server requires (see `mcp::serve_http`). */
  let token = $state("<token>");
  $effect(() => {
    if (app.mcpSetupOpen) {
      invoke<string>("app_binary_path")
        .then((p) => (binary = p))
        .catch(() => {});
      invoke<string>("mcp_token")
        .then((t) => (token = t))
        .catch(() => {});
    }
  });

  const httpUrl = $derived(app.mcpUrl ?? "http://127.0.0.1:26317/mcp");

  const snippets = $derived([
    {
      title: "Claude Code (HTTP — needs Inky running with the light on)",
      code: `claude mcp add --transport http inky ${httpUrl} --header "Authorization: Bearer ${token}"`,
    },
    {
      title: "Claude Code (stdio — works even when Inky is closed)",
      code: `claude mcp add inky -- "${binary}" --mcp`,
    },
    {
      title: "Claude Desktop — add to claude_desktop_config.json",
      code: JSON.stringify({ mcpServers: { inky: { command: binary, args: ["--mcp"] } } }, null, 2),
    },
    {
      title: "Codex — add to ~/.codex/config.toml",
      code: `[mcp_servers.inky]\ncommand = '${binary}'\nargs = ["--mcp"]`,
    },
  ]);

  async function copy(code: string) {
    await writeText(code);
    toast.success("Copied");
  }
</script>

<Dialog.Root bind:open={app.mcpSetupOpen}>
  <Dialog.Content class="sm:max-w-2xl">
    <Dialog.Header>
      <Dialog.Title>Connect an agent</Dialog.Title>
      <Dialog.Description>
        Agents read and write your library through Inky's built-in MCP server — nothing else to
        install. Pick your client:
      </Dialog.Description>
    </Dialog.Header>
    <div class="flex min-w-0 flex-col gap-4">
      {#each snippets as s (s.title)}
        <div class="flex min-w-0 flex-col gap-1.5">
          <div class="flex items-center justify-between gap-2">
            <span class="min-w-0 text-sm font-medium">{s.title}</span>
            <Button
              variant="ghost"
              size="sm"
              class="h-7 gap-1 px-2 text-xs"
              onclick={() => copy(s.code)}
            >
              <Copy class="size-3.5" /> Copy
            </Button>
          </div>
          <pre
            class="min-w-0 whitespace-pre-wrap break-all rounded-md bg-muted px-3 py-2 font-mono text-xs"
          ><code>{s.code}</code></pre>
        </div>
      {/each}
      <p class="text-xs text-muted-foreground">
        Other HTTP clients: use <code>{httpUrl}</code> with the header
        <code>Authorization: Bearer …</code> shown above. The token stays the same between launches;
        treat it like a password. ChatGPT connectors need a public HTTPS URL, so they can't reach a server on your Mac.
      </p>
    </div>
  </Dialog.Content>
</Dialog.Root>
