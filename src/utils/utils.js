export const safeParseDate = (str) =>
  typeof str === "string" ? new Date(str.replace(" ", "T")) : null;
