import type { ColorOption } from '../components/ui/ContextMenu';

/**
 * Predefined color palette for node color labels.
 * Each color has a name (for display), a value (stored in the node),
 * and CSS colors for the swatch and the left border indicator.
 */
export const NODE_COLORS: ColorOption[] = [
  { name: 'Red',    value: 'red',    cssColor: '#ef4444' },
  { name: 'Orange', value: 'orange', cssColor: '#f97316' },
  { name: 'Yellow', value: 'yellow', cssColor: '#eab308' },
  { name: 'Green',  value: 'green',  cssColor: '#22c55e' },
  { name: 'Blue',   value: 'blue',   cssColor: '#3b82f6' },
  { name: 'Purple', value: 'purple', cssColor: '#a855f7' },
  { name: 'Gray',   value: 'gray',   cssColor: '#9ca3af' },
  { name: 'None',   value: '',       cssColor: 'transparent' },
];

/**
 * Map from color value to CSS color for the left border indicator.
 */
export const COLOR_CSS_MAP: Record<string, string> = Object.fromEntries(
  NODE_COLORS.filter(c => c.value).map(c => [c.value, c.cssColor])
);

/**
 * Get the CSS color for a node's color value.
 * Returns undefined if the color is not set or not recognized.
 */
export function getColorCss(color: string | undefined | null): string | undefined {
  if (!color) return undefined;
  return COLOR_CSS_MAP[color];
}
