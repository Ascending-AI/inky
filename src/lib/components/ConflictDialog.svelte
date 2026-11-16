<script lang="ts">
  import { app } from "$lib/state.svelte";
  import * as AlertDialog from "$lib/components/ui/alert-dialog/index.js";
  import { Button } from "$lib/components/ui/button/index.js";

  /** The open document changed on disk where the reader also edited it. */
  const c = $derived(app.conflict);
  const name = $derived((c?.path.split("/").pop() ?? "").replace(/\.(md|markdown|mmd)$/i, ""));
  const first = $derived(c?.conflicts[0]);
  const more = $derived((c?.conflicts.length ?? 0) - 1);
  /** The reader also made edits elsewhere that merge cleanly. */
  const hasOtherEdits = $derived(!!c && c.merged !== c.theirs);

  function clip(s: string, n = 220): string {
    const t = s.replace(/\s+/g, " ").trim();
    return t.length > n ? t.slice(0, n) + "…" : t || "(removed)";
  }
</script>

<!-- Not dismissable by Escape or clicking outside: a choice must be made. -->
<AlertDialog.Root open={c !== null}>
  <AlertDialog.Content class="sm:max-w-xl" onEscapeKeydown={(e) => e.preventDefault()}>
    <AlertDialog.Header>
      <AlertDialog.Title>“{name}” changed while you were editing</AlertDialog.Title>
      <AlertDialog.Description>
        Someone else (an agent or another app) saved this document, and you both changed the same
        {c && c.conflicts.length > 1 ? `${c.conflicts.length} passages` : "passage"}. Nothing has been
        overwritten yet.
      </AlertDialog.Description>
    </AlertDialog.Header>

    {#if first}
      <div class="grid gap-2 text-xs">
        <div class="rounded-md border bg-muted/40 p-2.5">
          <p class="mb-1 font-semibold text-muted-foreground">Their version</p>
          <p class="leading-relaxed">{clip(first.theirs)}</p>
        </div>
        <div class="rounded-md border bg-muted/40 p-2.5">
          <p class="mb-1 font-semibold text-muted-foreground">Your version</p>
          <p class="leading-relaxed">{clip(first.mine)}</p>
        </div>
        {#if more > 0}
          <p class="text-muted-foreground">…and {more} more {more === 1 ? "passage" : "passages"}.</p>
        {/if}
      </div>
    {/if}

    <div class="grid gap-2 pt-1">
      <Button onclick={() => app.saveMineAsCopy()}>Keep both: save mine as a copy</Button>
      {#if hasOtherEdits}
        <Button variant="outline" onclick={() => app.useMergedVersion()}>
          Use theirs here, keep my other edits
        </Button>
      {/if}
      <div class="grid grid-cols-2 gap-2">
        <Button variant="outline" onclick={() => app.useTheirVersion()}>Use their version</Button>
        <Button variant="outline" onclick={() => app.keepMyVersion()}>Keep my version</Button>
      </div>
      {#if app.docSidecars}
        <p class="text-[11px] text-muted-foreground">
          Keeping your version saves theirs in this document's version history.
        </p>
      {/if}
    </div>
  </AlertDialog.Content>
</AlertDialog.Root>
