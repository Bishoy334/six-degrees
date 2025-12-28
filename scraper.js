const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { Logger } = require('./utils/logger');

// Initialize logger for scraper
const log = new Logger({
  prefix: 'scraper',
  minLevel: 'DEBUG',
});

// Graph data structure
const graph = {
  nodes: [],  // { id, name, url, depth, scraped }
  edges: [],  // { source, target }
};

const visitedUrls = new Set();
const queue = [];  // { url, depth }
let nodeCount = 0;

// ==========================================
// FILTERING: Names and URLs to exclude
// ==========================================

// Patterns that indicate UI elements, not real people
const NAME_BLACKLIST_PATTERNS = [
  // UI actions
  /^add to/i,
  /^see all/i,
  /^see more/i,
  /^view all/i,
  /^show more/i,
  /^load more/i,
  /^message$/i,
  /^poke$/i,
  /^follow$/i,
  /^unfollow$/i,
  /^block$/i,
  /^report$/i,
  /^cancel$/i,
  /^close$/i,
  /^edit$/i,
  /^share$/i,
  /^like$/i,
  /^comment$/i,

  // Status/notification text
  /^unread/i,
  /birthday/i,
  /was yesterday/i,
  /is today/i,
  /is tomorrow/i,
  /ago$/i,
  /just now/i,

  // Numbers only or weird patterns
  /^\d+$/,
  /^\d+ (friends?|mutual|photos?|videos?)/i,
  /^•/,

  // Common non-name content
  /^home$/i,
  /^friends?$/i,
  /^photos?$/i,
  /^videos?$/i,
  /^about$/i,
  /^posts?$/i,
  /^stories?$/i,
  /^reels?$/i,
  /^groups?$/i,
  /^events?$/i,
  /^marketplace$/i,
  /^gaming$/i,
  /^watch$/i,
  /^menu$/i,
  /^more$/i,
  /^notifications?$/i,
  /^settings?$/i,
  /^privacy$/i,
  /^help$/i,
  /^log ?out$/i,
  /^sign ?out$/i,
];

// URL patterns that are not valid profile pages
const URL_BLACKLIST_PATTERNS = [
  /\/stories\//i,
  /\/story\.php/i,
  /\/reel\//i,
  /\/reels\//i,
  /\/watch\//i,
  /\/videos\//i,
  /\/photos\//i,
  /\/photo\.php/i,
  /\/groups\//i,
  /\/events\//i,
  /\/pages\//i,
  /\/marketplace/i,
  /\/gaming/i,
  /\/hashtag\//i,
  /\/search/i,
  /\/notifications/i,
  /\/settings/i,
  /\/help/i,
  /\/policies/i,
  /\/privacy/i,
  /\/login/i,
  /\/recover/i,
  /\/bookmarks/i,
  /\/saved/i,
  /\/ads/i,
  /\/business/i,
  /\/fundraisers/i,
  /\/weather/i,
  /\/climate/i,
  /\/games/i,
  /\/dialog\//i,
  /\/sharer/i,
  /\/share\.php/i,
  /\/ajax\//i,
  /\/api\//i,
  /\/plugins\//i,
  /\?story_fbid=/i,
  /\?__cft__/i,  // Tracking params on non-profile links
];

/**
 * Check if a name looks like a real person's name
 */
function isValidName(name) {
  if (!name || typeof name !== 'string') return false;

  const trimmed = name.trim();

  // Basic length checks
  if (trimmed.length < 2 || trimmed.length > 60) return false;

  // Check against blacklist patterns
  for (const pattern of NAME_BLACKLIST_PATTERNS) {
    if (pattern.test(trimmed)) {
      log.debug(`Name rejected by pattern ${pattern}: "${trimmed}"`);
      return false;
    }
  }

  // Names shouldn't have too many numbers
  const digitCount = (trimmed.match(/\d/g) || []).length;
  if (digitCount > 4) {
    log.debug(`Name rejected (too many digits): "${trimmed}"`);
    return false;
  }

  // Names shouldn't be mostly punctuation
  const letterCount = (trimmed.match(/[a-zA-Z\u00C0-\u024F\u0400-\u04FF\u0600-\u06FF\u4E00-\u9FFF]/g) || []).length;
  if (letterCount < trimmed.length * 0.5) {
    log.debug(`Name rejected (not enough letters): "${trimmed}"`);
    return false;
  }

  return true;
}

