/**
 * Global state for the Social Graph Viewer
 */

// Core graph objects
let graph = null;
let renderer = null;
let graphData = null;

// Display state
let labelsVisible = true;
let currentSpacing = 100;

// Highlighting state
let highlightedNodes = new Set();
let highlightedEdges = new Set();

// Path finder state
let pathFinderMode = false;
let pathFinderNodeA = null;
let pathFinderNodeB = null;
let startNodeId = null;  // The "you" node (depth 0)
let currentSelectedNode = null;

// Path selection state
let currentPaths = [];
let selectedPathIndex = -1;  // -1 means "all paths", 0+ means specific path
let currentPathEdgeDirections = new Map();  // Maps edge key to {source, target}

// Spacing state
let basePositions = {};
let graphCenter = { x: 0, y: 0 };
