import { DESIGN_WIDTH, DESIGN_HEIGHT } from './constants';

export interface ScaleInfo {
  scale: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

/** Returns rect params (x, y, w, h) in design coords that cover the entire canvas including letterbox */
export function fullScreenRect(info: ScaleInfo): { x: number; y: number; w: number; h: number } {
  const { scale, offsetX, offsetY, width, height } = info;
  return {
    x: -offsetX / scale,
    y: -offsetY / scale,
    w: width / scale,
    h: height / scale,
  };
}

/**
 * Calculates scale to fit design resolution into the actual screen,
 * maintaining aspect ratio with letterboxing.
 */
export function calculateScale(
  screenWidth: number,
  screenHeight: number,
): ScaleInfo {
  const scaleX = screenWidth / DESIGN_WIDTH;
  const scaleY = screenHeight / DESIGN_HEIGHT;
  const scale = Math.min(scaleX, scaleY);

  return {
    scale,
    offsetX: (screenWidth - DESIGN_WIDTH * scale) / 2,
    offsetY: (screenHeight - DESIGN_HEIGHT * scale) / 2,
    width: screenWidth,
    height: screenHeight,
  };
}
