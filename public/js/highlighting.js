/**
 * Highlighting and visibility functions for the Social Graph Viewer
 */

/**
 * Highlight a specific node and its neighbors
 */
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

/**
 * Reset all highlighting
 */
function resetHighlight() {
  highlightedNodes.clear();
  highlightedEdges.clear();
  currentPathEdgeDirections.clear();
  renderer.refresh();
}

/**
 * Handle search input to highlight matching nodes
 */
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

/**
 * Handle depth filter to show/hide nodes by depth
 */
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
