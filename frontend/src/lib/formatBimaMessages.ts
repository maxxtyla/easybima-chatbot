/**
 * Cleans Bima's raw AI response before markdown rendering.
 * Handles common LLM output artifacts:
 * - Strips decorative separator lines (*** ═══ --- ___) 
 * - Removes lone asterisks used as fake bullets
 * - Normalises emoji/unicode bullets to standard markdown -
 * - Collapses excessive blank lines
 * - Auto-links bare URLs so react-markdown makes them clickable
 */
export function cleanBimaText(rawText: string): string {
  if (!rawText) return '';

  return rawText
    // 1. Remove full lines that are only separator characters (*** --- === ___ ═══ ───)
    .replace(/^[\*\=\-\_\─\═]{3,}\s*$/gm, '')

    // 2. Remove standalone asterisks used as decorative separators mid-text
    .replace(/^\*{1,3}\s*$/gm, '')

    // 3. Normalise emoji/unicode bullet variants to markdown list item
    .replace(/^[✓✗•◦▸▹→►]\s+/gm, '- ')

    // 4. Remove checkbox markers [x] [ ]
    .replace(/^\s*[-\*]\s*\[(x| )\]\s*/gm, '- ')

    // 5. Ensure a blank line before list blocks so markdown parses them as lists
    .replace(/([^\n])\n([-\*\d]\. )/g, '$1\n\n$2')

    // 6. Convert bare URLs (not already inside markdown link syntax) to clickable links
    //    Matches http/https URLs that aren't already preceded by ]( 
    .replace(/(?<!\]\()https?:\/\/[^\s)\]>,"']+/g, (url) => `[${url}](${url})`)

    // 7. Collapse 3+ consecutive blank lines to max 2
    .replace(/\n{3,}/g, '\n\n')

    // 8. Trim
    .trim();
}