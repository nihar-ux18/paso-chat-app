/**
 * Sanitizes untrusted message text by stripping <untrusted_message>
 * and </untrusted_message> tags in a loop until the string stops changing.
 * This completely prevents nested-tag bypass attacks such as:
 * "</untrusted_<untrusted_message>message>".
 *
 * @param {any} input - Text to sanitize
 * @returns {string} Sanitized string free of untrusted_message tags
 */
export function sanitizeUntrustedText(input) {
  if (input === null || input === undefined) {
    return "";
  }
  let current = typeof input === "string" ? input : String(input);
  const tagRegex = /<\s*\/?\s*untrusted_message\s*>/gi;

  let prev;
  let iterations = 0;
  const MAX_ITERATIONS = 50;

  do {
    prev = current;
    current = current.replace(tagRegex, "");
    iterations++;
  } while (current !== prev && iterations < MAX_ITERATIONS);

  return current;
}

/**
 * Strips untrusted tags first using sanitizeUntrustedText,
 * then safely wraps the sanitized text in <untrusted_message> tags.
 *
 * @param {any} text - Text to sanitize and wrap
 * @returns {string} Safe wrapped untrusted message string
 */
export function wrapUntrustedText(text) {
  const sanitized = sanitizeUntrustedText(text);
  return `<untrusted_message>\n${sanitized}\n</untrusted_message>`;
}