/**
 * Check if a URL is a valid profile URL (not stories, photos, etc.)
 */
function isValidProfileUrl(url) {
  if (!url || typeof url !== 'string') return false;

  // Must be a Facebook URL
  if (!url.includes('facebook.com')) return false;

  // Check against URL blacklist
  for (const pattern of URL_BLACKLIST_PATTERNS) {
    if (pattern.test(url)) {
      log.debug(`URL rejected by pattern ${pattern}: "${url}"`);
      return false;
    }
  }

  return true;
}

async function getWSEndpoint() {
  if (config.browserWSEndpoint) return config.browserWSEndpoint;

  try {
    const response = await fetch(`http://127.0.0.1:${config.debuggingPort}/json/version`);
    const data = await response.json();
    return data.webSocketDebuggerUrl;
  } catch (e) {
    console.error('Could not connect to Chrome. Make sure Chrome is running with remote debugging:');
    console.error(`  /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=${config.debuggingPort}`);
    console.error('\nOn Windows:');
    console.error(`  chrome.exe --remote-debugging-port=${config.debuggingPort}`);
    process.exit(1);
  }
}

function normalizeProfileUrl(url) {
  if (!url) return null;

  // First check if URL is blacklisted
  if (!isValidProfileUrl(url)) {
    return null;
  }

  // Handle different Facebook URL formats
  try {
    const parsed = new URL(url);
    let pathname = parsed.pathname;

    // Remove trailing slashes
    pathname = pathname.replace(/\/+$/, '');

    // Skip if pathname looks like a non-profile page
    if (pathname.includes('/friends') ||
        pathname.includes('/photos') ||
        pathname.includes('/videos') ||
        pathname.includes('/about') ||
        pathname.includes('/posts')) {
      // Extract the base profile path
      const parts = pathname.split('/');
      if (parts.length >= 2 && parts[1]) {
        pathname = '/' + parts[1];
      }
    }

    // Handle /profile.php?id=xxx format
    if (pathname === '/profile.php') {
      const id = parsed.searchParams.get('id');
      return id ? `https://www.facebook.com/profile.php?id=${id}` : null;
    }

    // Handle /username format - must have a valid pathname
    if (pathname && pathname !== '/' && pathname.length > 1) {
      // Validate it's not a reserved path
      const reservedPaths = ['/pages', '/groups', '/events', '/watch', '/marketplace', '/gaming'];
      if (reservedPaths.some(p => pathname.toLowerCase().startsWith(p))) {
        return null;
      }
      return `https://www.facebook.com${pathname}`;
    }
  } catch (e) {
    log.debug(`URL parse error for "${url}": ${e.message}`);
    return null;
  }
  return null;
}

function getFriendsPageUrl(profileUrl) {
  if (!profileUrl) return null;

  if (profileUrl.includes('profile.php?id=')) {
    return profileUrl + '&sk=friends';
  }
  return profileUrl + '/friends';
}

function addNode(id, name, url, depth) {
  if (nodeCount >= config.maxNodes) {
    log.debug(`Max nodes reached (${config.maxNodes}), skipping: ${name}`);
    return false;
  }

  // Validate name (except for the start node which we control)
  if (depth > 0 && !isValidName(name)) {
    log.debug(`Invalid name rejected: "${name}"`);
    return false;
  }

  const normalizedUrl = normalizeProfileUrl(url);
  if (!normalizedUrl) {
    log.debug(`Invalid URL rejected for "${name}": ${url}`);
    return false;
  }

  if (visitedUrls.has(normalizedUrl)) {
    return false;  // Already have this node, not an error
  }

  visitedUrls.add(normalizedUrl);
  graph.nodes.push({
    id: normalizedUrl,
    name: name || 'Unknown',
    url: normalizedUrl,
    depth,
    scraped: false,
  });
  nodeCount++;

  log.info(`[${nodeCount}/${config.maxNodes}] Added: ${name} (depth ${depth})`);
  return true;
}

function addEdge(sourceUrl, targetUrl) {
  const source = normalizeProfileUrl(sourceUrl);
  const target = normalizeProfileUrl(targetUrl);

  if (!source || !target) return;

  // Avoid duplicate edges
  const exists = graph.edges.some(e =>
    (e.source === source && e.target === target) ||
    (e.source === target && e.target === source)
  );

  if (!exists) {
    graph.edges.push({ source, target });
  }
}

