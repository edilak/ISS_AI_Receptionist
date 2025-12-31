/**
 * GridPathSmoother - Converts grid paths to smooth Bezier curves
 * 
 * This module takes a sequence of grid cells from the RL agent's path
 * and converts it into smooth, visually appealing curves using
 * Catmull-Rom splines and Bezier curve conversion.
 */

class GridPathSmoother {
  constructor(options = {}) {
    this.tension = options.tension || 0.5;        // Catmull-Rom tension (0-1)
    this.simplifyThreshold = options.simplifyThreshold || 0.5; // Douglas-Peucker threshold
    this.smoothingIterations = options.smoothingIterations || 2;
    this.segmentDensity = options.segmentDensity || 20; // Points per segment
  }

  /**
   * Smooth a grid path to pixel coordinates with Bezier curves
   * @param {Array} gridPath - Array of {x, y} grid coordinates
   * @param {GridGenerator} gridGenerator - For coordinate conversion
   * @returns {Object} Smoothed path data
   */
  smooth(gridPath, gridGenerator) {
    if (!gridPath || gridPath.length < 2) {
      return { points: [], svgPath: '', bezierCurves: [] };
    }

    // Convert grid coordinates to pixel coordinates
    const pixelPath = gridPath.map(p => gridGenerator.gridToPixel(p.x, p.y));

    // Simplify path (remove redundant points)
    const simplified = this.simplifyPath(pixelPath);

    // If only 2 points, return straight line
    if (simplified.length === 2) {
      return this.createStraightLine(simplified);
    }

    // Generate Catmull-Rom spline points
    const splinePoints = this.catmullRomSpline(simplified);

    // Convert to cubic Bezier curves for SVG
    const bezierCurves = this.toBezierCurves(simplified);

    // Generate SVG path string
    const svgPath = this.generateSVGPath(bezierCurves);

    return {
      originalPoints: pixelPath.length,
      simplifiedPoints: simplified.length,
      points: splinePoints,
      bezierCurves,
      svgPath,
      totalLength: this.calculatePathLength(splinePoints)
    };
  }

  /**
   * Simplify path using Douglas-Peucker algorithm
   * @param {Array} points - Array of {x, y} points
   * @returns {Array} Simplified points
   */
  simplifyPath(points) {
    if (points.length <= 2) return points;

    // Find the point with maximum distance from line between first and last
    let maxDist = 0;
    let maxIndex = 0;
    const first = points[0];
    const last = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const dist = this.perpendicularDistance(points[i], first, last);
      if (dist > maxDist) {
        maxDist = dist;
        maxIndex = i;
      }
    }

    // If max distance is greater than threshold, recursively simplify
    if (maxDist > this.simplifyThreshold) {
      const left = this.simplifyPath(points.slice(0, maxIndex + 1));
      const right = this.simplifyPath(points.slice(maxIndex));
      return [...left.slice(0, -1), ...right];
    }

