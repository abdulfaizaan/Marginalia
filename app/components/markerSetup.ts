import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

// Margin-note markers (ED-3/ED-4): numbered chips anchored to blocks, kept out of the
// document body — decorations only, so exports never contain them.

export const markerKey = new PluginKey<ReadonlyMap<string, readonly number[]>>("mgMarkers");

export const idAttr = Extension.create({
  name: "idAttr",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph", "heading"],
        attributes: {
          id: {
            default: null,
            parseHTML: (el: HTMLElement) => el.getAttribute("data-id") || el.getAttribute("id"),
            renderHTML: (attrs: { id?: string | null }) => (attrs.id ? { "data-id": attrs.id } : {}),
          },
          // AI-inserted / pinned paragraphs (set server-side) must survive Tiptap round-trips
          ai: { default: null, parseHTML: () => null, renderHTML: (attrs: { ai?: string | null }) => (attrs.ai ? { "data-ai": attrs.ai } : {}) },
          pinnedVisual: { default: null, parseHTML: () => null, renderHTML: () => ({}), keepOnSplit: false },
        },
      },
    ];
  },
});

export const markers = Extension.create({
  name: "markers",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: markerKey,
        state: {
          init: () => new Map<string, readonly number[]>(),
          apply: (tr, prev) => (tr.getMeta(markerKey) as Map<string, readonly number[]> | undefined) ?? prev,
        },
        props: {
          decorations(state) {
            const map = markerKey.getState(state);
            if (!map || map.size === 0) return DecorationSet.empty;
            const decos: Decoration[] = [];
            state.doc.descendants((node, offset) => {
              const id = node.attrs?.id as string | undefined;
              const nums = id ? map.get(id) : undefined;
              if (!nums?.length) return false;
              const wrap = document.createElement("span");
              for (const n of nums) {
                const s = document.createElement("span");
                s.className = "mg-chip";
                s.textContent = String(n);
                wrap.appendChild(s);
              }
              decos.push(Decoration.widget(offset + node.nodeSize, () => wrap, { side: 20 }));
              decos.push(Decoration.node(offset, offset + node.nodeSize, { class: "margin-note-anchor" }));
              return false;
            });
            return DecorationSet.create(state.doc, decos);
          },
        },
      }),
    ];
  },
});

