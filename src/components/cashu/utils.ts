export function truncateUrl(url: string, maxLen: number): string {
  if (url.length <= maxLen) {
    return url;
  }

  return url.slice(0, maxLen - 3) + '...';
}
