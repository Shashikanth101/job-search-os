import { formatPlainText, looksLikeHtml } from '../../utils/formatDescription';
import { sanitizeHtml } from '../../utils/sanitizeHtml';

/**
 * Formatted job description. HTML is sanitized (allow-list, no scripts or handlers) before it is rendered; plain text is split
 * into headings, bullet lists and paragraphs and rendered as React elements, so unsanitized text is never injected as HTML.
 * @param {{text: string|null|undefined}} props - Stored description.
 */
export function DescriptionView({ text }) {
  if (!text) return <p className="text-sm text-slate-500">No description stored.</p>;
  if (looksLikeHtml(text)) {
    // eslint-disable-next-line react/no-danger -- sanitized by sanitizeHtml (DOMPurify allow-list, fails closed)
    return <div className="description" dangerouslySetInnerHTML={{ __html: sanitizeHtml(text) }} />;
  }
  return (
    <div className="description">
      {formatPlainText(text).map((block, index) => {
        if (block.type === 'heading') return <h4 key={index}>{block.text}</h4>;
        if (block.type === 'list') return <ul key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>;
        return <p key={index}>{block.text}</p>;
      })}
    </div>
  );
}
