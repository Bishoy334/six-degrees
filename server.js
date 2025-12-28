const express = require('express');
const fs = require('fs');
const path = require('path');
const config = require('./config');

const app = express();
const PORT = 3000;

app.use(express.static('public'));

// Serve graph data
app.get('/api/graph', (req, res) => {
  try {
    if (!fs.existsSync(config.dataFile)) {
      return res.json({ nodes: [], edges: [], message: 'No data yet. Run "npm run scrape" first.' });
    }
    const data = fs.readFileSync(config.dataFile, 'utf-8');
    res.json(JSON.parse(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Serve stats
app.get('/api/stats', (req, res) => {
  try {
    if (!fs.existsSync(config.dataFile)) {
      return res.json({ nodes: 0, edges: 0 });
    }
    const data = JSON.parse(fs.readFileSync(config.dataFile, 'utf-8'));
    res.json({
      nodes: data.nodes?.length || 0,
      edges: data.edges?.length || 0,
      maxDepth: Math.max(...(data.nodes?.map(n => n.depth) || [0])),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`\n🌐 Graph viewer running at: http://localhost:${PORT}`);
  console.log('\nIf you haven\'t scraped data yet, run: npm run scrape');
});
