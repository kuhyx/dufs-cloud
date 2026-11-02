import type { DirEntry, SubtitleManifest } from "../api/types.ts";
import { createDashPlayer } from "../stores/dash-player.ts";
import { createJassub } from "../stores/jassub.ts";
import { createSubtitles } from "../stores/subtitles.ts";
import type { SubtitleTrack } from "../lib/subtitles.ts";
import { AudioMenu } from "./audio-menu.ts";
import { h } from "./dom.ts";
import { SubtitleMenu } from "./subtitle-menu.ts";

export interface ControlsInput {
  readonly entry: DirEntry;
  readonly url: string;
  readonly siblings: readonly DirEntry[];
  readonly subtitlesPath: string | null;
  readonly subtitleManifest: SubtitleManifest | null;
  readonly dashPath: string | null;
}

export interface Controls {
  readonly el: HTMLElement;
  update: (input: ControlsInput) => void;
  dispose: () => void;
}

function subtitleInput(input: ControlsInput) {
  return {
    entry: input.entry,
    siblings: input.siblings,
    subtitlesPath: input.subtitlesPath,
    manifest: input.subtitleManifest,
  };
}

/** Owns the playback stores (subtitles, libass, DASH) of one open video and
 * the audio/subtitle pickers that drive them. */
export function createControls(
  video: HTMLVideoElement,
  first: ControlsInput,
): Controls {
  const subs = createSubtitles(subtitleInput(first));
  const jassub = createJassub();
  const dash = createDashPlayer();
  const audioMenu = new AudioMenu();
  const subtitleMenu = new SubtitleMenu();
  let url = first.url;

  const sync = (): void => {
    const s = subs.getState();
    const d = dash.getState();
    jassub.setOffsetMs(s.offsetMs);
    jassub.update({ video, track: s.active, fonts: s.fonts });
    const src = d.src ?? url;
    if (video.getAttribute("src") !== src) video.setAttribute("src", src);
    audioMenu.tracks = d.audio;
    audioMenu.active = d.activeAudio;
    subtitleMenu.tracks = s.tracks;
    subtitleMenu.active = s.active;
    subtitleMenu.offsetMs = s.offsetMs;
  };

  audioMenu.addEventListener("select", (e) => {
    e.stopPropagation();
    dash.selectAudio((e as CustomEvent<string>).detail);
  });
  subtitleMenu.addEventListener("select", (e) => {
    e.stopPropagation();
    subs.select((e as CustomEvent<SubtitleTrack | null>).detail);
  });
  subtitleMenu.addEventListener("offset-change", (e) => {
    e.stopPropagation();
    subs.setOffsetMs((e as CustomEvent<number>).detail);
  });

  const unsubscribe = [subs.subscribe(sync), dash.subscribe(sync)];
  dash.setSource(video, first.dashPath);
  sync();

  return {
    el: h("div", { class: "viewer-controls" }, audioMenu, subtitleMenu),
    update: (input) => {
      url = input.url;
      subs.setInput(subtitleInput(input));
      dash.setSource(video, input.dashPath);
      sync();
    },
    dispose: () => {
      for (const off of unsubscribe) off();
      dash.dispose();
      jassub.dispose();
      subs.dispose();
    },
  };
}
