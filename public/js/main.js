/**
 * Main initialization for the Social Graph Viewer
 */

/**
 * Initialize the graph viewer
 */
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
    createRenderer();

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

// Initialize when DOM is ready
init();
