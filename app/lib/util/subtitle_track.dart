/// Subtitle-track description and selection, kept free of any player plugin so
/// it stays unit-testable.
///
/// The cloud library is anime muxed as Matroska: subtitles are *embedded* ASS
/// tracks (one file carries 17 languages), never sidecar files. So the picker
/// has to label many same-language tracks distinguishably, and something has
/// to choose sensibly before the user touches anything.
library;

/// One embedded subtitle track, flattened from the player's native track list.
class SubtitleTrackInfo {
  /// Creates a track description.
  const SubtitleTrackInfo({
    required this.id,
    this.language = '',
    this.title = '',
    this.isDefault = false,
    this.isForced = false,
  });

  /// Player-specific track handle (mpv's `sid`, as a string).
  final String id;

  /// ISO language tag as muxed (`eng`, `pol`, `jpn`, …); may be empty.
  final String language;

  /// Free-text track title (`signs/songs`, `NF`, `Foxtrot`, …); may be empty.
  final String title;

  /// Whether the muxer flagged this track as the default.
  final bool isDefault;

  /// Whether the track is "forced" (typically signs-only for dubbed audio).
  final bool isForced;
}

/// English language tags seen in the wild, lowercased.
const _englishTags = {'en', 'eng', 'english', 'en-us', 'en-gb'};

/// Human-readable names for the language tags present in the library, so the
/// picker reads "Polish" rather than "pol". Unknown tags fall through to the
/// raw tag, which is still better than an opaque track number.
const _languageNames = <String, String>{
  'ara': 'Arabic',
  'chi': 'Chinese',
  'dut': 'Dutch',
  'eng': 'English',
  'fre': 'French',
  'ger': 'German',
  'ind': 'Indonesian',
  'ita': 'Italian',
  'jpn': 'Japanese',
  'kor': 'Korean',
  'may': 'Malay',
  'pol': 'Polish',
  'por': 'Portuguese',
  'rus': 'Russian',
  'spa': 'Spanish',
  'tha': 'Thai',
  'tur': 'Turkish',
  'vie': 'Vietnamese',
};

/// Whether [language] names English.
bool isEnglish(String language) =>
    _englishTags.contains(language.toLowerCase());

/// Guesses whether a track titled [title] is a "forced"/signs-only track.
///
/// This is a heuristic on purpose: media_kit surfaces `isDefault` but has no
/// `forced` field at all (see `_Track` in media_kit 1.2.6), even though mpv
/// tracks the property — so the muxed title is the only signal available.
/// Matches the conventions actually present in the library, e.g. this file's
/// "signs/songs" track.
bool looksForcedTitle(String title) {
  final t = title.toLowerCase();
  return t.contains('forced') || t.contains('signs');
}

/// Display label for [track] in the subtitle picker.
///
/// Combines language and title because neither alone disambiguates: a single
/// file can hold "English — Foxtrot" and "English — signs/songs", and the
/// 17-track releases repeat the same title across every language.
String subtitleLabel(SubtitleTrackInfo track) {
  final language = track.language.trim();
  final title = track.title.trim();
  final named = _languageNames[language.toLowerCase()] ?? language;

  final parts = <String>[
    if (named.isNotEmpty) named,
    if (title.isNotEmpty && title != named) title,
  ];
  // Nothing to show: fall back to the handle so entries stay distinguishable.
  if (parts.isEmpty) return 'Track ${track.id}';

  final label = parts.join(' — ');
  return track.isForced ? '$label (forced)' : label;
}

/// Picks the track to enable when a video opens, or null to start with
/// subtitles off.
///
/// English wins over the muxer's `default` flag, because that flag is not
/// trustworthy here: `[Foxtrot] Look Back (2024)` flags *both* its English and
/// its Japanese track as default, so honouring the flag first would pick
/// whichever the muxer happened to list earlier.
///
/// Forced tracks are also skipped when choosing automatically — a forced track
/// (e.g. that same file's "signs/songs") renders only on-screen text, not
/// dialogue, so auto-selecting it looks like broken subtitles. It stays
/// available in the picker.
///
/// Order: default-flagged English, then any English, then a default-flagged
/// track, then nothing. It deliberately never falls back to "first available":
/// silently defaulting an English reader into Thai is worse than no subtitles.
SubtitleTrackInfo? pickDefaultSubtitle(List<SubtitleTrackInfo> tracks) {
  final usable = tracks.where((t) => !t.isForced).toList();
  final english = usable.where((t) => isEnglish(t.language)).toList();

  for (final track in english) {
    if (track.isDefault) return track;
  }
  if (english.isNotEmpty) return english.first;
  for (final track in usable) {
    if (track.isDefault) return track;
  }
  return null;
}
