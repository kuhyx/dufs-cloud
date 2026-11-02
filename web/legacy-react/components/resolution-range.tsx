interface ResolutionRangeProps {
  readonly minPixels: number | null;
  readonly maxPixels: number | null;
  readonly onChange: (
    minPixels: number | null,
    maxPixels: number | null,
  ) => void;
}

const PIXELS_PER_MP = 1_000_000;

/** Total pixels → a megapixel string, rounded to 1 decimal for tidy inputs. */
function mpValue(pixels: number | null): string {
  return pixels === null
    ? ""
    : String(Math.round((pixels / PIXELS_PER_MP) * 10) / 10);
}

/** A megapixel input string → total pixels, or null when the field is cleared. */
function pixelsFromMp(text: string): number | null {
  return text === "" ? null : Number(text) * PIXELS_PER_MP;
}

/**
 * The resolution filter: two megapixel number inputs bounding a media file's
 * total pixels (width × height, from the cloud index). Only meaningful for
 * images/videos, so {@link FilterBar} shows it just for those types.
 */
export function ResolutionRange({
  minPixels,
  maxPixels,
  onChange,
}: ResolutionRangeProps): React.JSX.Element {
  return (
    <div className="resrange">
      <input
        className="filter-size"
        type="number"
        min="0"
        placeholder="min MP"
        aria-label="Minimum resolution in megapixels"
        value={mpValue(minPixels)}
        onChange={(e) => {
          onChange(pixelsFromMp(e.target.value), maxPixels);
        }}
      />
      <input
        className="filter-size"
        type="number"
        min="0"
        placeholder="max MP"
        aria-label="Maximum resolution in megapixels"
        value={mpValue(maxPixels)}
        onChange={(e) => {
          onChange(minPixels, pixelsFromMp(e.target.value));
        }}
      />
    </div>
  );
}
