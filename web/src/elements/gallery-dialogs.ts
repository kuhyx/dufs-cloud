// <gallery-dialogs> props: client, path, selectedCount, dialogs (store), mutations. Events: reload.
import type { DufsClient } from "../api/dufs-client.ts";
import type { DirEntry } from "../api/types.ts";
import type { GalleryDialogs as DialogStore } from "../stores/gallery-dialogs.ts";
import type { Mutations } from "../stores/mutations.ts";
import { ConfirmDialog } from "./confirm-dialog.ts";
import { define, emit } from "./events.ts";
import { TextEditor } from "./text-editor.ts";

type SlotName = "edit" | "delete" | "deleteSelected" | "move";
interface Slot {
  readonly key: object | true;
  readonly el: HTMLElement;
}
type FolderPickerProps = HTMLElement & {
  client: DufsClient;
  initialPath: string;
  count: number;
};

function on(el: HTMLElement, type: string, run: (detail: unknown) => void): void {
  el.addEventListener(type, (e) => {
    e.stopPropagation();
    run((e as CustomEvent<unknown>).detail);
  });
}

/** Text editor, delete confirmations and the move picker. */
export class GalleryDialogs extends HTMLElement {
  client!: DufsClient;
  path = "/";
  mutations!: Mutations;
  #selectedCount = 0;
  #dialogs: DialogStore | null = null;
  #unsubscribe: (() => void) | null = null;
  readonly #slots = new Map<SlotName, Slot>();

  get selectedCount(): number {
    return this.#selectedCount;
  }

  set selectedCount(value: number) {
    this.#selectedCount = value;
    this.#sync();
  }

  get dialogs(): DialogStore | null {
    return this.#dialogs;
  }

  set dialogs(value: DialogStore | null) {
    this.#dialogs = value;
    if (this.isConnected) this.#subscribe();
  }

  connectedCallback(): void {
    this.style.display = "contents";
    this.#subscribe();
  }

  disconnectedCallback(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = null;
  }

  #subscribe(): void {
    this.disconnectedCallback();
    this.#unsubscribe =
      this.#dialogs?.subscribe(() => {
        this.#sync();
      }) ?? null;
    this.#sync();
  }

  #sync(): void {
    const dialogs = this.#dialogs;
    if (dialogs === null || !this.isConnected) return;
    const s = dialogs.getState();
    this.#slot("edit", s.editEntry, (entry) => this.#editor(dialogs, entry));
    this.#slot("delete", s.deleteEntry, (entry) => this.#confirmDelete(dialogs, entry));
    this.#slot("deleteSelected", s.showDeleteSelected || null, () =>
      this.#confirmDeleteSelected(dialogs),
    );
    this.#slot("move", s.showMove || null, () => this.#picker(dialogs));
    const confirm = this.#slots.get("deleteSelected")?.el;
    if (confirm instanceof ConfirmDialog) confirm.message = this.#selectedMessage();
    const picker = this.#slots.get("move")?.el as FolderPickerProps | undefined;
    if (picker) picker.count = this.#selectedCount;
  }

  #slot<K extends object | true>(
    name: SlotName,
    key: K | null,
    make: (key: K) => HTMLElement,
  ): void {
    const current = this.#slots.get(name);
    if (current?.key === key) return;
    current?.el.remove();
    this.#slots.delete(name);
    if (key === null) return;
    const el = make(key);
    this.#slots.set(name, { key, el });
    this.append(el);
  }

  #editor(dialogs: DialogStore, entry: DirEntry): HTMLElement {
    const el = new TextEditor();
    el.client = this.client;
    el.entry = entry;
    on(el, "close", () => {
      dialogs.setEditEntry(null);
      emit(this, "reload");
    });
    return el;
  }

  #confirm(message: string, onConfirm: () => void, onCancel: () => void): ConfirmDialog {
    const el = new ConfirmDialog();
    el.message = message;
    el.confirmLabel = "Delete";
    on(el, "confirm", onConfirm);
    on(el, "cancel", onCancel);
    return el;
  }

  #confirmDelete(dialogs: DialogStore, entry: DirEntry): HTMLElement {
    return this.#confirm(
      `Delete "${entry.name}"? This cannot be undone.`,
      () => {
        dialogs.setDeleteEntry(null);
        this.mutations.confirmDelete(entry);
      },
      () => {
        dialogs.setDeleteEntry(null);
      },
    );
  }

  #selectedMessage(): string {
    return `Delete ${this.#selectedCount} item(s)? This cannot be undone.`;
  }

  #confirmDeleteSelected(dialogs: DialogStore): HTMLElement {
    return this.#confirm(
      this.#selectedMessage(),
      () => {
        dialogs.setShowDeleteSelected(false);
        this.mutations.deleteSelected();
      },
      () => {
        dialogs.setShowDeleteSelected(false);
      },
    );
  }

  #picker(dialogs: DialogStore): HTMLElement {
    const el = document.createElement("folder-picker") as FolderPickerProps;
    el.client = this.client;
    el.initialPath = this.path;
    el.count = this.#selectedCount;
    on(el, "pick", (destDir) => {
      dialogs.setShowMove(false);
      this.mutations.moveSelected(destDir as string);
    });
    on(el, "cancel", () => {
      dialogs.setShowMove(false);
    });
    return el;
  }
}

define("gallery-dialogs", GalleryDialogs);
