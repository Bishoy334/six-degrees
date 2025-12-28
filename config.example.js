module.exports = {
  // Traversal limits
  maxDepth: 3,              // 1 = just your friends, 2 = friends of friends, etc.
  maxNodes: 5000,           // Stop after collecting this many people
  maxFriendsPerPerson: 200, // Limit friends scraped per person (0 = unlimited) - prioritizes breadth

  // Timing (be gentle to avoid detection)
  scrollDelay: 1500,        // ms between scroll actions
  pageDelay: 3000,          // ms between navigating to different profiles
  scrollTimeout: 30000,     // max ms to spend scrolling a single friends list

  // Browser connection
  // Run Chrome with: /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
  browserWSEndpoint: null,  // Auto-detected, or set manually
  debuggingPort: 9222,

  // Output
  dataFile: './data/graph.json',

  // Starting point (your Facebook profile URL)
  // Set this to your profile URL before running
  startUrl: "https://www.facebook.com/your.username",
};
