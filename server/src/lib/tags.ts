export function parseTagInput(value: string): string[] {
  return value
    .split(/[,，]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function formatTagInput(tags: string[]): string {
  return tags.join('，');
}
