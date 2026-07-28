/** Syntax highlighting minimale per blocchi JSON (JSON-LD, eventi EPCIS) — restituisce HTML con span colorati. */
export function highlightJson(json: string): string {
  if (!json) return '';
  const escaped = json
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      let cls = 'jl-number';
      if (/^"/.test(match)) {
        cls = /:$/.test(match) ? 'jl-key' : 'jl-string';
      } else if (/true|false/.test(match)) {
        cls = 'jl-bool';
      } else if (/null/.test(match)) {
        cls = 'jl-null';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}