async function scrollToLoadAll(page, maxFriends = 0) {
  const startTime = Date.now();
  let lastCount = 0;
  let sameCountTimes = 0;

  while (Date.now() - startTime < config.scrollTimeout) {
    // Count current friend cards
    const count = await page.evaluate(() => {
      return document.querySelectorAll('a[href*="/friends"][role="link"], a[href*="profile.php"][role="link"]').length;
    });

    // If we have a max limit and have enough, stop scrolling
    if (maxFriends > 0 && count >= maxFriends * 1.5) {  // Get a bit more than needed for filtering
      log.debug(`  Stopping scroll early - have ${count} links (need ~${maxFriends})`);
      break;
    }

    if (count === lastCount) {
      sameCountTimes++;
      if (sameCountTimes >= 3) {
        log.debug(`  Scrolling complete - found ${count} friend links`);
        break;
      }
    } else {
      sameCountTimes = 0;
      lastCount = count;
    }

    // Scroll down
    await page.evaluate(() => window.scrollBy(0, 1000));
    await new Promise(r => setTimeout(r, config.scrollDelay));
  }
}

async function scrapeFriendsPage(page, profileUrl, currentDepth) {
  const friendsUrl = getFriendsPageUrl(profileUrl);
  log.section(`Scraping: ${friendsUrl}`);

  try {
    await page.goto(friendsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2000));  // Let dynamic content load

    // Check if friends list is visible/accessible
    const pageStatus = await page.evaluate(() => {
      const text = document.body.innerText.toLowerCase();
      if (text.includes("this content isn't available")) return 'unavailable';
      if (text.includes("friends list") && text.includes("private")) return 'private';
      if (text.includes("sorry, this page isn't available")) return 'not_found';
      if (text.includes("log in") && text.includes("facebook")) return 'logged_out';
      return 'ok';
    });

    if (pageStatus !== 'ok') {
      log.warn(`  Page status: ${pageStatus} - skipping`);
      return [];
    }

    // Scroll to load friends (with limit awareness)
    const maxFriends = config.maxFriendsPerPerson || 0;
    await scrollToLoadAll(page, maxFriends);

    // Extract friend data with more thorough filtering
    const rawFriends = await page.evaluate(() => {
      const results = [];
      const links = document.querySelectorAll('a[role="link"]');

      for (const link of links) {
        const href = link.href;
        if (!href) continue;

        // Must be a Facebook URL
        if (!href.includes('facebook.com/')) continue;

        // Skip obvious non-profile URLs
        if (href.includes('/stories/') ||
            href.includes('/story.php') ||
            href.includes('/reel/') ||
            href.includes('/watch/') ||
            href.includes('/groups/') ||
            href.includes('/events/') ||
            href.includes('/pages/') ||
            href.includes('/photo') ||
            href.includes('/video') ||
            href.includes('?story_fbid=') ||
            href.includes('/posts/')) {
          continue;
        }

        // Get name - try multiple sources
        let name = null;

        // First try: direct inner text (if short enough)
        const directText = link.innerText?.trim();
        if (directText && directText.length > 1 && directText.length < 50 && !directText.includes('\n')) {
          name = directText;
        }

        // Second try: span inside the link
        if (!name) {
          const span = link.querySelector('span');
          if (span) {
            const spanText = span.innerText?.trim();
            if (spanText && spanText.length > 1 && spanText.length < 50) {
              name = spanText;
            }
          }
        }

        // Third try: aria-label attribute
        if (!name) {
          const ariaLabel = link.getAttribute('aria-label');
          if (ariaLabel && ariaLabel.length > 1 && ariaLabel.length < 50) {
            name = ariaLabel;
          }
        }

        if (name) {
          results.push({ name, url: href });
        }
      }

      // Dedupe by URL
      const seen = new Set();
      return results.filter(r => {
        if (seen.has(r.url)) return false;
        seen.add(r.url);
        return true;
      });
    });

    log.debug(`  Raw extraction: ${rawFriends.length} potential friends`);

    // Apply server-side filtering (name validation, URL validation)
    const validFriends = rawFriends.filter(f => {
      if (!isValidName(f.name)) return false;
      if (!isValidProfileUrl(f.url)) return false;
      return true;
    });

    log.debug(`  After filtering: ${validFriends.length} valid friends`);

    // Apply per-person limit if configured
    let friends = validFriends;
    if (maxFriends > 0 && validFriends.length > maxFriends) {
      friends = validFriends.slice(0, maxFriends);
      log.info(`  Limited to ${maxFriends} friends (had ${validFriends.length})`);
    }

    log.info(`  Found ${friends.length} friends to process`);
    return friends;

  } catch (e) {
    log.error(`  Error scraping: ${e.message}`);
    return [];
  }
}

