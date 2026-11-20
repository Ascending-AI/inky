<script lang="ts">
  import { app } from "$lib/state.svelte";
  import { themeSections } from "$lib/themes/library";
  import type { Theme } from "$lib/themes/model";
  import { Button } from "$lib/components/ui/button/index.js";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import Check from "@lucide/svelte/icons/check";
  import X from "@lucide/svelte/icons/x";
  import Search from "@lucide/svelte/icons/search";

  let kind = $state<"all" | "light" | "dark">("all");
  let query = $state("");

  const sections = $derived.by(() => {
    const q = query.trim().toLowerCase();
    const keep = (t: Theme) =>
      (kind === "all" || t.kind === kind) && (!q || t.name.toLowerCase().includes(q));
    return themeSections(app.themes)
      .map((s) => ({ ...s, items: s.items.filter(keep) }))
      .filter((s) => s.items.length > 0);
  });
</script>

<aside class="no-print flex h-full w-full flex-col border-l bg-background">
  <div class="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
    <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Themes</span>
    <Button variant="ghost" size="icon" class="size-6" title="Close" onclick={() => app.toggleThemesPanel()}>
      <X class="size-3.5" />
    </Button>
  </div>

  <div class="flex flex-col gap-2 px-3 pb-2">
    <div class="relative">
      <Search class="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
      <input
        bind:value={query}
        placeholder="Search themes"
        class="h-7 w-full rounded-md border bg-background pr-2 pl-7 text-xs outline-none focus:border-ring"
      />
    </div>
    <div class="grid grid-cols-3 gap-1 rounded-md bg-muted p-0.5">
      {#each [{ key: "all", label: "All" }, { key: "light", label: "Light" }, { key: "dark", label: "Dark" }] as opt (opt.key)}
        <button
          class="rounded-[5px] py-1 text-xs transition-colors
            {kind === opt.key ? 'bg-background font-medium shadow-sm' : 'text-muted-foreground hover:text-foreground'}"
          onclick={() => (kind = opt.key as typeof kind)}
        >
          {opt.label}
        </button>
      {/each}
    </div>
  </div>

  <ScrollArea class="min-h-0 flex-1">
    <div class="flex flex-col gap-4 px-3 pb-4">
      {#each sections as sec (sec.label)}
        <div class="flex flex-col gap-2">
          <p class="pt-1 text-[11px] font-medium text-muted-foreground">{sec.label}</p>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2">
            {#each sec.items as t (t.id)}
              {@const on = t.id === app.themeId}
              <button
                class="group flex flex-col gap-1.5 rounded-lg p-1 text-left transition-colors hover:bg-accent/60"
                title={t.name}
                aria-pressed={on}
                onclick={() => app.setTheme(t.id)}
              >
                <div
                  class="relative flex h-16 w-full overflow-hidden rounded-md border
                    {on ? 'ring-2 ring-ring ring-offset-1 ring-offset-background' : ''}"
                  style="background-color:{t.colors.page}; border-color:{t.colors.border}"
                >
                  <div
                    class="w-1/4 shrink-0 border-r"
                    style="background-color:{t.colors.sidebar}; border-color:{t.colors.border}"
                  ></div>
                  <div class="flex flex-1 flex-col gap-1 px-2 pt-2">
                    <div class="h-1.5 w-3/4 rounded-full" style="background-color:{t.colors.text}"></div>
                    <div class="h-1 w-full rounded-full opacity-45" style="background-color:{t.colors.text}"></div>
                    <div class="h-1 w-5/6 rounded-full opacity-45" style="background-color:{t.colors.text}"></div>
                    <div class="h-1 w-1/2 rounded-full" style="background-color:{t.colors.accent}"></div>
                  </div>
                  {#if on}
                    <span
                      class="absolute right-1 bottom-1 flex size-4 items-center justify-center rounded-full"
                      style="background-color:{t.colors.accent}; color:{t.colors.page}"
                    >
                      <Check class="size-3" />
                    </span>
                  {/if}
                </div>
                <span class="truncate px-0.5 text-xs {on ? 'font-medium' : ''}">{t.name}</span>
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <p class="px-1 pt-6 text-center text-xs text-muted-foreground">No themes match.</p>
      {/each}
    </div>
  </ScrollArea>

  <div class="border-t p-3">
    <Button variant="outline" size="sm" class="h-7 w-full text-xs" onclick={() => app.openThemeEditor()}>
      Edit Themes…
    </Button>
  </div>
</aside>
