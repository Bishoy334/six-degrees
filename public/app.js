let graph;
let renderer;
let graphData;
let labelsVisible = true;
let currentSpacing = 100;
let highlightedNodes = new Set();
let highlightedEdges = new Set();

// Path finder state
let pathFinderMode = false;
let pathFinderNodeA = null;
let pathFinderNodeB = null;
let startNodeId = null;  // The "you" node (depth 0)
let currentSelectedNode = null;  // Currently selected node for "paths to me" feature

// Path finding configuration
const PATH_CONFIG = {
  maxPaths: 10,           // Maximum number of paths to find
  maxPathLength: 10,      // Maximum length of any single path (to avoid very long detours)
};

// Store current paths for selection
let currentPaths = [];
let selectedPathIndex = -1;  // -1 means "all paths", 0+ means specific path
let currentPathEdgeDirections = new Map();  // Maps edge key to {source, target} for arrow direction

const depthColors = {
  0: '#ff6b6b',  // You (red)
  1: '#7f8cff',  // Friends (blue)
  2: '#4ecdc4',  // Friends of friends (teal)
  3: '#f7b731',  // Deeper (yellow)
};

// ForceAtlas2 settings will be computed dynamically based on graph size
function getForceAtlasSettings(nodeCount) {
  // Scale iterations and repulsion based on graph size
  const isLarge = nodeCount > 1000;
  const isVeryLarge = nodeCount > 3000;

  return {
    iterations: isVeryLarge ? 500 : (isLarge ? 400 : 300),
    settings: {
      gravity: 0.1,                    // Very low gravity = much more spread
      scalingRatio: isVeryLarge ? 200 : (isLarge ? 100 : 50),  // Strong repulsion
      strongGravityMode: false,
      slowDown: 1,
      barnesHutOptimize: true,
      barnesHutTheta: 0.5,
      adjustSizes: true,               // Consider node sizes to prevent overlap
      linLogMode: true,                // Better for large graphs
      outboundAttractionDistribution: true,
    }
  };
}

// Store base positions for spacing adjustments
let basePositions = {};
let graphCenter = { x: 0, y: 0 };

// Layout algorithms - all compute positions deterministically (no overlap!)
const layouts = {
  // Radial: You in center, friends in rings by depth
  radial: function(nodes, spacing) {
    const byDepth = {};
    nodes.forEach(n => {
      if (!byDepth[n.depth]) byDepth[n.depth] = [];
      byDepth[n.depth].push(n);
    });

    const positions = {};
    const spacingMult = spacing / 100;
    const baseRadius = 200 * spacingMult;

    Object.keys(byDepth).sort((a, b) => a - b).forEach(depth => {
      const depthNodes = byDepth[depth];
      const d = parseInt(depth);

      if (d === 0) {
        // Center node
        depthNodes.forEach(n => {
          positions[n.id] = { x: 0, y: 0 };
        });
      } else {
        // Arrange in a circle
        const radius = baseRadius * d * 1.5;
        const angleStep = (2 * Math.PI) / depthNodes.length;
        // Add some randomness to prevent perfect alignment
        const angleOffset = Math.random() * Math.PI * 2;

        depthNodes.forEach((n, i) => {
          const angle = angleOffset + i * angleStep;
          positions[n.id] = {
            x: Math.cos(angle) * radius,
            y: Math.sin(angle) * radius
          };
        });
      }
    });

    return positions;
  },

  // Spiral: All nodes in a spiral pattern
  spiral: function(nodes, spacing) {
    const positions = {};
    const spacingMult = spacing / 100;
    const a = 10 * spacingMult;  // Spiral tightness
    const b = 30 * spacingMult;  // Spacing between turns

    // Sort by depth, then by name for consistency
    const sorted = [...nodes].sort((x, y) => {
      if (x.depth !== y.depth) return x.depth - y.depth;
      return x.name.localeCompare(y.name);
    });

    sorted.forEach((n, i) => {
      const angle = 0.5 * Math.sqrt(i) * Math.PI;
      const radius = a + b * angle;
      positions[n.id] = {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
      };
    });

    return positions;
  },

  // Grid: Simple grid layout by depth
  grid: function(nodes, spacing) {
    const positions = {};
    const spacingMult = spacing / 100;
    const cellSize = 80 * spacingMult;

    // Group by depth
    const byDepth = {};
    nodes.forEach(n => {
      if (!byDepth[n.depth]) byDepth[n.depth] = [];
      byDepth[n.depth].push(n);
    });

    let yOffset = 0;
    Object.keys(byDepth).sort((a, b) => a - b).forEach(depth => {
      const depthNodes = byDepth[depth];
      const cols = Math.ceil(Math.sqrt(depthNodes.length));
      const rows = Math.ceil(depthNodes.length / cols);

      depthNodes.forEach((n, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        positions[n.id] = {
          x: (col - cols / 2) * cellSize,
          y: yOffset + row * cellSize
        };
      });

      yOffset += (rows + 2) * cellSize;
    });

    return positions;
  },

  // Cluster: Group connected nodes together
  cluster: function(nodes, spacing) {
    const positions = {};
    const spacingMult = spacing / 100;

    // Start with radial as base
    const radialPos = layouts.radial(nodes, spacing);

    // Then adjust to cluster connected nodes
    // Simple: just add some jitter based on connections
    nodes.forEach(n => {
      const base = radialPos[n.id];
      const jitterX = (Math.random() - 0.5) * 100 * spacingMult;
      const jitterY = (Math.random() - 0.5) * 100 * spacingMult;
      positions[n.id] = {
        x: base.x + jitterX,
        y: base.y + jitterY
      };
    });

    return positions;
  }
};