    // Return endpoints only
    return [first, last];
  }

  /**
   * Calculate perpendicular distance from point to line
   * @param {Object} point - Point {x, y}
   * @param {Object} lineStart - Line start {x, y}
   * @param {Object} lineEnd - Line end {x, y}
   * @returns {number} Distance
   */
  perpendicularDistance(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    
    const lineLengthSq = dx * dx + dy * dy;
    
    if (lineLengthSq === 0) {
      return Math.sqrt(
        Math.pow(point.x - lineStart.x, 2) + 
        Math.pow(point.y - lineStart.y, 2)
      );
    }

    const t = Math.max(0, Math.min(1, 
      ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lineLengthSq
    ));

    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;

    return Math.sqrt(
      Math.pow(point.x - projX, 2) + 
      Math.pow(point.y - projY, 2)
    );
  }

  /**
   * Generate Catmull-Rom spline points
   * @param {Array} controlPoints - Control points
   * @returns {Array} Spline points
   */
  catmullRomSpline(controlPoints) {
    if (controlPoints.length < 2) return controlPoints;
    if (controlPoints.length === 2) {
      return this.interpolateLinear(controlPoints[0], controlPoints[1]);
    }

    const points = [];
    const alpha = 0.5; // Centripetal (0.5) or chordal (1) parameterization

    // Add phantom points for smooth ends
    const p = [
      this.extrapolatePoint(controlPoints[1], controlPoints[0]),
      ...controlPoints,
      this.extrapolatePoint(controlPoints[controlPoints.length - 2], controlPoints[controlPoints.length - 1])
    ];

    // Generate spline for each segment
    for (let i = 1; i < p.length - 2; i++) {
      const segmentPoints = this.catmullRomSegment(
        p[i - 1], p[i], p[i + 1], p[i + 2],
        this.segmentDensity, alpha
      );
      
      // Avoid duplicating points at segment boundaries
      if (points.length > 0 && segmentPoints.length > 0) {
        segmentPoints.shift();
      }
      points.push(...segmentPoints);
    }

    return points;
  }

  /**
   * Generate points for a single Catmull-Rom segment
   */
  catmullRomSegment(p0, p1, p2, p3, segments, alpha) {
    const points = [];

    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      
      // Catmull-Rom formula
      const t2 = t * t;
      const t3 = t2 * t;

      const x = 0.5 * (
        (2 * p1.x) +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3
      );

      const y = 0.5 * (
        (2 * p1.y) +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3
      );

      points.push({ x, y });
    }

    return points;
  }

  /**
   * Extrapolate a phantom point for smooth spline ends
   */
  extrapolatePoint(from, to) {
    return {
      x: 2 * to.x - from.x,
      y: 2 * to.y - from.y
    };
  }

  /**
   * Linear interpolation between two points
   */
  interpolateLinear(p1, p2, segments = 10) {
    const points = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      points.push({
        x: p1.x + (p2.x - p1.x) * t,
        y: p1.y + (p2.y - p1.y) * t
      });
    }
    return points;
  }

  /**
   * Convert control points to cubic Bezier curves
   * @param {Array} controlPoints - Control points
   * @returns {Array} Array of Bezier curve objects
   */
  toBezierCurves(controlPoints) {
    if (controlPoints.length < 2) return [];

    const curves = [];

    // For each pair of points, create a cubic Bezier curve
    for (let i = 0; i < controlPoints.length - 1; i++) {
      const p0 = controlPoints[i];
      const p3 = controlPoints[i + 1];

      // Calculate control points for smooth transition
      let p1, p2;

      if (i === 0) {
        // First segment: use next point for direction
        const next = controlPoints[i + 1];
        const tangent = { x: (next.x - p0.x) / 3, y: (next.y - p0.y) / 3 };
        p1 = { x: p0.x + tangent.x, y: p0.y + tangent.y };
      } else {
        // Use previous and next points for smooth tangent
        const prev = controlPoints[i - 1];
        const next = controlPoints[i + 1];
        const tangent = { 
          x: (next.x - prev.x) / 6, 
          y: (next.y - prev.y) / 6 
        };
        p1 = { x: p0.x + tangent.x, y: p0.y + tangent.y };
      }

      if (i === controlPoints.length - 2) {
        // Last segment: use previous point for direction
        const prev = controlPoints[i];
        const tangent = { x: (p3.x - prev.x) / 3, y: (p3.y - prev.y) / 3 };
        p2 = { x: p3.x - tangent.x, y: p3.y - tangent.y };
      } else {
        // Use current and next-next points for smooth tangent
        const curr = controlPoints[i + 1];
        const nextNext = controlPoints[i + 2];
        const tangent = { 
          x: (nextNext.x - p0.x) / 6, 
          y: (nextNext.y - p0.y) / 6 
        };
        p2 = { x: p3.x - tangent.x, y: p3.y - tangent.y };
      }

      curves.push({ p0, p1, p2, p3 });
    }

    return curves;
  }

  /**
   * Generate SVG path string from Bezier curves
   * @param {Array} curves - Array of Bezier curve objects
   * @returns {string} SVG path data string
   */
  generateSVGPath(curves) {
    if (curves.length === 0) return '';

    let path = `M ${curves[0].p0.x} ${curves[0].p0.y}`;

    for (const curve of curves) {
      path += ` C ${curve.p1.x} ${curve.p1.y}, ${curve.p2.x} ${curve.p2.y}, ${curve.p3.x} ${curve.p3.y}`;
    }

    return path;
  }

  /**
   * Create straight line path data
   * @param {Array} points - Two points
   * @returns {Object} Path data
   */
  createStraightLine(points) {
    const [start, end] = points;
    return {
      originalPoints: 2,
      simplifiedPoints: 2,
      points: [start, end],
      bezierCurves: [{
        p0: start,
        p1: { x: start.x + (end.x - start.x) / 3, y: start.y + (end.y - start.y) / 3 },
        p2: { x: start.x + (end.x - start.x) * 2 / 3, y: start.y + (end.y - start.y) * 2 / 3 },
        p3: end
      }],
      svgPath: `M ${start.x} ${start.y} L ${end.x} ${end.y}`,
      totalLength: Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2))
    };
  }

  /**
   * Calculate total path length
   * @param {Array} points - Path points
   * @returns {number} Total length in pixels
   */
  calculatePathLength(points) {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
      length += Math.sqrt(
        Math.pow(points[i].x - points[i - 1].x, 2) +
        Math.pow(points[i].y - points[i - 1].y, 2)
      );
    }
    return length;
  }

  /**
   * Get point at distance along path
   * @param {Array} points - Path points
   * @param {number} distance - Distance from start
   * @returns {Object} Point and direction at distance
   */
  getPointAtDistance(points, distance) {
    let accumulated = 0;

    for (let i = 1; i < points.length; i++) {
      const segmentLength = Math.sqrt(
        Math.pow(points[i].x - points[i - 1].x, 2) +
        Math.pow(points[i].y - points[i - 1].y, 2)
      );

      if (accumulated + segmentLength >= distance) {
        const t = (distance - accumulated) / segmentLength;
        const x = points[i - 1].x + (points[i].x - points[i - 1].x) * t;
        const y = points[i - 1].y + (points[i].y - points[i - 1].y) * t;
        
        // Calculate direction
        const dx = points[i].x - points[i - 1].x;
        const dy = points[i].y - points[i - 1].y;
        const angle = Math.atan2(dy, dx) * 180 / Math.PI;

        return { x, y, angle };
      }

      accumulated += segmentLength;
    }

    // Return last point
    const last = points[points.length - 1];
    const prev = points[points.length - 2] || last;
    const angle = Math.atan2(last.y - prev.y, last.x - prev.x) * 180 / Math.PI;
    return { ...last, angle };
  }

  /**
   * Generate evenly spaced points along path for markers/arrows
   * @param {Array} points - Path points
   * @param {number} spacing - Distance between markers
   * @returns {Array} Marker positions with angles
   */
  generateMarkerPositions(points, spacing = 50) {
    const markers = [];
    const totalLength = this.calculatePathLength(points);

    for (let dist = 0; dist <= totalLength; dist += spacing) {
      markers.push(this.getPointAtDistance(points, dist));
    }

    return markers;
  }

  /**
   * Generate direction arrows along path
   * @param {Object} smoothedPath - Result from smooth()
   * @param {number} arrowSpacing - Distance between arrows
   * @returns {Array} Arrow data for rendering
   */
  generateDirectionArrows(smoothedPath, arrowSpacing = 100) {
    if (!smoothedPath.points || smoothedPath.points.length < 2) {
      return [];
    }

    const markers = this.generateMarkerPositions(smoothedPath.points, arrowSpacing);
    
    // Skip first and last markers
    return markers.slice(1, -1).map(marker => ({
      x: marker.x,
      y: marker.y,
      rotation: marker.angle,
      // SVG arrow path
      path: 'M -8 -6 L 0 0 L -8 6 Z'
    }));
  }

  /**
   * Generate animation data for path drawing
   * @param {Object} smoothedPath - Result from smooth()
   * @returns {Object} Animation data
   */
  generateAnimationData(smoothedPath) {
    return {
      svgPath: smoothedPath.svgPath,
      totalLength: smoothedPath.totalLength,
      strokeDasharray: smoothedPath.totalLength,
      strokeDashoffset: smoothedPath.totalLength, // Start hidden
      animationDuration: Math.max(1, smoothedPath.totalLength / 500), // 500px per second
      keyframes: [
        { offset: 0, strokeDashoffset: smoothedPath.totalLength },
        { offset: 1, strokeDashoffset: 0 }
      ]
    };
  }
}

module.exports = GridPathSmoother;

