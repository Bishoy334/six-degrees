/**
 * UI controls and camera functions for the Social Graph Viewer
 */

/**
 * Update the loading text during initialization
 */
function setLoadingText(text) {
  const el = document.getElementById('loading-text');
  if (el) el.textContent = text;
}

/**
 * Update the stats display
 */
function updateStats() {
  const maxDepth = Math.max(...graphData.nodes.map(n => n.depth));
  document.getElementById('stats').innerHTML = `
    <strong>${graphData.nodes.length}</strong> people &nbsp;|&nbsp;
    <strong>${graphData.edges.length}</strong> connections<br>
    Max depth: <strong>${maxDepth}</strong>
  `;
}

/**
 * Setup all UI control event listeners
 */
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

// ==========================================
// CAMERA CONTROLS
// ==========================================

/**
 * Fit the graph to the screen
 */
function fitToScreen() {
  if (renderer) {
    const camera = renderer.getCamera();
    camera.animatedReset({ duration: 300 });
  }
}

/**
 * Zoom in
 */
function zoomIn() {
  if (renderer) {
    const camera = renderer.getCamera();
    camera.animatedZoom({ duration: 200 });
  }
}

/**
 * Zoom out
 */
function zoomOut() {
  if (renderer) {
    const camera = renderer.getCamera();
    camera.animatedUnzoom({ duration: 200 });
  }
}

/**
 * Toggle label visibility
 */
function toggleLabels() {
  labelsVisible = !labelsVisible;
  renderer.setSetting('renderLabels', labelsVisible);
}

// ==========================================
// NODE INFO PANEL
// ==========================================

/**
 * Show node info panel for a selected node
 */
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

/**
 * Hide the node info panel
 */
function hideNodeInfo() {
  document.getElementById('node-info').style.display = 'none';
}
