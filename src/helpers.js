// Description: Helper functions used in the application
// The helper functions are used to perform common tasks such as validating input, sanitizing data, and formatting data.

// Function: isValidUrl - Check if a given URL is valid
export function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

// Function: sanitizeInput - Sanitize input data to prevent XSS attacks
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

// Function: generateBaseUrl - Generate a base URL from the given parameters
export function generateBaseUrl(is_secure, host, port) {
  let prefix = "http";

  if (is_secure) {
    prefix = "https";
  }

  if (isNaN(port) || port == 0) {
    return `${prefix}://${host}`;
  }

  return `${prefix}://${host}:${port}`;
}

// Function: formatBytes - Format the given size in bytes to a human-readable format
export function formatBytes(size) {
  const i = size == 0 ? 0 : Math.floor(Math.log(size) / Math.log(1024));
  return (
    +(size / Math.pow(1024, i)).toFixed(2) * 1 +
    ["B", "kB", "MB", "GB", "TB"][i]
  );
}
