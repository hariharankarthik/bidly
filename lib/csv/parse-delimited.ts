/**
 * Minimal CSV/TSV parser (quoted fields, escaped quotes). No dependency.
 */
export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;

    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      continue;
    }

    if (c === delimiter) {
      row.push(field.trim());
      field = "";
      continue;
    }

    if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field.trim());
      field = "";
      if (row.some((x) => x.length > 0)) {
        rows.push(row);
      }
      row = [];
      continue;
    }

    field += c;
  }

  row.push(field.trim());
  if (row.some((x) => x.length > 0)) {
    rows.push(row);
  }

  return rows;
}

/** Guess delimiter from header line: tab > semicolon > comma */
export function detectDelimiter(sample: string): string {
  const line = sample.split(/\r?\n/)[0] ?? "";
  if (line.includes("\t")) return "\t";
  const commas = (line.match(/,/g) ?? []).length;
  const semis = (line.match(/;/g) ?? []).length;
  if (semis > commas) return ";";
  return ",";
}
