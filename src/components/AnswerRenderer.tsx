import { parseAnswer } from '../lib/format';
import type { Finding } from '../lib/format';

const SEVERITY_LABEL: Record<Finding['severity'], string> = {
  high: 'HIGH',
  medium: 'MEDIUM',
  low: 'LOW',
};

export function AnswerRenderer({ text }: { text: string }) {
  const blocks = parseAnswer(text);

  return (
    <>
      {blocks.map((block) => {
        if (block.kind === 'heading') return <h3 key={block.id}>{block.text}</h3>;

        if (block.kind === 'findings') {
          return (
            <div className="findings" key={block.id}>
              {(block.findings || []).map((finding) => (
                <div className={`finding-row sev-${finding.severity}`} key={finding.id}>
                  <span className="f-id">{finding.id}</span>
                  <span className="f-sev">{SEVERITY_LABEL[finding.severity]}</span>
                  <span><InlineRichText text={finding.text} /></span>
                </div>
              ))}
            </div>
          );
        }

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
