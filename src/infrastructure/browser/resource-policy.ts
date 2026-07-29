export const BLOCKED_BROWSER_RESOURCE_TYPES = new Set([
  'image',
  'media',
  'font',
  'websocket',
  'eventsource',
]);

export function shouldBlockBrowserResource(resourceType: string): boolean {
  return BLOCKED_BROWSER_RESOURCE_TYPES.has(resourceType);
}
