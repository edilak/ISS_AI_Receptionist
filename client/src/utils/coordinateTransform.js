/**
 * Coordinate Transformation Utilities
 * Handles conversion between pixel, real-world, and SVG coordinate systems
 */

/**
 * Get actual image dimensions and calculate scale factors
 * @param {HTMLImageElement} imgElement - The image element
 * @returns {Object} Scale factors and dimensions
 */
export function getImageScaleFactors(imgElement) {
  if (!imgElement) {
    return {
      scaleX: 1,
      scaleY: 1,
      naturalWidth: 0,
      naturalHeight: 0,
      displayWidth: 0,
      displayHeight: 0
    };
  }

  const imgRect = imgElement.getBoundingClientRect();
  const naturalWidth = imgElement.naturalWidth || imgElement.width;
  const naturalHeight = imgElement.naturalHeight || imgElement.height;
  const displayWidth = imgRect.width;
  const displayHeight = imgRect.height;

  const scaleX = displayWidth / naturalWidth;
  const scaleY = displayHeight / naturalHeight;

  return {
    scaleX,
    scaleY,
    naturalWidth,
    naturalHeight,
    displayWidth,
    displayHeight
  };
}

/**
 * Transform pixel coordinates to SVG coordinates
 * @param {number} pixelX - X coordinate in pixel space
 * @param {number} pixelY - Y coordinate in pixel space
 * @param {Object} scaleFactors - Scale factors from getImageScaleFactors
 * @returns {Object} Transformed coordinates {x, y}
 */
export function transformPixelToSVG(pixelX, pixelY, scaleFactors) {
  return {
    x: pixelX * scaleFactors.scaleX,
    y: pixelY * scaleFactors.scaleY
  };
}

/**
 * Transform SVG coordinates back to pixel coordinates
 * @param {number} svgX - X coordinate in SVG space
 * @param {number} svgY - Y coordinate in SVG space
 * @param {Object} scaleFactors - Scale factors from getImageScaleFactors
 * @returns {Object} Pixel coordinates {pixelX, pixelY}
 */
export function transformSVGToPixel(svgX, svgY, scaleFactors) {
  return {
    pixelX: svgX / scaleFactors.scaleX,
    pixelY: svgY / scaleFactors.scaleY
  };
}

/**
 * Get click coordinates relative to image
 * @param {MouseEvent} event - Mouse click event
 * @param {HTMLImageElement} imgElement - The image element
 * @returns {Object} Pixel coordinates {pixelX, pixelY} relative to natural image size
 */
export function getImageClickCoordinates(event, imgElement) {
  if (!imgElement) return { pixelX: 0, pixelY: 0 };

  const rect = imgElement.getBoundingClientRect();
  const naturalWidth = imgElement.naturalWidth || imgElement.width;
  const naturalHeight = imgElement.naturalHeight || imgElement.height;
  const displayWidth = rect.width;
  const displayHeight = rect.height;

  // Get click position relative to image
  const clickX = event.clientX - rect.left;
  const clickY = event.clientY - rect.top;

  // Convert to natural image coordinates
  const scaleX = naturalWidth / displayWidth;
  const scaleY = naturalHeight / displayHeight;

  return {
    pixelX: Math.round(clickX * scaleX),
    pixelY: Math.round(clickY * scaleY)
  };
}

/**
 * Calculate SVG viewBox based on image dimensions
 * @param {number} width - Image width
 * @param {number} height - Image height
 * @returns {string} SVG viewBox string
 */
export function calculateViewBox(width, height) {
  return `0 0 ${width} ${height}`;
}

/**
 * Validate coordinates are within image bounds
 * @param {number} pixelX - X coordinate
 * @param {number} pixelY - Y coordinate
 * @param {number} imageWidth - Image width
 * @param {number} imageHeight - Image height
 * @returns {boolean} True if coordinates are valid
 */
export function validateCoordinates(pixelX, pixelY, imageWidth, imageHeight) {
  return (
    pixelX >= 0 &&
    pixelX <= imageWidth &&
    pixelY >= 0 &&
    pixelY <= imageHeight
  );
}

/**
 * Calculate distance between two points
 * @param {Object} point1 - First point {x, y}
 * @param {Object} point2 - Second point {x, y}
 * @returns {number} Distance in pixels
 */
export function calculateDistance(point1, point2) {
  const dx = point2.x - point1.x;
  const dy = point2.y - point1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Create waypoints for a path following corridors
 * @param {Object} from - Start point {pixelX, pixelY}
 * @param {Object} to - End point {pixelX, pixelY}
 * @param {Array} corridorPoints - Array of corridor waypoints
 * @returns {Array} Array of waypoint objects
 */
export function createCorridorWaypoints(from, to, corridorPoints = []) {
  const waypoints = [];
  
  // Add start point
  waypoints.push({ pixelX: from.pixelX, pixelY: from.pixelY });
  
  // Add corridor waypoints if provided
  if (corridorPoints.length > 0) {
    waypoints.push(...corridorPoints);
  }
  
  // Add end point
  waypoints.push({ pixelX: to.pixelX, pixelY: to.pixelY });
  
  return waypoints;
}