async function init() {
  try {
    // Log library availability
    console.log('Library check:');
    console.log('  - graphology:', typeof graphology !== 'undefined' ? 'loaded' : 'NOT FOUND');
    console.log('  - Sigma:', typeof Sigma !== 'undefined' ? 'loaded' : 'NOT FOUND');
    console.log('  - ForceAtlas2:', typeof ForceAtlas2 !== 'undefined' ? 'ForceAtlas2' :
                (typeof forceAtlas2 !== 'undefined' ? 'forceAtlas2' : 'NOT FOUND'));
    console.log('  - noverlap:', typeof noverlap !== 'undefined' ? 'noverlap' :
                (typeof Noverlap !== 'undefined' ? 'Noverlap' : 'NOT FOUND'));

    setLoadingText('Fetching graph data...');
    const response = await fetch('/api/graph');
    graphData = await response.json();

    if (!graphData.nodes || graphData.nodes.length === 0) {
      document.getElementById('loading').innerHTML = `
        <div style="text-align: center; color: #aaa;">
          <h2 style="color: #7f8cff; margin-bottom: 20px;">No Data Yet</h2>
          <p>Run <code style="background: #2a2a4a; padding: 4px 8px; border-radius: 4px;">npm run scrape</code> first</p>
        </div>
      `;
      return;
    }

    setLoadingText(`Building graph with ${graphData.nodes.length} nodes...`);

    // Create Graphology graph - use DirectedGraph so we can control arrow direction
    graph = new graphology.DirectedGraph();

    // Start with radial layout as initial positions (ForceAtlas2 will refine these)
    const initialPositions = layouts.radial(graphData.nodes, currentSpacing);

    // Add nodes with pre-computed positions
    graphData.nodes.forEach(node => {
      const pos = initialPositions[node.id] || { x: Math.random() * 1000, y: Math.random() * 1000 };
      const depth = node.depth || 0;

      // Track the start node (depth 0 = you)
      if (depth === 0) {
        startNodeId = node.id;
        console.log('Start node (you) identified:', startNodeId);
      }

      graph.addNode(node.id, {
        label: node.name,
        x: pos.x,
        y: pos.y,
        size: depth === 0 ? 15 : Math.max(4, 10 - depth * 2),
        color: depthColors[depth] || '#888',
        depth: depth,
        url: node.url,
        originalColor: depthColors[depth] || '#888',
      });
    });

    setLoadingText(`Adding ${graphData.edges.length} connections...`);

    // Add edges in both directions (so traversal works both ways)
    // This allows us to control arrow direction when highlighting paths
    graphData.edges.forEach((edge, i) => {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        // Add edge in both directions for bidirectional traversal
        if (!graph.hasDirectedEdge(edge.source, edge.target)) {
          graph.addDirectedEdge(edge.source, edge.target, {
            size: 0.3,
            color: 'rgba(100, 100, 150, 0.08)',  // Very faint by default
          });
        }
        if (!graph.hasDirectedEdge(edge.target, edge.source)) {
          graph.addDirectedEdge(edge.target, edge.source, {
            size: 0.3,
            color: 'rgba(100, 100, 150, 0.08)',  // Very faint by default
          });
        }
      }
    });

    // Apply ForceAtlas2 layout to minimize edge crossings
    const nodeCount = graphData.nodes.length;
    setLoadingText(`Optimizing layout for ${nodeCount} nodes (this may take a moment)...`);
    applyInitialForceAtlasLayout();

    setLoadingText('Rendering...');

    // Create Sigma renderer
    const container = document.getElementById('graph-container');
    renderer = new Sigma(graph, container, {
      // Rendering settings for performance
      renderLabels: labelsVisible,
      labelRenderedSizeThreshold: 6,  // Only show labels for nodes this size or larger
      labelDensity: 0.5,  // Reduce label density
      labelGridCellSize: 100,
      minCameraRatio: 0.01,
      maxCameraRatio: 10,

      // Label styling
      labelColor: { color: '#ffffff' },  // White labels for normal state
      labelFont: 'Arial, sans-serif',
      labelSize: 12,
      labelHoverColor: { color: '#1a1a2e' },  // Dark text on hover (white background)

      // Enable edge arrows
      defaultEdgeType: 'line',
      renderEdgeLabels: false,

      // Node settings
      defaultNodeColor: '#888',
      nodeReducer: (node, data) => {
        const res = { ...data };
        // Dim non-highlighted nodes when something is highlighted
        if (highlightedNodes.size > 0 && !highlightedNodes.has(node)) {
          res.color = 'rgba(100, 100, 120, 0.25)';
          res.label = '';
          res.size = Math.max(2, (data.size || 5) * 0.5);  // Shrink dimmed nodes
        } else if (highlightedNodes.size > 0 && highlightedNodes.has(node)) {
          // Make highlighted nodes MUCH more prominent
          res.color = '#ffcc00';  // Bright yellow/gold
          res.size = Math.max(15, (data.size || 5) * 2);  // Make them bigger
          res.zIndex = 10;
        }
        return res;
      },
      edgeReducer: (edge, data) => {
        const res = { ...data };
        // Hide non-highlighted edges when something is highlighted
        if (highlightedEdges.size > 0 && !highlightedEdges.has(edge)) {
          res.hidden = true;  // Completely hide non-highlighted edges
        } else if (highlightedEdges.has(edge)) {
          res.color = '#f7b731';  // Gold for highlighted
          res.size = 2;
          // Add arrow if we have direction info for this edge
          if (currentPathEdgeDirections.has(edge)) {
            res.type = 'arrow';
          }
        }
        return res;
      }
    });

    // Click handler for nodes
    renderer.on('clickNode', ({ node }) => {
      if (pathFinderMode) {
        handlePathFinderClick(node);
      } else {
        currentSelectedNode = node;
        showNodeInfo(node);
        highlightNode(node);
      }
    });

    // Click on background to clear
    renderer.on('clickStage', () => {
      if (!pathFinderMode) {
        resetHighlight();
        hideNodeInfo();
        currentSelectedNode = null;
      }
    });

    // Update stats
    updateStats();

    // Setup controls
    setupControls();

    // Hide loading
    document.getElementById('loading').style.display = 'none';

    // Initial fit
    setTimeout(fitToScreen, 100);

  } catch (error) {
    console.error('Error initializing graph:', error);
    document.getElementById('loading').innerHTML = `
      <div style="text-align: center; color: #ff6b6b;">
        <h2 style="margin-bottom: 20px;">Error Loading Graph</h2>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function setLoadingText(text) {
  const el = document.getElementById('loading-text');
  if (el) el.textContent = text;
}

function setupControls() {
  // Search
  document.getElementById('search').addEventListener('input', handleSearch);

  // Layout select
  document.getElementById('layout-select').addEventListener('change', applyLayout);

  // Spacing slider - dynamically scales node positions
  document.getElementById('spacing-slider').addEventListener('input', (e) => {
    currentSpacing = parseInt(e.target.value);
    document.getElementById('spacing-val').textContent = currentSpacing + '%';
    applySpacing();
  });

  // Depth filter
  const maxDepth = Math.max(...graphData.nodes.map(n => n.depth));
  const depthFilter = document.getElementById('depth-filter');
  depthFilter.max = maxDepth + 1;
  depthFilter.value = maxDepth + 1;
  depthFilter.addEventListener('input', handleDepthFilter);
}

function updateStats() {
  const maxDepth = Math.max(...graphData.nodes.map(n => n.depth));
  document.getElementById('stats').innerHTML = `
    <strong>${graphData.nodes.length}</strong> people &nbsp;|&nbsp;
    <strong>${graphData.edges.length}</strong> connections<br>
    Max depth: <strong>${maxDepth}</strong>
  `;
}

function applyLayout() {
  const layoutName = document.getElementById('layout-select').value;

  // Handle ForceAtlas2 separately - it works directly on the graph
  if (layoutName === 'forceAtlas') {
    applyForceAtlasLayout();
    return;
  }

  const layoutFn = layouts[layoutName] || layouts.radial;

  // Compute new positions (use 100% as base, spacing will adjust after)
  const positions = layoutFn(graphData.nodes, 100);

  // Update node positions
  graph.forEachNode((node, attrs) => {
    const pos = positions[node];
    if (pos) {
      graph.setNodeAttribute(node, 'x', pos.x);
      graph.setNodeAttribute(node, 'y', pos.y);
    }
  });

  // Save base positions and apply current spacing
  saveBasePositions();
  applySpacing();

  // Refresh and fit
  renderer.refresh();
  setTimeout(fitToScreen, 50);
}

/**
 * Save current node positions as base positions for spacing adjustments
 */
function saveBasePositions() {
  basePositions = {};
  let sumX = 0, sumY = 0, count = 0;

  graph.forEachNode((node, attrs) => {
    basePositions[node] = { x: attrs.x, y: attrs.y };
    sumX += attrs.x;
    sumY += attrs.y;
    count++;
  });

  // Calculate and store center
  graphCenter = {
    x: count > 0 ? sumX / count : 0,
    y: count > 0 ? sumY / count : 0
  };

  console.log(`Saved ${count} base positions, center: (${graphCenter.x.toFixed(2)}, ${graphCenter.y.toFixed(2)})`);
}

/**
 * Apply spacing multiplier to scale nodes from center
 */
function applySpacing() {
  if (Object.keys(basePositions).length === 0) {
    console.log('No base positions, saving current...');
    saveBasePositions();
  }

  const scale = currentSpacing / 100;
  console.log(`Applying spacing: ${currentSpacing}% (scale: ${scale})`);

  // Scale positions from center
  let updated = 0;
  let sampleNode = null;
  graph.forEachNode((node, attrs) => {
    const base = basePositions[node];
    if (base) {
      const dx = base.x - graphCenter.x;
      const dy = base.y - graphCenter.y;
      const newX = graphCenter.x + dx * scale;
      const newY = graphCenter.y + dy * scale;
      graph.setNodeAttribute(node, 'x', newX);
      graph.setNodeAttribute(node, 'y', newY);
      updated++;
      if (!sampleNode && base.x !== 0) {
        sampleNode = { base, newX, newY };
      }
    }
  });

  if (sampleNode) {
    console.log(`Sample node: base(${sampleNode.base.x.toFixed(1)}, ${sampleNode.base.y.toFixed(1)}) -> new(${sampleNode.newX.toFixed(1)}, ${sampleNode.newY.toFixed(1)})`);
  }

  console.log(`Updated ${updated} node positions`);
  if (renderer) {
    renderer.refresh();
  }
}

/**
 * Apply noverlap layout to prevent node overlaps
 */
function applyNoverlapLayout() {
  // Check if noverlap is available (different builds export differently)
  const noverlapFn = typeof noverlap !== 'undefined' ? noverlap :
                     (typeof Noverlap !== 'undefined' ? Noverlap : null);

  if (!noverlapFn) {
    console.warn('Noverlap not loaded, skipping overlap prevention');
    return;
  }

  const nodeCount = graph.order;
  const settings = {
    maxIterations: nodeCount > 3000 ? 200 : 100,
    ratio: 2,           // How much to push nodes apart
    margin: 10,         // Minimum margin between nodes
    speed: 3,
    gridSize: 20,
  };

  console.log(`Applying noverlap layout (${settings.maxIterations} iterations)...`);
  noverlapFn.assign(graph, settings);
  console.log('Noverlap complete');
}

/**
 * Get the ForceAtlas2 function (different builds export it differently)
 */
function getForceAtlas2() {
  if (typeof forceAtlas2 !== 'undefined') return forceAtlas2;
  if (typeof ForceAtlas2 !== 'undefined') return ForceAtlas2;
  // Try window object
  if (typeof window !== 'undefined') {
    if (window.forceAtlas2) return window.forceAtlas2;
    if (window.ForceAtlas2) return window.ForceAtlas2;
  }
  return null;
}

/**
 * Apply ForceAtlas2 layout during initialization (before renderer exists)
 */
function applyInitialForceAtlasLayout() {
  const nodeCount = graph.order;
  console.log(`Applying initial ForceAtlas2 layout for ${nodeCount} nodes...`);

  // Check if ForceAtlas2 is available
  const fa2 = getForceAtlas2();
  if (!fa2) {
    console.warn('ForceAtlas2 not loaded, keeping radial layout');
    applyNoverlapLayout();
    saveBasePositions();
    return;
  }

  // Get settings scaled for graph size
  const settings = getForceAtlasSettings(nodeCount);
  console.log(`ForceAtlas2 settings: ${settings.iterations} iterations, scalingRatio: ${settings.settings.scalingRatio}`);

  // Run ForceAtlas2 with settings optimized for no overlap
  fa2.assign(graph, settings);
  console.log('ForceAtlas2 complete');

  // Run noverlap to clean up any remaining overlaps
  applyNoverlapLayout();

  console.log('Initial layout complete');

  // Save base positions for spacing slider
  saveBasePositions();
}

/**
 * Apply ForceAtlas2 layout - minimizes edge crossings (called from UI)
 */
function applyForceAtlasLayout() {
  const nodeCount = graph.order;
  console.log(`Applying ForceAtlas2 layout for ${nodeCount} nodes...`);

  // Check if ForceAtlas2 is available
  const fa2 = getForceAtlas2();
  if (!fa2) {
    console.error('ForceAtlas2 not loaded');
    // Fall back to radial layout
    const positions = layouts.radial(graphData.nodes, 100);
    graph.forEachNode((node, attrs) => {
      const pos = positions[node];
      if (pos) {
        graph.setNodeAttribute(node, 'x', pos.x);
        graph.setNodeAttribute(node, 'y', pos.y);
      }
    });
    applyNoverlapLayout();
    saveBasePositions();
    applySpacing();
    renderer.refresh();
    setTimeout(fitToScreen, 50);
    return;
  }

  // Get settings scaled for graph size
  const settings = getForceAtlasSettings(nodeCount);
  console.log(`ForceAtlas2 settings: ${settings.iterations} iterations, scalingRatio: ${settings.settings.scalingRatio}`);

  // Run ForceAtlas2 with settings optimized for no overlap
  fa2.assign(graph, settings);
  console.log('ForceAtlas2 complete');

  // Run noverlap to clean up any remaining overlaps
  applyNoverlapLayout();

  // Save base positions and apply current spacing
  saveBasePositions();
  applySpacing();

  console.log('Layout complete');

  // Refresh and fit
  renderer.refresh();
  setTimeout(fitToScreen, 50);
}

function handleSearch(e) {
  const query = e.target.value.toLowerCase().trim();

  if (!query) {
    resetHighlight();
    return;
  }

  // Find matching nodes
  highlightedNodes.clear();
  highlightedEdges.clear();

  graph.forEachNode((node, attrs) => {
    if (attrs.label && attrs.label.toLowerCase().includes(query)) {
      highlightedNodes.add(node);
      // Also highlight connected nodes and edges
      graph.forEachNeighbor(node, neighbor => {
        highlightedNodes.add(neighbor);
      });
      graph.forEachEdge(node, (edge) => {
        highlightedEdges.add(edge);
      });
    }
  });

  renderer.refresh();

  // If single match, zoom to it
  if (highlightedNodes.size === 1) {
    const node = [...highlightedNodes][0];
    const attrs = graph.getNodeAttributes(node);
    const camera = renderer.getCamera();
    camera.animate({ x: attrs.x, y: attrs.y, ratio: 0.3 }, { duration: 300 });
  }
}

function handleDepthFilter(e) {
  const maxDepth = parseInt(e.target.value);
  const label = maxDepth > 2 ? 'All' : maxDepth.toString();
  document.getElementById('depth-val').textContent = label;

  // Update node visibility by adjusting size/color
  graph.forEachNode((node, attrs) => {
    const nodeDepth = attrs.depth || 0;
    const visible = nodeDepth <= maxDepth || maxDepth > 2;

    if (visible) {
      graph.setNodeAttribute(node, 'hidden', false);
      graph.setNodeAttribute(node, 'color', attrs.originalColor);
    } else {
      graph.setNodeAttribute(node, 'hidden', true);
    }
  });

  renderer.refresh();
}

function highlightNode(node) {
  highlightedNodes.clear();
  highlightedEdges.clear();
  currentPathEdgeDirections.clear();  // Clear path directions so no arrows show

  highlightedNodes.add(node);

  // Add neighbors
  graph.forEachNeighbor(node, neighbor => {
    highlightedNodes.add(neighbor);
  });

  // Add edges
  graph.forEachEdge(node, edge => {
    highlightedEdges.add(edge);
  });

  renderer.refresh();
}

function resetHighlight() {
  highlightedNodes.clear();
  highlightedEdges.clear();
  currentPathEdgeDirections.clear();
  renderer.refresh();
}

function showNodeInfo(nodeId) {
  const attrs = graph.getNodeAttributes(nodeId);
  const connections = graph.neighbors(nodeId).length;

  document.getElementById('info-name').textContent = attrs.label;
  document.getElementById('info-depth').textContent = `Depth: ${attrs.depth}`;
  document.getElementById('info-connections').textContent = `Connections: ${connections}`;
  document.getElementById('info-link').href = attrs.url;
  document.getElementById('node-info').style.display = 'block';

  // Hide the paths list - user must click "Show Paths" to see it
  const pathListContainer = document.getElementById('paths-to-me-container');
  if (pathListContainer) {
    pathListContainer.style.display = 'none';
  }

  // Calculate paths to start node (you)
  if (startNodeId && nodeId !== startNodeId) {
    const pathResult = findAllPaths(nodeId, startNodeId);
    document.getElementById('path-distance').textContent =
      pathResult.shortestDistance === Infinity ? 'Not connected' : `${pathResult.shortestDistance} steps`;
    document.getElementById('path-count').textContent =
      pathResult.shortestDistance === Infinity ? '0' : `${pathResult.pathCount} (of max ${PATH_CONFIG.maxPaths})`;
    document.getElementById('path-info').style.display = 'block';
  } else if (nodeId === startNodeId) {
    document.getElementById('path-distance').textContent = '0 (this is you!)';
    document.getElementById('path-count').textContent = '-';
    document.getElementById('path-info').style.display = 'block';
  } else {
    document.getElementById('path-info').style.display = 'none';
  }
}

function hideNodeInfo() {
  document.getElementById('node-info').style.display = 'none';
}

// ==========================================
// PATH FINDING ALGORITHMS
// ==========================================

/**
 * Find all paths between two nodes using DFS
 * Returns: { shortestDistance, pathCount, paths (array of node arrays), nodesInPaths, edgesInPaths }
 */
function findAllPaths(sourceId, targetId) {
  console.log('findAllPaths:', { sourceId, targetId, maxPaths: PATH_CONFIG.maxPaths, maxLength: PATH_CONFIG.maxPathLength });

  if (sourceId === targetId) {
    return {
      shortestDistance: 0,
      pathCount: 1,
      paths: [[sourceId]],
      nodesInPaths: new Set([sourceId]),
      edgesInPaths: new Set()
    };
  }

  const allPaths = [];
  const nodesInPaths = new Set();
  const edgesInPaths = new Set();
  let shortestDistance = Infinity;

  // DFS to find all paths
  function dfs(currentNode, currentPath, visited) {
    // Stop if we've found enough paths
    if (allPaths.length >= PATH_CONFIG.maxPaths) return;

    // Stop if path is too long
    if (currentPath.length > PATH_CONFIG.maxPathLength) return;

    // Found the target!
    if (currentNode === targetId) {
      const pathCopy = [...currentPath];
      allPaths.push(pathCopy);

      // Track shortest distance
      if (pathCopy.length - 1 < shortestDistance) {
        shortestDistance = pathCopy.length - 1;
      }

      // Add all nodes in this path to the set
      pathCopy.forEach(node => nodesInPaths.add(node));

      // Add all edges in this path (use directed edge in correct direction)
      for (let i = 0; i < pathCopy.length - 1; i++) {
        const edge = graph.directedEdge(pathCopy[i], pathCopy[i + 1]);
        if (edge) edgesInPaths.add(edge);
      }

      return;
    }

    // Explore neighbors
    graph.forEachNeighbor(currentNode, (neighbor) => {
      // Skip if already visited in this path (avoid cycles)
      if (visited.has(neighbor)) return;

      // Skip if we've found enough paths
      if (allPaths.length >= PATH_CONFIG.maxPaths) return;

      // Add to path and mark as visited
      currentPath.push(neighbor);
      visited.add(neighbor);

      // Recurse
      dfs(neighbor, currentPath, visited);

      // Backtrack
      currentPath.pop();
      visited.delete(neighbor);
    });
  }

  // Start DFS from source
  const visited = new Set([sourceId]);
  dfs(sourceId, [sourceId], visited);

  // Sort paths by length (shortest first)
  allPaths.sort((a, b) => a.length - b.length);

  console.log('Path finding complete:', {
    pathsFound: allPaths.length,
    shortestDistance: shortestDistance === Infinity ? 'not found' : shortestDistance,
    nodesInPaths: nodesInPaths.size,
    edgesInPaths: edgesInPaths.size
  });

  return {
    shortestDistance: shortestDistance === Infinity ? Infinity : shortestDistance,
    pathCount: allPaths.length,
    paths: allPaths,
    nodesInPaths,
    edgesInPaths
  };
}

/**
 * Highlight all nodes and edges in the paths between two nodes
 */
function highlightPaths(sourceId, targetId) {
  console.log('highlightPaths called:', { sourceId, targetId });

  const result = findAllPaths(sourceId, targetId);

  console.log('Path finding result:', {
    shortestDistance: result.shortestDistance,
    pathCount: result.pathCount,
    nodesInPathsSize: result.nodesInPaths.size,
    edgesInPathsSize: result.edgesInPaths.size
  });

  // Store paths for later selection
  currentPaths = result.paths;
  selectedPathIndex = -1;  // Start with all paths highlighted

  // Don't update highlights if no paths found
  if (result.nodesInPaths.size === 0) {
    console.warn('No nodes in paths found!');
    return result;
  }

  // Highlight all paths initially
  highlightAllPaths(result);

  return result;
}

/**
 * Highlight all paths at once
 */
function highlightAllPaths(result) {
  highlightedNodes.clear();
  highlightedEdges.clear();
  currentPathEdgeDirections.clear();

  result.nodesInPaths.forEach(node => highlightedNodes.add(node));
  result.edgesInPaths.forEach(edge => highlightedEdges.add(edge));

  // Add direction info for all edges in all paths
  // Use the directed edge in the correct direction (source → target along the path)
  result.paths.forEach(path => {
    for (let i = 0; i < path.length - 1; i++) {
      const source = path[i];
      const target = path[i + 1];
      // Get the specific directed edge from source to target
      const edge = graph.directedEdge(source, target);
      if (edge) {
        highlightedEdges.add(edge);
        currentPathEdgeDirections.set(edge, { source, target });
      }
    }
  });

  renderer.refresh();
}

/**
 * Highlight a specific path by index
 */
function selectPath(index) {
  if (index < 0 || index >= currentPaths.length) {
    console.warn('Invalid path index:', index);
    return;
  }

  selectedPathIndex = index;
  const path = currentPaths[index];

  highlightedNodes.clear();
  highlightedEdges.clear();
  currentPathEdgeDirections.clear();

  // Add nodes from this path
  path.forEach(node => highlightedNodes.add(node));

  // Add edges from this path with direction
  // Use the directed edge in the correct direction (source → target along the path)
  for (let i = 0; i < path.length - 1; i++) {
    const source = path[i];
    const target = path[i + 1];
    // Get the specific directed edge from source to target
    const edge = graph.directedEdge(source, target);
    if (edge) {
      highlightedEdges.add(edge);
      currentPathEdgeDirections.set(edge, { source, target });
    }
  }

  renderer.refresh();

  // Update UI to show selected path
  updatePathListSelection();
}

/**
 * Show all paths (deselect specific path)
 */
function selectAllPaths() {
  if (currentPaths.length === 0) return;

  selectedPathIndex = -1;

  // Rebuild the full result from current paths
  const nodesInPaths = new Set();
  const edgesInPaths = new Set();

  currentPaths.forEach(path => {
    path.forEach(node => nodesInPaths.add(node));
    for (let i = 0; i < path.length - 1; i++) {
      // Use directed edge in the correct direction
      const edge = graph.directedEdge(path[i], path[i + 1]);
      if (edge) edgesInPaths.add(edge);
    }
  });

  highlightAllPaths({ paths: currentPaths, nodesInPaths, edgesInPaths });
  updatePathListSelection();
}

/**
 * Update the visual selection state in the path list
 */
function updatePathListSelection() {
  // Update individual path items
  document.querySelectorAll('.path-list-item[data-path-index]').forEach(item => {
    const idx = parseInt(item.getAttribute('data-path-index'));
    if (idx === selectedPathIndex) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });

  // Update "Show All" buttons
  document.querySelectorAll('.path-list-item.all-paths').forEach(btn => {
    if (selectedPathIndex === -1) {
      btn.classList.add('selected');
    } else {
      btn.classList.remove('selected');
    }
  });
}

/**
 * Render the path list in the UI
 */
function renderPathList(containerId, paths) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (paths.length === 0) {
    container.innerHTML = '<div class="no-paths">No paths found</div>';
    return;
  }

  let html = `<button class="path-list-item all-paths selected" onclick="selectAllPaths()">
    Show All ${paths.length} Paths
  </button>`;

  paths.forEach((path, index) => {
    const pathLength = path.length - 1;
    const pathNames = path.map(nodeId => {
      const attrs = graph.getNodeAttributes(nodeId);
      return attrs.label || 'Unknown';
    });

    // Truncate names if too long
    const displayNames = pathNames.map(name =>
      name.length > 15 ? name.substring(0, 12) + '...' : name
    );

    html += `
      <div class="path-list-item" data-path-index="${index}" onclick="selectPath(${index})">
        <div class="path-header">
          <span class="path-number">#${index + 1}</span>
          <span class="path-length">${pathLength} step${pathLength !== 1 ? 's' : ''}</span>
        </div>
        <div class="path-route">${displayNames.join(' → ')}</div>
      </div>
    `;
  });

  container.innerHTML = html;
}

/**
 * Show paths from currently selected node to "me" (start node)
 */
function showPathsToMe() {
  console.log('showPathsToMe called:', { currentSelectedNode, startNodeId });

  if (!currentSelectedNode || !startNodeId) {
    console.warn('Missing currentSelectedNode or startNodeId');
    return;
  }

  const result = highlightPaths(currentSelectedNode, startNodeId);

  // Render path list in the node info panel
  renderPathList('paths-to-me-list', result.paths);

  // Show the path list container
  const pathListContainer = document.getElementById('paths-to-me-container');
  if (pathListContainer) {
    pathListContainer.style.display = 'block';
  }
}

// ==========================================
// PATH FINDER MODE
// ==========================================

function togglePathFinderMode() {
  pathFinderMode = !pathFinderMode;
  const btn = document.getElementById('path-finder-btn');
  const panel = document.getElementById('path-finder-panel');

  if (pathFinderMode) {
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-primary');
    btn.textContent = 'Exit Path Finder';
    panel.style.display = 'block';
    hideNodeInfo();
    resetPathFinder();
  } else {
    btn.classList.remove('btn-primary');
    btn.classList.add('btn-secondary');
    btn.textContent = 'Path Finder';
    panel.style.display = 'none';
    resetHighlight();
  }
}

function handlePathFinderClick(nodeId) {
  const attrs = graph.getNodeAttributes(nodeId);

  if (!pathFinderNodeA) {
    // First selection
    pathFinderNodeA = nodeId;
    document.getElementById('pf-node-a-name').innerHTML = attrs.label;
    document.getElementById('pf-node-b-name').innerHTML = '<span class="empty">Click another node...</span>';
    document.getElementById('pf-results').style.display = 'none';

    // Highlight just this node
    highlightedNodes.clear();
    highlightedEdges.clear();
    highlightedNodes.add(nodeId);
    renderer.refresh();

  } else if (!pathFinderNodeB && nodeId !== pathFinderNodeA) {
    // Second selection
    pathFinderNodeB = nodeId;
    document.getElementById('pf-node-b-name').innerHTML = attrs.label;

    // Find and display paths
    const result = highlightPaths(pathFinderNodeA, pathFinderNodeB);

    document.getElementById('pf-path-count').textContent = result.pathCount.toLocaleString();
    document.getElementById('pf-path-length').textContent =
      result.shortestDistance === Infinity ? 'Not connected' : `${result.shortestDistance} steps (shortest)`;
    document.getElementById('pf-nodes-in-paths').textContent =
      result.shortestDistance === Infinity ? '0' : result.nodesInPaths.size.toLocaleString();
    document.getElementById('pf-results').style.display = 'block';

    // Render path list
    renderPathList('pf-path-list', result.paths);

  } else {
    // Reset and start over with this node
    resetPathFinder();
    handlePathFinderClick(nodeId);
  }
}

function resetPathFinder() {
  pathFinderNodeA = null;
  pathFinderNodeB = null;
  document.getElementById('pf-node-a-name').innerHTML = '<span class="empty">Click a node...</span>';
  document.getElementById('pf-node-b-name').innerHTML = '<span class="empty">Click another node...</span>';
  document.getElementById('pf-results').style.display = 'none';
  resetHighlight();
}

function fitToScreen() {
  if (renderer) {
    const camera = renderer.getCamera();
    camera.animatedReset({ duration: 300 });
  }
}

function zoomIn() {
  if (renderer) {
    const camera = renderer.getCamera();
    camera.animatedZoom({ duration: 200 });
  }
}

function zoomOut() {
  if (renderer) {
    const camera = renderer.getCamera();
    camera.animatedUnzoom({ duration: 200 });
  }
}

function toggleLabels() {
  labelsVisible = !labelsVisible;
  renderer.setSetting('renderLabels', labelsVisible);
}

// Initialize
init();
