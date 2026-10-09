// The player entry installs this before importing main. offline.html never installs it.
export let onlineRuntime = null;
export function setOnlineRuntime(runtime) { onlineRuntime = runtime; }
