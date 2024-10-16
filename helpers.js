export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

// Sanitize input to prevent XSS attacks
export function sanitizeInput(input) {
  return input.replace(/[<>&'"]/g, (char) => {
    const entities = {
      "<": "&lt;",
      ">": "&gt;",
      "&": "&amp;",
      "'": "&#39;",
      '"': "&quot;",
    };
    return entities[char];
  });
}
