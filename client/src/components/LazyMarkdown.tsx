// react-markdown pulls in a sizeable AST/parser stack. Isolating it here keeps
// it out of the dashboard's initial chunk — it only loads when an AI answer is
// actually rendered.
import ReactMarkdown from 'react-markdown';

export default function LazyMarkdown({ children }: { children: string }) {
  return <ReactMarkdown>{children}</ReactMarkdown>;
}
