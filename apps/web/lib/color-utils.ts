// Color detection and conversion utilities

/**
 * Check if a string is a valid hex color code
 */
export function isHexColor(str: string): boolean {
  const hexPattern = /^#?[0-9A-Fa-f]{6}$/;
  return hexPattern.test(str.trim());
}

/**
 * Parse hex color to RGB
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const cleaned = hex.replace("#", "").trim();
  if (cleaned.length !== 6) return null;
  
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  
  return { r, g, b };
}

/**
 * Common color name to hex mapping
 */
const COLOR_NAMES: Record<string, string> = {
  // Basic colors
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  green: "#00ff00",
  blue: "#0000ff",
  yellow: "#ffff00",
  cyan: "#00ffff",
  magenta: "#ff00ff",
  orange: "#ffa500",
  pink: "#ffc0cb",
  purple: "#800080",
  brown: "#a52a2a",
  gray: "#808080",
  grey: "#808080",
  
  // Extended colors
  navy: "#000080",
  maroon: "#800000",
  olive: "#808000",
  lime: "#00ff00",
  aqua: "#00ffff",
  teal: "#008080",
  silver: "#c0c0c0",
  fuchsia: "#ff00ff",
  
  // Shades
  darkred: "#8b0000",
  darkgreen: "#006400",
  darkblue: "#00008b",
  lightblue: "#add8e6",
  lightgreen: "#90ee90",
  lightgray: "#d3d3d3",
  lightgrey: "#d3d3d3",
  darkgray: "#a9a9a9",
  darkgrey: "#a9a9a9",
};

/**
 * Check if a string is a color name and return its hex value
 */
export function getColorNameHex(name: string): string | null {
  const normalized = name.toLowerCase().trim();
  return COLOR_NAMES[normalized] || null;
}

/**
 * Detect if a query is a color (hex or name) and return the hex value
 */
export function detectColor(query: string): string | null {
  const trimmed = query.trim();
  
  // Check if it's a hex color
  if (isHexColor(trimmed)) {
    return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
  }
  
  // Check if it's a color name
  const colorHex = getColorNameHex(trimmed);
  if (colorHex) {
    return colorHex;
  }
  
  return null;
}

/**
 * Get text color (black or white) based on background brightness
 */
export function getTextColor(r: number, g: number, b: number): "black" | "white" {
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness > 128 ? "black" : "white";
}
