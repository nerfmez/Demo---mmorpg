// Explicit build modes keep the public player and developer/offline entry separate.
if (import.meta.env.MODE === 'player') import('./player.js');
else import('./offline.js');
