export interface ParsedMessage {
  role: string;
  content: string;
}

export function parsePrompt(text: string): ParsedMessage[] {
  if (!text || !text.trim()) return [];

  // Try 1: JSON array of {role, content} objects
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].role !== undefined) {
      return parsed.map((m: Record<string, unknown>) => ({
        role: String(m.role || "unknown"),
        content: String(m.content ?? ""),
      }));
    }
  } catch {
    // Not JSON
  }

  // Try 2: ChatML — <|im_start|>role\ncontent<|im_end|>
  if (text.includes("<|im_start|>")) {
    const parts = text.split("<|im_start|>").filter(Boolean);
    return parts.map((part) => {
      const nlIdx = part.indexOf("\n");
      const role = nlIdx > 0 ? part.slice(0, nlIdx).trim() : "unknown";
      const content = (nlIdx > 0 ? part.slice(nlIdx + 1) : part)
        .replace(/<\|im_end\|>/g, "")
        .trim();
      return { role, content };
    });
  }

  // Try 3: Generic chat template — <|system|>, <|user|>, <|assistant|>
  if (/<\|(system|user|assistant)\|>/.test(text)) {
    const regex = /<\|(system|user|assistant)\|>/g;
    const positions: { role: string; start: number; tagEnd: number }[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      positions.push({
        role: match[1],
        start: match.index,
        tagEnd: match.index + match[0].length,
      });
    }
    return positions.map((pos, i) => {
      const end = i + 1 < positions.length ? positions[i + 1].start : text.length;
      return { role: pos.role, content: text.slice(pos.tagEnd, end).trim() };
    });
  }

  // Try 4: Llama-style — <<SYS>>, [INST], [/INST]
  if (text.includes("[INST]") || text.includes("<<SYS>>")) {
    const messages: ParsedMessage[] = [];
    const sysMatch = text.match(/<<SYS>>([\s\S]*?)<<\/SYS>>/);
    if (sysMatch) {
      messages.push({ role: "system", content: sysMatch[1].trim() });
    }
    // Split on [INST] and [/INST] markers
    const withoutSys = text.replace(/<<SYS>>[\s\S]*?<<\/SYS>>/g, "");
    const segments = withoutSys.split(/\[INST\]|\[\/INST\]/).map((s) => s.trim()).filter(Boolean);
    let isUser = true;
    for (const seg of segments) {
      messages.push({ role: isUser ? "user" : "assistant", content: seg });
      isUser = !isUser;
    }
    return messages.length > 0 ? messages : [{ role: "prompt", content: text }];
  }

  // Try 5: Plain labeled — "System:", "User:", "Assistant:", "Human:"
  if (/^(System|User|Assistant|Human):\s/m.test(text)) {
    const regex = /^(System|User|Assistant|Human):\s*/gm;
    const positions: { role: string; contentStart: number }[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      const role = match[1].toLowerCase() === "human" ? "user" : match[1].toLowerCase();
      positions.push({ role, contentStart: match.index + match[0].length });
    }
    return positions.map((pos, i) => {
      const end = i + 1 < positions.length
        ? text.lastIndexOf("\n", positions[i + 1].contentStart - positions[i + 1].role.length - 2)
        : text.length;
      return {
        role: pos.role,
        content: text.slice(pos.contentStart, end > pos.contentStart ? end : text.length).trim(),
      };
    });
  }

  // Fallback: single prompt block
  return [{ role: "prompt", content: text }];
}
