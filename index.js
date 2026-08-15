export const name = 'my-skin';

// Host half of the dual-face skin package: its loader entry composes the
// browser graph and serves /plugins/my-skin/client.js. The theme registration
// lives in the browser half (lib/client.js), which has the client-side
// `theme` service; the host context has no such service, so this apply is a
// deliberate no-op.
export function apply() {}
