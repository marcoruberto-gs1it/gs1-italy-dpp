/**
 * Renderer Markdown minimale per le risposte dell'assistente.
 *
 * Il modello risponde in Markdown, ma la bolla lo mostrava come testo grezzo: da lì gli
 * asterischi e i cancelletti a vista. Qui il Markdown diventa HTML semantico, che
 * `styles.css` veste con i token del sito.
 *
 * Perché scritto a mano invece di una libreria: il sottoinsieme che serve è piccolo e
 * prevedibile, e soprattutto l'ordine delle operazioni è una garanzia di sicurezza —
 * **prima** si neutralizza ogni carattere HTML dell'input, **poi** si introducono i soli
 * tag che decidiamo noi. Nessun percorso permette al testo del modello di iniettare
 * markup: non serve un sanitizer, e non entra una dipendenza in più nel bundle.
 *
 * Sottoinsieme gestito: titoli (#, ##, ###), grassetto, corsivo, codice inline, link,
 * liste puntate e numerate, citazioni, righe orizzontali, paragrafi.
 */

/** Neutralizza l'HTML dell'input. Da chiamare per prima, sempre. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Formattazione inline, applicata a testo già neutralizzato. */
function renderInline(text: string): string {
  return (
    text
      // `codice` — prima di tutto il resto, così non ne viene toccato il contenuto
      .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>')
      // **grassetto** e __grassetto__
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/__([^_]+)__/g, "<strong>$1</strong>")
      // *corsivo* — solo se non fa parte di ** già consumato
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>")
      // [testo](url): l'href accetta solo http/https, mai javascript: o data:
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
      )
  );
}

/** Converte il Markdown del modello in HTML pronto per la bolla. */
export function renderMarkdown(source: string): string {
  const lines = escapeHtml(source).split("\n");
  const html: string[] = [];

  // Tipo di lista aperta al momento (null = nessuna), per chiudere al punto giusto.
  let listTag: "ul" | "ol" | null = null;
  let paragraph: string[] = [];

  const closeList = () => {
    if (listTag) {
      html.push(`</${listTag}>`);
      listTag = null;
    }
  };

  const closeParagraph = () => {
    if (paragraph.length) {
      html.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
      paragraph = [];
    }
  };

  const openList = (tag: "ul" | "ol") => {
    if (listTag !== tag) {
      closeList();
      html.push(`<${tag}>`);
      listTag = tag;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    // Riga vuota: chiude paragrafo e lista in corso.
    if (!line.trim()) {
      closeParagraph();
      closeList();
      continue;
    }

    // Riga orizzontale (--- o ***)
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) {
      closeParagraph();
      closeList();
      html.push("<hr>");
      continue;
    }

    // Titoli: tutti i livelli finiscono in h3/h4, perché dentro una bolla di chat un h1
    // avrebbe un peso tipografico fuori scala.
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      closeParagraph();
      closeList();
      const tag = heading[1].length <= 2 ? "h3" : "h4";
      html.push(`<${tag}>${renderInline(heading[2].replace(/[*_]/g, ""))}</${tag}>`);
      continue;
    }

    // Citazione
    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      closeParagraph();
      closeList();
      html.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
      continue;
    }

    // Voce di lista puntata (accetta l'indentazione dei sotto-elenchi, appiattendoli:
    // in una bolla stretta i livelli annidati diventano illeggibili)
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    if (bullet) {
      closeParagraph();
      openList("ul");
      html.push(`<li>${renderInline(bullet[1])}</li>`);
      continue;
    }

    // Voce di lista numerata
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (numbered) {
      closeParagraph();
      openList("ol");
      html.push(`<li>${renderInline(numbered[1])}</li>`);
      continue;
    }

    // Testo normale: si accumula, così righe consecutive formano un unico paragrafo.
    closeList();
    paragraph.push(line.trim());
  }

  closeParagraph();
  closeList();

  return html.join("");
}
