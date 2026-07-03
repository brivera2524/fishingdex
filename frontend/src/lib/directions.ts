// Apple Maps opens the native app directly on iOS/iPadOS Safari (including
// installed PWAs); everywhere else, Google Maps' universal link opens its
// native app if installed or falls back to the web map otherwise. Detected
// once by platform rather than asking the user, since this is just "open
// directions", not a preference worth a setting.
function isApplePlatform(): boolean {
  return /iPad|iPhone|iPod|Macintosh/.test(navigator.userAgent) && "ontouchend" in document;
}

export function getDirectionsUrl(lat: number, lng: number): string {
  if (isApplePlatform()) {
    return `https://maps.apple.com/?daddr=${lat},${lng}`;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
