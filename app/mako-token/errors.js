'use strict';
// S35 mako-token: one error type with a stable code, so every refusal is visible and testable.
// Messages never contain a token, a key, a JWT or a PEM; scrub() removes anything shaped like one
// from text that came from outside (an HTTP error body, a child process).

class MakoTokenError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MakoTokenError';
    this.code = code;
  }
}

const SECRET_SHAPES = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
  /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g,
];

function scrub(text) {
  let out = String(text == null ? '' : text);
  for (const re of SECRET_SHAPES) out = out.replace(re, '[removed]');
  return out.length > 300 ? out.slice(0, 300) + '...' : out;
}

module.exports = { MakoTokenError, scrub };
