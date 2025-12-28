/**
 * Sigma renderer setup for the Social Graph Viewer
 */

/**
 * Create and configure the Sigma renderer
 */
function createRenderer() {
  const container = document.getElementById('graph-container');

  renderer = new Sigma(graph, container, {
    // Rendering settings for performance
    renderLabels: labelsVisible,
    labelRenderedSizeThreshold: SIGMA_SETTINGS.labelRenderedSizeThreshold,
    labelDensity: SIGMA_SETTINGS.labelDensity,
    labelGridCellSize: SIGMA_SETTINGS.labelGridCellSize,
    minCameraRatio: SIGMA_SETTINGS.minCameraRatio,
    maxCameraRatio: SIGMA_SETTINGS.maxCameraRatio,

    // Label styling
    labelColor: { color: '#ffffff' },  // White labels for normal state
    labelFont: SIGMA_SETTINGS.labelFont,
    labelSize: SIGMA_SETTINGS.labelSize,
    labelHoverColor: { color: '#1a1a2e' },  // Dark text on hover (white background)

    // Enable edge arrows
    defaultEdgeType: SIGMA_SETTINGS.defaultEdgeType,
    renderEdgeLabels: SIGMA_SETTINGS.renderEdgeLabels,

    // Node settings
    defaultNodeColor: SIGMA_SETTINGS.defaultNodeColor,

    // Node reducer - handles highlighting
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

    // Edge reducer - handles highlighting
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

  return renderer;
}
