import { markerColors, normalizeMarkerColor } from "../lib/workspaceModel.js";

function ColorSwatchPicker({ value, onChange, disabled = false, label = "Marker color", className = "" }) {
  const selectedColor = normalizeMarkerColor(value);

  return (
    <div className={`color-swatch-picker ${className}`.trim()} aria-label={label}>
      {markerColors.map((color) => (
        <button
          className={selectedColor === color.id ? "is-selected" : ""}
          data-marker-color={color.id}
          disabled={disabled}
          key={color.id}
          type="button"
          title={color.label}
          aria-label={color.label}
          aria-pressed={selectedColor === color.id}
          onClick={(event) => {
            event.stopPropagation();
            onChange(color.id);
          }}
        >
          <span aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

export default ColorSwatchPicker;
