import { createPresenceServer } from './presence.mjs';
const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const app = createPresenceServer({ origins });
app.server.listen(Number(process.env.PORT || 3001), '0.0.0.0', () => console.log('Experimental presence server listening'));
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => app.close().then(() => process.exit(0)));
