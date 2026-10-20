/** Load-only adaptation of mdx-m3-viewer SlkFile.load, MIT.
 * Copyright (c) 2013-2021 Chananya Freiman.
 * Upstream @41cf2d69e5e78da4497d4fae06c9566a206d493d src/parsers/slk/file.ts.
 * Full license: docs/licenses/mdx-m3-viewer-MIT.txt; see UPSTREAM_LEDGER.
 * Retains sparse coordinates and ignores unreliable B dimensions. Added quoted
 * token handling and validation; no save/editor functionality or dependencies. */
export function parseSlk(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  if (!/^ID(?:;|\r?\n|$)/.test(text)) throw new Error("SLK: invalid header");
  const rows: string[][] = [];
  let x = 0, y = 0, ended = false, cells = 0;
  for (const raw of text.split(/\r\n|\r|\n/)) {
    const line = raw.trim();
    if (line === "E") { ended = true; break; }
    if (!line || line[0] === "B") continue;
    const tokens: string[] = [];
    let token = "", quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      if (ch === '"') {
        if (quoted && line[i + 1] === '"') { token += '""'; i++; continue; }
        quoted = !quoted;
      }
      if (ch === ";" && !quoted) { tokens.push(token); token = ""; }
      else token += ch;
    }
    if (quoted) throw new Error("SLK: unterminated quoted value");
    tokens.push(token);
    if (tokens[0] !== "C" && tokens[0] !== "F") continue;
    let value: string | undefined;
    for (const item of tokens.slice(1)) {
      const op = item[0], argument = item.slice(1).trim();
      if (op === "X" || op === "Y") {
        if (!/^[1-9]\d*$/.test(argument) || Number(argument) > 1_000_000)
          throw new Error("SLK: invalid coordinate " + argument);
        if (op === "X") x = Number(argument) - 1;
        else y = Number(argument) - 1;
      } else if (op === "K" && tokens[0] === "C") {
        if (value !== undefined) throw new Error("SLK: multiple cell values");
        value = argument.startsWith('"') ? argument.slice(1, -1).replace(/""/g, '"') : argument;
      }
    }
    if (value !== undefined) {
      if (++cells > 1_000_000) throw new Error("SLK: excessive cell count");
      (rows[y] ??= [])[x] = value;
    }
  }
  if (!ended) throw new Error("SLK: missing end record");
  return rows;
}
