import { Constants } from 'librechat-data-provider';

/** `lookup_mcp_docs` reads as "docs · lookup". A plain tool keeps its name. */
export function formatToolName(name: string): string {
  const split = name.lastIndexOf(Constants.mcp_delimiter);
  if (split <= 0) {
    return name;
  }
  return `${name.slice(split + Constants.mcp_delimiter.length)} · ${name.slice(0, split)}`;
}
