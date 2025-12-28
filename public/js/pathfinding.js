/**
 * Path finding algorithms and UI for the Social Graph Viewer
 */

/**
 * Find all paths between two nodes using DFS
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

  function dfs(currentNode, currentPath, visited) {
    if (allPaths.length >= PATH_CONFIG.maxPaths) return;
    if (currentPath.length > PATH_CONFIG.maxPathLength) return;

    if (currentNode === targetId) {
      const pathCopy = [...currentPath];
      allPaths.push(pathCopy);

      if (pathCopy.length - 1 < shortestDistance) {
        shortestDistance = pathCopy.length - 1;
      }

      pathCopy.forEach(node => nodesInPaths.add(node));

      for (let i = 0; i < pathCopy.length - 1; i++) {
        const edge = graph.directedEdge(pathCopy[i], pathCopy[i + 1]);
        if (edge) edgesInPaths.add(edge);
      }

      return;
    }

    graph.forEachNeighbor(currentNode, (neighbor) => {
      if (visited.has(neighbor)) return;
      if (allPaths.length >= PATH_CONFIG.maxPaths) return;

      currentPath.push(neighbor);
      visited.add(neighbor);

      dfs(neighbor, currentPath, visited);

      currentPath.pop();
      visited.delete(neighbor);
    });
  }

  const visited = new Set([sourceId]);
  dfs(sourceId, [sourceId], visited);

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

  currentPaths = result.paths;
  selectedPathIndex = -1;

  if (result.nodesInPaths.size === 0) {
    console.warn('No nodes in paths found!');
    return result;
  }

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

  result.paths.forEach(path => {
    for (let i = 0; i < path.length - 1; i++) {
      const source = path[i];
      const target = path[i + 1];
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

  path.forEach(node => highlightedNodes.add(node));

  for (let i = 0; i < path.length - 1; i++) {
    const source = path[i];
    const target = path[i + 1];
    const edge = graph.directedEdge(source, target);
    if (edge) {
      highlightedEdges.add(edge);
      currentPathEdgeDirections.set(edge, { source, target });
    }
  }

  renderer.refresh();
  updatePathListSelection();
}

/**
 * Show all paths (deselect specific path)
 */
function selectAllPaths() {
  if (currentPaths.length === 0) return;

  selectedPathIndex = -1;

  const nodesInPaths = new Set();
  const edgesInPaths = new Set();

  currentPaths.forEach(path => {
    path.forEach(node => nodesInPaths.add(node));
    for (let i = 0; i < path.length - 1; i++) {
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
  document.querySelectorAll('.path-list-item[data-path-index]').forEach(item => {
    const idx = parseInt(item.getAttribute('data-path-index'));
    if (idx === selectedPathIndex) {
      item.classList.add('selected');
    } else {
      item.classList.remove('selected');
    }
  });

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
 * Show paths from currently selected node to "me"
 */
function showPathsToMe() {
  console.log('showPathsToMe called:', { currentSelectedNode, startNodeId });

  if (!currentSelectedNode || !startNodeId) {
    console.warn('Missing currentSelectedNode or startNodeId');
    return;
  }

  const result = highlightPaths(currentSelectedNode, startNodeId);

  renderPathList('paths-to-me-list', result.paths);

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
    pathFinderNodeA = nodeId;
    document.getElementById('pf-node-a-name').innerHTML = attrs.label;
    document.getElementById('pf-node-b-name').innerHTML = '<span class="empty">Click another node...</span>';
    document.getElementById('pf-results').style.display = 'none';

    highlightedNodes.clear();
    highlightedEdges.clear();
    highlightedNodes.add(nodeId);
    renderer.refresh();

  } else if (!pathFinderNodeB && nodeId !== pathFinderNodeA) {
    pathFinderNodeB = nodeId;
    document.getElementById('pf-node-b-name').innerHTML = attrs.label;

    const result = highlightPaths(pathFinderNodeA, pathFinderNodeB);

    document.getElementById('pf-path-count').textContent = result.pathCount.toLocaleString();
    document.getElementById('pf-path-length').textContent =
      result.shortestDistance === Infinity ? 'Not connected' : `${result.shortestDistance} steps (shortest)`;
    document.getElementById('pf-nodes-in-paths').textContent =
      result.shortestDistance === Infinity ? '0' : result.nodesInPaths.size.toLocaleString();
    document.getElementById('pf-results').style.display = 'block';

    renderPathList('pf-path-list', result.paths);

  } else {
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
