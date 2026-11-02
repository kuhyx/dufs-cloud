// <result-groups> props: client, groups, collapsed, selected. Events: toggle-collapsed folder, open-dir path, plus every <cloud-grid> event (bubbled).
import type { DufsClient } from "../api/dufs-client.ts";
import type { FolderGroup } from "../lib/cloud-stats.ts";
import { h } from "./dom.ts";
import { define, emit, syncChildren, upgradeProps } from "./element-kit.ts";
import type { CloudGrid } from "./grid.ts";
import "./grid.ts";

const PROPS = ["client", "groups", "collapsed", "selected"] as const;

interface Section {
  readonly group: FolderGroup;
  readonly isCollapsed: boolean;
  readonly el: HTMLElement;
  readonly grid: CloudGrid | null;
}

export class ResultGroups extends HTMLElement {
  #client: DufsClient | null = null;
  #groups: readonly FolderGroup[] = [];
  #collapsed: ReadonlySet<string> = new Set();
  #selected: ReadonlySet<string> = new Set();
  #sections = new Map<string, Section>();

  constructor() {
    super();
    upgradeProps(this, PROPS);
  }

  get client(): DufsClient | null {
    return this.#client;
  }
  set client(v: DufsClient | null) {
    this.#client = v;
    this.#sections.clear();
    this.#render();
  }
  get groups(): readonly FolderGroup[] {
    return this.#groups;
  }
  set groups(v: readonly FolderGroup[]) {
    this.#groups = v;
    this.#render();
  }
  get collapsed(): ReadonlySet<string> {
    return this.#collapsed;
  }
  set collapsed(v: ReadonlySet<string>) {
    this.#collapsed = v;
    this.#render();
  }
  get selected(): ReadonlySet<string> {
    return this.#selected;
  }
  set selected(v: ReadonlySet<string>) {
    this.#selected = v;
    this.#render();
  }

  #build(group: FolderGroup, isCollapsed: boolean): Section {
    const folder = group.folder;
    const head = h(
      "div",
      { class: "group-head" },
      h(
        "button",
        {
          type: "button",
          class: "group-toggle",
          "aria-label": isCollapsed ? `Expand ${folder}` : `Collapse ${folder}`,
          "aria-expanded": String(!isCollapsed),
          onClick: () => {
            emit(this, "toggle-collapsed", folder);
          },
        },
        isCollapsed ? "▸" : "▾",
      ),
      h(
        "button",
        {
          type: "button",
          class: "group-path",
          onClick: () => {
            emit(this, "open-dir", folder);
          },
        },
        `📁 ${folder}`,
      ),
      h("span", { class: "group-count muted" }, String(group.entries.length)),
    );
    const el = h("section", { class: "result-group" }, head);
    let grid: CloudGrid | null = null;
    if (!isCollapsed) {
      grid = document.createElement("cloud-grid") as CloudGrid;
      grid.client = this.client;
      grid.entries = group.entries;
      el.append(grid);
    }
    return { group, isCollapsed, el, grid };
  }

  #render(): void {
    if (this.#client === null) return;
    const next = new Map<string, Section>();
    const nodes = this.#groups.map((group) => {
      const isCollapsed = this.#collapsed.has(group.folder);
      const cached = this.#sections.get(group.folder);
      const section =
        cached?.group === group && cached.isCollapsed === isCollapsed
          ? cached
          : this.#build(group, isCollapsed);
      if (section.grid !== null) section.grid.selected = this.#selected;
      next.set(group.folder, section);
      return section.el;
    });
    this.#sections = next;
    syncChildren(this, nodes);
  }
}

define("result-groups", ResultGroups);
