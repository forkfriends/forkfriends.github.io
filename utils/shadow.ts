import { Platform, ViewStyle } from 'react-native';

interface ShadowParams {
  color?: string;
  offsetX?: number;
  offsetY?: number;
  opacity?: number;
  radius?: number;
  elevation?: number;
}

/**
 * Creates cross-platform shadow styles.
 * Uses boxShadow for web (new API) and shadow* props for native.
 */
export function createShadow({
  color = '#000',
  offsetX = 0,
  offsetY = 2,
  opacity = 0.1,
  radius = 4,
  elevation = 2,
}: ShadowParams = {}): ViewStyle {
  if (Platform.OS === 'web') {
    // Convert opacity to rgba
    const rgba = hexToRgba(color, opacity);
    return {
      boxShadow: `${offsetX}px ${offsetY}px ${radius}px ${rgba}`,
    } as ViewStyle;
  }

  // Native platforms use the separate shadow props
  return {
    shadowColor: color,
    shadowOffset: { width: offsetX, height: offsetY },
    shadowOpacity: opacity,
    shadowRadius: radius,
    elevation,
  };
}

/**
 * Converts hex color to rgba string
 */
function hexToRgba(hex: string, alpha: number): string {
  // Handle shorthand hex
  let r = 0,
    g = 0,
    b = 0;

  if (hex.length === 4) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else if (hex.length === 7) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// Common shadow presets
export const shadows = {
  sm: createShadow({ offsetY: 1, radius: 2, opacity: 0.05, elevation: 1 }),
  md: createShadow({ offsetY: 2, radius: 4, opacity: 0.1, elevation: 2 }),
  lg: createShadow({ offsetY: 4, radius: 8, opacity: 0.15, elevation: 4 }),
  xl: createShadow({ offsetY: 8, radius: 16, opacity: 0.2, elevation: 8 }),
};
