/**
 * Grid Service - Professional Grid Pattern System
 * 
 * Handles all grid-related calculations including:
 * - Converting GPS coordinates to grid points
 * - Calculating next target position
 * - Determining movement direction
 * - Distance validation for capture
 */

import { GpsLocation, GridPoint, GridDirection, GridConfig } from '../types';

// ============================================
// CONSTANTS
// ============================================

const EARTH_RADIUS_METERS = 6371000;
export const DEFAULT_CAPTURE_THRESHOLD_M = 1.0; // 1 meter threshold

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert degrees to radians
 */
const toRad = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * Convert radians to degrees
 */
const toDeg = (radians: number): number => (radians * 180) / Math.PI;

/**
 * Calculate distance between two GPS coordinates using Haversine formula
 */
export const calculateDistanceMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
};

/**
 * Calculate meters per degree for latitude (constant)
 */
const getLatitudeMetersPerDegree = (): number => 111320;

/**
 * Calculate meters per degree for longitude (varies by latitude)
 */
const getLongitudeMetersPerDegree = (lat: number): number => 
  111320 * Math.cos(toRad(lat));

// ============================================
// GRID CALCULATION FUNCTIONS
// ============================================

/**
 * Convert GPS coordinate to grid point (stepX, stepY)
 */
export const gpsToGridPoint = (
  lat: number,
  lon: number,
  anchorLat: number,
  anchorLon: number,
  spacingX: number,
  spacingY: number
): GridPoint => {
  const latScale = getLatitudeMetersPerDegree();
  const lonScale = getLongitudeMetersPerDegree(anchorLat);
  
  const deltaNorthM = (lat - anchorLat) * latScale;
  const deltaEastM = (lon - anchorLon) * lonScale;
  
  const stepX = Math.round(deltaEastM / spacingX);
  const stepY = Math.round(deltaNorthM / spacingY);
  
  return {
    lat,
    lon,
    stepX,
    stepY
  };
};

/**
 * Convert grid point (stepX, stepY) to GPS coordinate
 */
export const gridPointToGps = (
  stepX: number,
  stepY: number,
  anchorLat: number,
  anchorLon: number,
  spacingX: number,
  spacingY: number
): GridPoint => {
  const latScale = getLatitudeMetersPerDegree();
  const lonScale = getLongitudeMetersPerDegree(anchorLat);
  
  const deltaNorthM = stepY * spacingY;
  const deltaEastM = stepX * spacingX;
  
  return {
    lat: anchorLat + deltaNorthM / latScale,
    lon: anchorLon + deltaEastM / lonScale,
    stepX,
    stepY
  };
};

/**
 * Get the next grid point based on current position and desired direction
 */
export const getNextGridPoint = (
  currentStepX: number,
  currentStepY: number,
  direction: GridDirection
): GridPoint => {
  switch (direction) {
    case 'north':
      return { lat: 0, lon: 0, stepX: currentStepX, stepY: currentStepY + 1 };
    case 'south':
      return { lat: 0, lon: 0, stepX: currentStepX, stepY: currentStepY - 1 };
    case 'east':
      return { lat: 0, lon: 0, stepX: currentStepX + 1, stepY: currentStepY };
    case 'west':
      return { lat: 0, lon: 0, stepX: currentStepX - 1, stepY: currentStepY };
    case 'none':
    default:
      return { lat: 0, lon: 0, stepX: currentStepX, stepY: currentStepY };
  }
};

/**
 * Calculate which direction to move to reach target grid point
 */
export const calculateDirectionToPoint = (
  currentStepX: number,
  currentStepY: number,
  targetStepX: number,
  targetStepY: number
): GridDirection => {
  const dx = targetStepX - currentStepX;
  const dy = targetStepY - currentStepY;
  
  // Prioritize the larger movement
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? 'east' : dx < 0 ? 'west' : 'none';
  } else {
    return dy > 0 ? 'north' : dy < 0 ? 'south' : 'none';
  }
};

/**
 * Calculate distance from current position to target grid point
 */
export const calculateDistanceToTarget = (
  currentLat: number,
  currentLon: number,
  targetLat: number,
  targetLon: number
): number => {
  return calculateDistanceMeters(currentLat, currentLon, targetLat, targetLon);
};

/**
 * Check if current position is within capture threshold of target
 */
export const isWithinCaptureThreshold = (
  distanceMeters: number,
  threshold: number = DEFAULT_CAPTURE_THRESHOLD_M
): boolean => {
  return distanceMeters <= threshold;
};

/**
 * Validate GPS location
 */
export const isValidGpsLocation = (
  gps: GpsLocation | null | undefined
): gps is GpsLocation => {
  if (!gps) return false;
  if (typeof gps.lat !== 'number' || typeof gps.lon !== 'number') return false;
  if (!Number.isFinite(gps.lat) || !Number.isFinite(gps.lon)) return false;
  return Math.abs(gps.lat) <= 90 && Math.abs(gps.lon) <= 180;
};

/**
 * Create default grid config
 */
export const createDefaultGridConfig = (
  spacingX: number,
  spacingY: number
): GridConfig => ({
  spacingX,
  spacingY,
  captureThresholdM: DEFAULT_CAPTURE_THRESHOLD_M
});

/**
 * Format distance for display
 */
export const formatDistance = (meters: number): string => {
  if (meters < 1) {
    return `${Math.round(meters * 100)} cm`;
  }
  return `${meters.toFixed(1)} m`;
};

/**
 * Get direction arrow symbol
 */
export const getDirectionArrow = (direction: GridDirection): string => {
  switch (direction) {
    case 'north': return '↑';
    case 'south': return '↓';
    case 'east': return '→';
    case 'west': return '←';
    case 'none': return '●';
  }
};

/**
 * Get direction label
 */
export const getDirectionLabel = (direction: GridDirection): string => {
  switch (direction) {
    case 'north': return 'UTARA';
    case 'south': return 'SELATAN';
    case 'east': return 'TIMUR';
    case 'west': return 'BARAT';
    case 'none': return 'DI SINI';
  }
};

/**
 * Calculate all visible grid points around a center point
 * Returns a 3x3 grid of points (current + 8 neighbors)
 */
export const calculateVisibleGridPoints = (
  centerStepX: number,
  centerStepY: number,
  anchorLat: number,
  anchorLon: number,
  spacingX: number,
  spacingY: number,
  radius: number = 1
): GridPoint[] => {
  const points: GridPoint[] = [];
  
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const stepX = centerStepX + dx;
      const stepY = centerStepY + dy;
      const gps = gridPointToGps(stepX, stepY, anchorLat, anchorLon, spacingX, spacingY);
      points.push(gps);
    }
  }
  
  return points;
};

/**
 * Determine if a grid point has been visited
 */
export const isPointVisited = (
  stepX: number,
  stepY: number,
  visitedPoints: { stepX: number; stepY: number }[]
): boolean => {
  return visitedPoints.some(
    p => p.stepX === stepX && p.stepY === stepY
  );
};

