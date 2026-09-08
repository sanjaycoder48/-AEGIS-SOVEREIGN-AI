import { parseAnswer } from '../lib/format';

export function AnswerRenderer({ text }: { text: string }) {
  const blocks = parseAnswer(text);

  return (
    <>
      {blocks.map((block) => {
        if (block.kind === 'heading') return <h3 key={block.id}>{block.text}</h3>;
        if (block.kind === 'list') {
          return (
            <ul key={block.id}>
              {(block.items || []).map((item) => (
                <li key={item}><InlineRichText text={item} /></li>
              ))}
            </ul>
          );
        }
        return <p key={block.id}><InlineRichText text={block.text || ''} /></p>;
      })}
    </>
  );
}

function InlineRichText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*.*?\*\*)/g).filter(Boolean).map((part, index) => {
        const key = `${part}-${index}`;
        return part.startsWith('**') && part.endsWith('**')
          ? <strong key={key}>{part.slice(2, -2)}</strong>
          : <span key={key}>{part}</span>;
      })}
    </>
  );
}
