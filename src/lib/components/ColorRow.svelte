<script lang="ts">
  import { Input } from "$lib/components/ui/input/index.js";
  import { Button } from "$lib/components/ui/button/index.js";
  import RotateCcw from "@lucide/svelte/icons/rotate-ccw";
  import TriangleAlert from "@lucide/svelte/icons/triangle-alert";

  /** One colour in the theme editor: a native picker swatch and an editable hex value. */
  interface Props {
    label: string;
    /** The colour as shown, resolved to `#rrggbb` / `#rrggbbaa`; null when unknown. */
    value: string | null;
    /** Derived from the main colours: the field reads "auto". */
    auto?: boolean;
    /** Contrast warning shown under the row. */
    warning?: string | null;
    onpick: (hex: string) => void;
    /** Present when the colour is pinned: returns it to automatic. */
    onreset?: () => void;
  }
  let { label, value, auto = false, warning = null, onpick, onreset }: Props = $props();

  const id = $props.id();
  const shown = $derived(auto ? "" : (value ?? ""));
  /** The field's text: `shown`, or what is being typed. */
  let text = $state("");
  $effect(() => {
    text = shown;
  });
  /** The native picker only takes opaque `#rrggbb`. */
  const swatch = $derived(value ? value.slice(0, 7) : "#000000");

  function normalize(s: string): string | null {
    const m = /^#?([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s.trim());
    if (!m) return null;
    const h = m[1].length <= 4 ? [...m[1]].map((c) => c + c).join("") : m[1];
    return `#${h.toLowerCase()}`;
  }

  /** Accept a typed `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa`; anything else restores the previous value. */
  function commit() {
    const hex = normalize(text);
    text = shown;
    if (hex && hex !== shown.toLowerCase()) onpick(hex);
  }

  function picked(e: Event) {
    const rgb = (e.currentTarget as HTMLInputElement).value.toLowerCase();
    if (auto || rgb !== swatch.toLowerCase()) {
      // The picker has no alpha: keep the colour's own.
      const alpha = !auto && value && value.length === 9 ? value.slice(7) : "";
      onpick(rgb + alpha);
    }
  }
</script>

<div class="grid gap-0.5 py-1">
  <div class="flex items-center gap-2">
    <label for="{id}-hex" class="min-w-0 flex-1 truncate text-sm">{label}</label>
    {#if onreset}
      <Button
        variant="ghost"
        size="icon-xs"
        class="text-muted-foreground"
        title="Back to auto"
        aria-label="Return {label} to auto"
        onclick={onreset}
      >
        <RotateCcw />
      </Button>
    {/if}
    <Input
      id="{id}-hex"
      class="h-7 w-[5.5rem] px-1.5 font-mono text-xs md:text-xs"
      placeholder={auto ? "auto" : ""}
      bind:value={text}
      spellcheck={false}
      autocomplete="off"
      onblur={commit}
      onkeydown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        }
      }}
    />
    <input
      type="color"
      class="swatch h-7 w-8 shrink-0 cursor-pointer rounded-md border border-input bg-transparent p-0.5"
      aria-label="Pick {label}"
      value={swatch}
      oninput={picked}
    />
  </div>
  {#if warning}
    <p class="flex items-center gap-1 text-[11px] text-destructive">
      <TriangleAlert class="size-3" />
      {warning}
    </p>
  {/if}
</div>

<style>
  .swatch::-webkit-color-swatch-wrapper {
    padding: 0;
  }
  .swatch::-webkit-color-swatch {
    border: none;
    border-radius: 4px;
  }
</style>
