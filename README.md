# Facebook Social Graph Viewer

A personal tool to visualize your Facebook social network as an interactive graph. Scrapes your friends list (and optionally friends-of-friends) using Puppeteer, then displays the connections in a browser-based visualization.

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Create your config file
cp config.example.js config.js

# 3. Edit config.js and set your Facebook profile URL
#    startUrl: "https://www.facebook.com/your.username"

# 4. Start Chrome with remote debugging
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# 5. Log into Facebook in that Chrome window

# 6. Run the scraper (connects to your Chrome session)
npm run scrape

# 7. View the graph
npm run serve
# Open http://localhost:3000
```

## Configuration

Copy `config.example.js` to `config.js` and adjust as needed:

| Option | Default | Description |
|--------|---------|-------------|
| `startUrl` | — | **Required.** Your Facebook profile URL (e.g., `https://www.facebook.com/your.username`) |
| `maxDepth` | `3` | 1 = friends only, 2 = friends of friends, 3 = one more level, etc. |
| `maxNodes` | `5000` | Stop after collecting this many people |
| `maxFriendsPerPerson` | `200` | Limit friends scraped per person (0 = unlimited) |
| `scrollDelay` | `1500` | ms between scroll actions |
| `pageDelay` | `3000` | ms between page navigations |
| `scrollTimeout` | `30000` | max ms to spend scrolling a single friends list |
| `debuggingPort` | `9222` | Chrome remote debugging port |
| `dataFile` | `./data/graph.json` | Where to save the scraped graph data |

## Project Structure

- `scraper.js` - Puppeteer script that traverses Facebook friends pages
- `server.js` - Express server that serves the visualization
- `public/index.html` - Cytoscape.js interactive graph UI
- `data/graph.json` - Scraped graph data (generated)

## Visualization Controls

- **Search**: Filter nodes by name
- **Depth slider**: Show/hide depths
- **Click node**: Highlight connections, view Facebook profile
- **Pan/zoom**: Mouse drag and scroll

## Notes

- Private friends lists become leaf nodes (can't traverse further)
- Facebook's DOM changes frequently; selectors in `scraper.js` may need updates
- Use reasonable delays to avoid rate limiting
