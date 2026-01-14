import React, { useState, useEffect, useRef } from 'react';
import { getImageScaleFactors, calculateViewBox } from '../utils/coordinateTransform';
import './PathMap.css'; // Share styles for now

const FloorMapViewer = ({
    floor,
    floorPlanData,
    pathData,
    language,
    pathAnimationProgress
}) => {
    const [currentFloorImage, setCurrentFloorImage] = useState(null);
    const [imageScaleFactors, setImageScaleFactors] = useState(null);
    const [svgViewBox, setSvgViewBox] = useState('0 0 1200 900');
    const [hoveredNode, setHoveredNode] = useState(null);
    const imageRef = useRef(null);

    // Check if this is space navigation data
    const isSpaceNavPath = pathData?.visualization?.svgPath || pathData?.path?.svgPath;

    // Formatters (copied/adapted from PathMap)
    const formatTime = (minutes) => {
        if (language === 'zh-HK' || language === 'zh-CN') {
            return `約 ${minutes} 分鐘`;
        }
        return `~ ${minutes} minutes`;
    };

    const formatFloorLabel = (floor) => {
        if (floor === null || floor === undefined) return '';
        if (floor === 0) return 'G/F';
        return `${floor}/F`;
    };

    const formatNodeName = (node) => {
        if (!node) return '';
        // Handle case where node is a string (from space navigation)
        if (typeof node === 'string') return node;
        if (node.displayName) return node.displayName;
        const source = node.name || node.id || '';
        const trimmed = source.replace(/^hsitp_/i, '');
        const lower = trimmed.toLowerCase();
        const floorSuffix = typeof node.floor === 'number' ? ` (${formatFloorLabel(node.floor)})` : '';
        const capitalize = (str) => str.replace(/\b\w/g, (char) => char.toUpperCase());

        if (lower.startsWith('zone_')) {
            const zone = lower.replace('zone_', '').padStart(2, '0');
            return `Zone ${zone}${floorSuffix}`;
        }
        if (lower.startsWith('corridor')) {
            const num = lower.split('_')[1] || '1';
            return `Corridor ${num}${floorSuffix}`;
        }
        if (lower.startsWith('lift_lobby')) {
            return `Lift Lobby${floorSuffix}`;
        }
        if (lower.startsWith('stairs')) {
            return `Staircase${floorSuffix}`;
        }
        return `${capitalize(trimmed.replace(/_/g, ' '))}${floorSuffix}`;
    };

    const getNodeCoordinates = (nodeId, floorNumber) => {
        if (!floorPlanData) return null;
        const floorInfo = floorPlanData.floors.find(f => f.floor === floorNumber);
        if (!floorInfo) return null;
        const node = floorInfo.nodes.find(n => n.id === nodeId);
        if (!node) return null;
        return { x: node.pixelX, y: node.pixelY };
    };

    const getWaypoints = (fromNodeId, toNodeId, floorNumber) => {
        if (!floorPlanData) return [];
        const floorInfo = floorPlanData.floors.find(f => f.floor === floorNumber);
        if (!floorInfo || !floorInfo.paths) return [];
        const pathDef = floorInfo.paths.find(p =>
            (p.from === fromNodeId && p.to === toNodeId) ||
            (p.from === toNodeId && p.to === fromNodeId)
        );
        return pathDef?.waypoints || [];
    };

    const createPathPoints = (start, end, waypoints = []) => {
        const hasAnchors = waypoints.length > 0 && waypoints.some(wp => wp.isAnchor);
        if (hasAnchors) {
            return waypoints.map(wp => ({
                x: wp.pixelX,
                y: wp.pixelY,
                isAnchor: wp.isAnchor
            }));
        }
        const points = [start];
        waypoints.forEach(wp => points.push({ x: wp.pixelX, y: wp.pixelY }));
        points.push(end);
        return points;
    };

    const generatePathString = (points, smooth = false) => {
        if (points.length === 0) return '';
        if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
        if (points.length === 2) {
            return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
        }
        if (!smooth) {
            return points.map((point, index) =>
                index === 0 ? `M ${point.x} ${point.y}` : `L ${point.x} ${point.y}`
            ).join(' ');
        }
        let path = `M ${points[0].x} ${points[0].y}`;
        for (let i = 0; i < points.length - 1; i++) {
            const p0 = points[Math.max(0, i - 1)];
            const p1 = points[i];
            const p2 = points[i + 1];
            const p3 = points[Math.min(points.length - 1, i + 2)];
            const tension = 0.3;
            const cp1x = p1.x + (p2.x - p0.x) * tension;
            const cp1y = p1.y + (p2.y - p0.y) * tension;
            const cp2x = p2.x - (p3.x - p1.x) * tension;
            const cp2y = p2.y - (p3.y - p1.y) * tension;
            path += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
        }
        return path;
    };

    // Find image for the floor
    useEffect(() => {
        if (!floorPlanData) return;
        const floorInfo = floorPlanData.floors.find(f => f.floor === floor);
        if (floorInfo && floorInfo.image) {
            setCurrentFloorImage(floorInfo.image.url);
        } else {
            // Fallback?
            console.warn(`FloorMapViewer: No image for floor ${floor}`);
        }
    }, [floor, floorPlanData]);

    // Update scale factors
    const updateScaleFactors = () => {
        if (imageRef.current && imageRef.current.complete) {
            const scaleFactors = getImageScaleFactors(imageRef.current);
            setImageScaleFactors(scaleFactors);
            const viewBox = calculateViewBox(scaleFactors.naturalWidth, scaleFactors.naturalHeight);
            setSvgViewBox(viewBox);
        }
    };

    useEffect(() => {
        updateScaleFactors();
        window.addEventListener('resize', updateScaleFactors);
        return () => window.removeEventListener('resize', updateScaleFactors);
    }, [currentFloorImage]);

    const renderSpaceNavPath = () => {
        if (!isSpaceNavPath) return null;

        const floorPaths = pathData.visualization?.floorPaths || {};
        const floorArrows = pathData.visualization?.floorArrows || {};

        // Use the prop 'floor' as the displayFloor
        const displayFloor = floor;

        // Select path for current floor
        // Fallback logic from original: if no specific floor path, maybe use global? 
        // But original logic: svgPath = floorPaths[displayFloor] || pathData.visualization?.svgPath
        // We should be careful. If it's multi-floor, using global path on WRONG floor is bad.
        // If floorPaths has keys, we expect this floor to be in it.

        let svgPath = floorPaths[displayFloor];
        if (!svgPath && Object.keys(floorPaths).length === 0) {
            // If no multi-floor paths defined at all, use global (legacy single floor)
            svgPath = pathData.visualization?.svgPath || pathData.path?.svgPath;
        }

        const arrows = floorArrows[displayFloor] || (Object.keys(floorArrows).length === 0 ? pathData.visualization?.arrows : []) || [];

        const animation = pathData.visualization?.animation || {};
        const destination = pathData.destination || {};
        const startFloor = pathData.from?.floor ?? 1;
        const endFloor = pathData.to?.floor ?? 1;
        const showStart = displayFloor === startFloor;
        const showEnd = displayFloor === endFloor;

        const startPoint = { x: pathData.from.pixelX || pathData.from.x, y: pathData.from.pixelY || pathData.from.y };
        const endPoint = { x: pathData.to.pixelX || pathData.to.x, y: pathData.to.pixelY || pathData.to.y };

        if (!svgPath) return null;

        const pathLength = animation.totalLength || 1000;
        const animatedDashOffset = pathLength * (1 - pathAnimationProgress / 100);

        return (
            <g className="space-nav-path">
                <path d={svgPath} stroke="#00c896" strokeWidth="10" strokeOpacity="0.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <path d={svgPath} stroke="url(#spaceNavGradient)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round"
                    strokeDasharray={pathLength} strokeDashoffset={animatedDashOffset} filter="url(#spaceNavGlow)"
                    className="space-nav-line" style={{ transition: 'stroke-dashoffset 0.1s linear' }} />
                {arrows.map((arrow, idx) => (
                    <g key={`arrow-${idx}`} transform={`translate(${arrow.x}, ${arrow.y}) rotate(${arrow.rotation})`}>
                        <path d={arrow.path || 'M -6 -4 L 0 0 L -6 4 Z'} fill="#00c896" stroke="white" strokeWidth="0.5" />
                    </g>
                ))}
                {showStart && (
                    <g className="start-marker">
                        <circle cx={startPoint.x} cy={startPoint.y} r="20" fill="#4CAF50" opacity="0.3" />
                        <circle cx={startPoint.x} cy={startPoint.y} r="14" fill="#4CAF50" stroke="white" strokeWidth="3" />
                        <text x={startPoint.x} y={startPoint.y + 5} textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">S</text>
                    </g>
                )}
                {showEnd && pathAnimationProgress >= 80 && (
                    <g className="end-marker" opacity={(pathAnimationProgress - 80) / 20}>
                        <circle cx={endPoint.x} cy={endPoint.y} r="22" fill="#F44336" opacity="0.3">
                            <animate attributeName="r" values="22;28;22" dur="1.5s" repeatCount="indefinite" />
                        </circle>
                        <circle cx={endPoint.x} cy={endPoint.y} r="16" fill="#F44336" stroke="white" strokeWidth="3" />
                        <text x={endPoint.x} y={endPoint.y + 5} textAnchor="middle" fill="white" fontSize="12" fontWeight="bold">E</text>
                        <text x={endPoint.x} y={endPoint.y - 30} textAnchor="middle" fill="white" fontSize="14" fontWeight="600" className="destination-label">
                            {destination.name || ''}
                        </text>
                    </g>
                )}
            </g>
        );
    };

    if (!currentFloorImage) return <div className="loading-floor">Loading floor {floor}...</div>;

    return (
        <div className="floor-map-viewer" style={{ position: 'relative', marginBottom: '20px' }}>
            <h4 style={{ color: '#ccc', margin: '0 0 10px 10px' }}>
                {language === 'en' ? `Floor ${floor}` : `第 ${floor} 層`}
            </h4>
            <div className="floor-plan-container">
                <img
                    ref={imageRef}
                    src={currentFloorImage}
                    alt={`Floor ${floor}`}
                    className="floor-plan-image"
                    onLoad={updateScaleFactors}
                    onError={(e) => console.error('Error loading floor plan image:', e)}
                />
                <svg
                    className="path-overlay"
                    viewBox={svgViewBox}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                >
                    <defs>
                        <linearGradient id="pathGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#667eea" stopOpacity="0.8" />
                            <stop offset="50%" stopColor="#764ba2" stopOpacity="0.9" />
                            <stop offset="100%" stopColor="#667eea" stopOpacity="0.8" />
                        </linearGradient>
                        <linearGradient id="spaceNavGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#00c896" stopOpacity="0.9" />
                            <stop offset="50%" stopColor="#00e5a0" stopOpacity="1" />
                            <stop offset="100%" stopColor="#00c896" stopOpacity="0.9" />
                        </linearGradient>
                        <filter id="glow">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                        <filter id="spaceNavGlow">
                            <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                        <marker id="arrowhead" markerWidth="12" markerHeight="12" refX="10" refY="3" orient="auto" markerUnits="strokeWidth">
                            <path d="M0,0 L0,6 L10,3 z" fill="#667eea" />
                        </marker>
                        <marker id="arrowheadAnimated" markerWidth="12" markerHeight="12" refX="10" refY="3" orient="auto" markerUnits="strokeWidth">
                            <path d="M0,0 L0,6 L10,3 z" fill="#764ba2">
                                <animate attributeName="fill" values="#764ba2;#667eea;#764ba2" dur="1s" repeatCount="indefinite" />
                            </path>
                        </marker>
                    </defs>

                    {isSpaceNavPath && renderSpaceNavPath()}

                    {!isSpaceNavPath && pathData.path.map((step, index) => {
                        const displayFloor = floor;
                        const isOnDisplayFloor = step.floor === displayFloor;
                        if (!isOnDisplayFloor && index < pathData.path.length - 1) {
                            const nextStep = pathData.path[index + 1];
                            if (nextStep.floor !== displayFloor) return null;
                        }
                        if (!isOnDisplayFloor && step.floor !== displayFloor) {
                            // Check if this step is part of a segment ending on this floor
                            // We iterate steps. We draw line FROM step TO nextStep
                            // If step is NOT on displayFloor, but nextStep IS on displayFloor, we might draw the line (Entry from other floor)
                            // But logic below:
                        }

                        const IsIncomingFloorChange = !isOnDisplayFloor && pathData.path[index + 1]?.floor === displayFloor;

                        if (!isOnDisplayFloor && !IsIncomingFloorChange) return null;

                        const coords = getNodeCoordinates(step.id, step.floor);

                        // Special handling for incoming floor change: we need coords of starting node? 
                        // No, if step is on Floor A, and nextStep is on Floor B.
                        // When rendering Floor B: we see step is NOT on B. But nextStep IS on B.
                        // We probably want to render the line from "Arrival Point" on Floor B??
                        // Or usually we don't render the line from the other floor.
                        // The original code says:
                        // "Include segment if either node is on this floor, or if it's a floor change segment"

                        if (!coords) return null; // If step node is not on this floor, we can't get coords from THIS floor plan usually?
                        // Unless floor plan has data for other floors? No.

                        // Actually, if step.floor != currentFloor, getNodeCoordinates(step.id, step.floor) looks up in step.floor.
                        // But we are rendering currentFloor.
                        // If we draw a line, we need x,y on currentFloor.
                        // If the node is on another floor, we can't draw it on this floor's map!

                        // Original logic:
                        /*
                            const segmentOnDisplayFloor =
                              (step.floor === displayFloor && nextFloorNumber === displayFloor) ||
                              (step.floor === displayFloor && nextStep.isFloorChange) ||
                              (nextFloorNumber === displayFloor && step.isFloorChange);
                        */

                        // If (step.floor === displayFloor && next.isFloorChange(to other)) -> Draw line to elevator (on this floor).
                        // If (step.floor === other && next.floor === displayFloor) -> Draw line FROM elevator (on this floor)?
                        // Wait, if step is on other floor, `coords` = getNodeCoordinates(step) will be coords on OTHER floor.
                        // We can't use those coords on THIS floor's SVG.

                        // So we only render steps that are ON this floor.
                        // Or if it's a floor change, maybe we render the "connector" icon?

                        if (step.floor !== displayFloor) return null; // Strict check for node rendering

                        const nodeLabel = formatNodeName(step);
                        const isStart = index === 0;
                        const isEnd = index === pathData.path.length - 1;

                        return (
                            <g key={`${step.id}-${index}`}>
                                {/* Line to next node */}
                                {index < pathData.path.length - 1 && (() => {
                                    const nextStep = pathData.path[index + 1];

                                    // Draw line if next step is ALSO on this floor
                                    if (nextStep.floor === displayFloor) {
                                        const nextCoords = getNodeCoordinates(nextStep.id, nextStep.floor);
                                        if (!nextCoords) return null;

                                        const waypoints = step.routeWaypoints || getWaypoints(step.id, nextStep.id, floor);
                                        const pathPoints = createPathPoints(coords, nextCoords, waypoints);
                                        const pathString = generatePathString(pathPoints);
                                        const usePolyline = waypoints && waypoints.length > 0;

                                        return (
                                            <>
                                                {usePolyline ? (
                                                    <path d={pathString} stroke="url(#pathGradient)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" filter="url(#glow)" />
                                                ) : (
                                                    <line x1={coords.x} y1={coords.y} x2={nextCoords.x} y2={nextCoords.y} stroke="url(#pathGradient)" strokeWidth="6" strokeLinecap="round" filter="url(#glow)" />
                                                )}
                                            </>
                                        );
                                    }
                                    // If next step is Floor Change (different floor)
                                    // We draw line to elevator/stairs? Yes, the node `step` is likely the elevator node.
                                    // So we don't need a line TO somewhere else, just the node itself is fine.
                                    // UNLESS the elevator is not the node itself?
                                    // Usually path is: Room -> Hall -> Elevator.
                                    // So Room->Hall (Line). Hall->Elevator (Line). Elevator (Floor 1) -> Elevator (Floor 2).
                                    // So rendering Elevator (Floor 1) node is enough.

                                    return null;
                                })()}

                                {/* Node Marker */}
                                <g onMouseEnter={() => setHoveredNode(step.id)} onMouseLeave={() => setHoveredNode(null)} style={{ cursor: 'pointer' }}>
                                    {(isStart || isEnd) && (
                                        <circle cx={coords.x} cy={coords.y} r="22" fill={isStart ? "#4CAF50" : "#F44336"} opacity="0.3" className="marker-glow" />
                                    )}
                                    <circle cx={coords.x} cy={coords.y} r={isStart || isEnd ? "18" : hoveredNode === step.id ? "14" : "12"}
                                        fill={isStart ? "#4CAF50" : isEnd ? "#F44336" : "#667eea"} stroke="#fff" strokeWidth="3"
                                        style={{ transition: 'r 0.2s ease', filter: hoveredNode === step.id ? 'url(#glow)' : 'none' }} />

                                    {(isStart || isEnd) ? (
                                        <text x={coords.x} y={coords.y + 6} textAnchor="middle" fill="#fff" fontSize="14" fontWeight="bold" pointerEvents="none">
                                            {isStart ? "S" : "E"}
                                        </text>
                                    ) : (
                                        <circle cx={coords.x} cy={coords.y} r="4" fill="#fff" pointerEvents="none" />
                                    )}

                                    {hoveredNode === step.id && (
                                        <g>
                                            <rect x={coords.x - Math.max(60, nodeLabel.length * 6)} y={coords.y - 40} width={Math.max(120, nodeLabel.length * 12)} height="35" rx="8" fill="rgba(0, 0, 0, 0.85)" />
                                            <text x={coords.x} y={coords.y - 20} textAnchor="middle" fill="#fff" fontSize="13" fontWeight="600" pointerEvents="none">{nodeLabel}</text>
                                        </g>
                                    )}
                                </g>
                            </g>
                        );
                    })}


                </svg>
            </div>
        </div>
    );
};

export default FloorMapViewer;
