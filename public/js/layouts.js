/**
 * Layout algorithms for the Social Graph Viewer
 */

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
        depthNodes.forEach(n => {
          positions[n.id] = { x: 0, y: 0 };
        });
      } else {
        const radius = baseRadius * d * 1.5;
        const angleStep = (2 * Math.PI) / depthNodes.length;
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
    const a = 10 * spacingMult;
    const b = 30 * spacingMult;

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
    const radialPos = layouts.radial(nodes, spacing);

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

// ==========================================
// Layout Application Functions
// ==========================================

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
 * Get the ForceAtlas2 function (different builds export it differently)
 */
function getForceAtlas2() {
  if (typeof forceAtlas2 !== 'undefined') return forceAtlas2;
  if (typeof ForceAtlas2 !== 'undefined') return ForceAtlas2;
  if (typeof window !== 'undefined') {
    if (window.forceAtlas2) return window.forceAtlas2;
    if (window.ForceAtlas2) return window.ForceAtlas2;
  }
  return null;
}

/**
 * Apply noverlap layout to prevent node overlaps
 */
function applyNoverlapLayout() {
  const noverlapFn = typeof noverlap !== 'undefined' ? noverlap :
                     (typeof Noverlap !== 'undefined' ? Noverlap : null);

  if (!noverlapFn) {
    console.warn('Noverlap not loaded, skipping overlap prevention');
    return;
  }

  const nodeCount = graph.order;
  const settings = {
    maxIterations: nodeCount > 3000 ? 200 : 100,
    ratio: 2,
    margin: 10,
    speed: 3,
    gridSize: 20,
  };

  console.log(`Applying noverlap layout (${settings.maxIterations} iterations)...`);
  noverlapFn.assign(graph, settings);
  console.log('Noverlap complete');
}

/**
 * Apply ForceAtlas2 layout during initialization
 */
function applyInitialForceAtlasLayout() {
  const nodeCount = graph.order;
  console.log(`Applying initial ForceAtlas2 layout for ${nodeCount} nodes...`);

  const fa2 = getForceAtlas2();
  if (!fa2) {
    console.warn('ForceAtlas2 not loaded, keeping radial layout');
    applyNoverlapLayout();
    saveBasePositions();
    return;
  }

  const settings = getForceAtlasSettings(nodeCount);
  console.log(`ForceAtlas2 settings: ${settings.iterations} iterations, scalingRatio: ${settings.settings.scalingRatio}`);

  fa2.assign(graph, settings);
  console.log('ForceAtlas2 complete');

  applyNoverlapLayout();
  console.log('Initial layout complete');

  saveBasePositions();
}

/**
 * Apply ForceAtlas2 layout (called from UI)
 */
function applyForceAtlasLayout() {
  const nodeCount = graph.order;
  console.log(`Applying ForceAtlas2 layout for ${nodeCount} nodes...`);

  const fa2 = getForceAtlas2();
  if (!fa2) {
    console.error('ForceAtlas2 not loaded');
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

  const settings = getForceAtlasSettings(nodeCount);
  console.log(`ForceAtlas2 settings: ${settings.iterations} iterations, scalingRatio: ${settings.settings.scalingRatio}`);

  fa2.assign(graph, settings);
  console.log('ForceAtlas2 complete');

  applyNoverlapLayout();
  saveBasePositions();
  applySpacing();

  console.log('Layout complete');

  renderer.refresh();
  setTimeout(fitToScreen, 50);
}

/**
 * Apply selected layout from dropdown
 */
function applyLayout() {
  const layoutName = document.getElementById('layout-select').value;

  if (layoutName === 'forceAtlas') {
    applyForceAtlasLayout();
    return;
  }

  const layoutFn = layouts[layoutName] || layouts.radial;
  const positions = layoutFn(graphData.nodes, 100);

  graph.forEachNode((node, attrs) => {
    const pos = positions[node];
    if (pos) {
      graph.setNodeAttribute(node, 'x', pos.x);
      graph.setNodeAttribute(node, 'y', pos.y);
    }
  });

  saveBasePositions();
  applySpacing();

  renderer.refresh();
  setTimeout(fitToScreen, 50);
}
