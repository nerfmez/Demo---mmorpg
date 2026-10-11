// Explicit build modes keep the public player and developer/offline entry separate.
// vite.config.js resolves this per mode: the player build waits for the relay before
// importing the game; every other build loads the game in the page's own module graph.
import '@frontier/entry';
