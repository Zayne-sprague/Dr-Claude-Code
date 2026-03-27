import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

interface Props {
  content: string;
}

export default function Markdown({ content }: Props) {
  return (
    <div className="break-words" style={{ overflowWrap: "anywhere" }}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        h1: ({ children }) => <h1 className="text-xl font-bold text-gray-200 mb-3 mt-6 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-semibold text-gray-200 mb-2 mt-5 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-base font-semibold text-gray-300 mb-2 mt-4">{children}</h3>,
        h4: ({ children }) => <h4 className="text-sm font-semibold text-gray-300 mb-1 mt-3">{children}</h4>,
        p: ({ children }) => <p className="text-sm text-gray-300 mb-2 leading-relaxed whitespace-pre-wrap break-words">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-inside text-sm text-gray-300 mb-2 space-y-0.5 ml-2">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside text-sm text-gray-300 mb-2 space-y-0.5 ml-2">{children}</ol>,
        li: ({ children }) => <li className="text-sm text-gray-300">{children}</li>,
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline">
            {children}
          </a>
        ),
        code: ({ className, children }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <pre className="bg-gray-950 border border-gray-800 rounded p-3 mb-2 overflow-x-auto">
                <code className="text-xs text-gray-300 font-mono">{children}</code>
              </pre>
            );
          }
          return <code className="bg-gray-800 text-cyan-300 text-xs px-1 py-0.5 rounded font-mono">{children}</code>;
        },
        pre: ({ children }) => <>{children}</>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-gray-600 pl-3 my-2 text-sm text-gray-400 italic">{children}</blockquote>
        ),
        hr: () => <hr className="border-gray-700 my-4" />,
        strong: ({ children }) => <strong className="text-gray-200 font-semibold">{children}</strong>,
        em: ({ children }) => <em className="text-gray-400">{children}</em>,
        table: ({ children }) => (
          <div className="overflow-x-auto mb-3">
            <table className="w-full text-sm border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="border-b border-gray-700">{children}</thead>,
        tbody: ({ children }) => <tbody>{children}</tbody>,
        tr: ({ children }) => <tr className="border-b border-gray-800/50">{children}</tr>,
        th: ({ children }) => <th className="text-left py-1.5 px-2 text-xs text-gray-400 uppercase tracking-wide font-medium">{children}</th>,
        td: ({ children }) => <td className="py-1.5 px-2 text-sm text-gray-300">{children}</td>,
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  );
}