async function run() {
  log.section('Facebook Social Graph Scraper');

  if (!config.startUrl) {
    log.error('Error: Set your startUrl in config.js first!');
    log.error('Example: startUrl: "https://www.facebook.com/your.username"');
    process.exit(1);
  }

  log.info('Connecting to Chrome...');
  const wsEndpoint = await getWSEndpoint();

  const browser = await puppeteer.connect({
    browserWSEndpoint: wsEndpoint,
    defaultViewport: null,
  });

  const page = await browser.newPage();

  // Add starting node (you) - bypass normal validation for start node
  const startUrl = config.startUrl.replace(/\/+$/, '');  // Just clean trailing slashes
  visitedUrls.add(startUrl);
  graph.nodes.push({
    id: startUrl,
    name: 'Me (Start)',
    url: startUrl,
    depth: 0,
    scraped: false,
  });
  nodeCount++;
  queue.push({ url: startUrl, depth: 0 });

  log.section('Configuration');
  log.info(`Start URL: ${startUrl}`);
  log.info(`Max depth: ${config.maxDepth}`);
  log.info(`Max nodes: ${config.maxNodes}`);
  log.info(`Max friends per person: ${config.maxFriendsPerPerson || 'unlimited'}`);
  log.info(`Log file: ${log.getLogFilePath()}`);

  // BFS traversal
  let pagesScraped = 0;
  while (queue.length > 0 && nodeCount < config.maxNodes) {
    const { url, depth } = queue.shift();

    // Mark node as scraped
    const node = graph.nodes.find(n => n.id === url);
    if (node) node.scraped = true;

    // Don't go deeper than maxDepth
    if (depth >= config.maxDepth) continue;

    pagesScraped++;
    log.info(`\n[Page ${pagesScraped}] Queue: ${queue.length} remaining | Nodes: ${nodeCount}/${config.maxNodes}`);

    // Scrape this person's friends
    const friends = await scrapeFriendsPage(page, url, depth);

    let addedCount = 0;
    let skippedCount = 0;
    for (const friend of friends) {
      if (nodeCount >= config.maxNodes) {
        log.warn('Max nodes reached, stopping collection');
        break;
      }

      const friendUrl = normalizeProfileUrl(friend.url);
      if (!friendUrl) {
        skippedCount++;
        continue;
      }

      // Add the friend as a node
      const isNew = addNode(friendUrl, friend.name, friendUrl, depth + 1);

      if (isNew) {
        addedCount++;
        // Add edge from current person to friend
        addEdge(url, friendUrl);

        // Queue for further scraping if new and not at max depth
        if (depth + 1 < config.maxDepth) {
          queue.push({ url: friendUrl, depth: depth + 1 });
        }
      } else {
        // Still add edge even if node existed (for edge connections)
        addEdge(url, friendUrl);
      }
    }

    log.info(`  Added ${addedCount} new nodes, ${skippedCount} skipped`);

    // Be nice - wait between pages
    await new Promise(r => setTimeout(r, config.pageDelay));

    // Save progress periodically
    saveGraph();
  }

  saveGraph();

  log.section('Scraping Complete');
  log.info(`Total nodes: ${graph.nodes.length}`);
  log.info(`Total edges: ${graph.edges.length}`);
  log.info(`Pages scraped: ${pagesScraped}`);
  log.info(`Data saved to: ${config.dataFile}`);
  log.info(`Log saved to: ${log.getLogFilePath()}`);
  log.info('Run "npm run serve" to visualize the graph.');

  log.close();
  await page.close();
}

function saveGraph() {
  const dir = path.dirname(config.dataFile);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(config.dataFile, JSON.stringify(graph, null, 2));
}

run().catch(console.error);
