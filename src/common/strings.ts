/** Collapse whitespace runs (newlines, indentation) into single spaces; trim ends. */
export const flatten = (s: string): string => s.replace(/\s+/g, " ").trim();
