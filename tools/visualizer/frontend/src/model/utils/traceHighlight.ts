export interface HighlightSegment {
  text: string;
  className: string;
}

export function highlightTrace(text: string): HighlightSegment[] {
  if (!text) return [{ text: "(no response)", className: "text-gray-500 italic" }];

  const segments: HighlightSegment[] = [];
  const lines = text.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lo = line.toLowerCase().trim();

    let className = "text-gray-300";

    if (lo.startsWith("wait") || lo.startsWith("hmm") || lo.startsWith("but wait")) {
      className = "text-yellow-400";
    } else if (lo.startsWith("let me try") || lo.startsWith("let me reconsider") || lo.startsWith("let me think")) {
      className = "text-cyan-400";
    } else if (lo.startsWith("so the answer") || lo.startsWith("so the expression") || lo.startsWith("therefore") || lo.startsWith("the final")) {
      className = "text-green-400 font-bold";
    } else if (lo.startsWith("i give up") || lo.startsWith("i can't find") || lo.startsWith("i'm stuck") || lo.startsWith("i'm sorry")) {
      className = "text-red-400 font-bold";
    } else if (line.includes("=") && /[+\-*/]/.test(line)) {
      className = "text-gray-100";
    }

    segments.push({ text: line, className });
    if (i < lines.length - 1) {
      segments.push({ text: "\n", className: "" });
    }
  }

  return segments;
}
