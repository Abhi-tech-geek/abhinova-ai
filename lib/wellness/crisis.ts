// Crisis signal check. Never attempt to handle a crisis with AI alone — surface
// these helplines and keep the tone caring (see CLAUDE.md Wellness Mode Rules).
// Detection = this keyword pass + an LLM structured flag in the same chat call.
// Only a boolean ever gets stored; analysis details are never logged.

export const CRISIS_HELPLINES = [
  { name: "Tele-MANAS (24x7)", number: "14416" },
  { name: "KIRAN", number: "1800-599-0019" },
  { name: "Emergency", number: "112" },
] as const;

// English + Hindi/Hinglish phrases. Deliberately conservative: better a rare
// extra support card than a missed signal.
const CRISIS_PATTERNS: RegExp[] = [
  /suicid/i,
  /kill (?:my ?self|myself)/i,
  /end (?:my|it) (?:life|all)/i,
  /(?:want|wish) to die/i,
  /wish i (?:was|were) dead/i,
  /self[- ]?harm/i,
  /(?:hurt|cut(?:ting)?) myself/i,
  /no reason to live/i,
  /better off without me/i,
  /khudkushi/i,
  /aatma?hatya/i,
  /marna chah/i,
  /mar ja(?:u|un|na chahta|na chahti)/i,
  /jeena nahi chah/i,
  // Common everyday phrasings — the keyword pass is the only check left when
  // the AI (and its own risk flag) is unavailable.
  /j(?:ee|e|i)na nahi? (?:hai|h\b|hain|rah|chah)/i,
  /j(?:ee|i)ne ka (?:mann|man|dil) nahi/i,
  /zinda nahi? (?:rehna|rahna)/i,
  /(?:ab|aur) (?:aur )?nahi jee?/i,
  /mar(?:na|ne|jana|ja) (?:hai|chahta|chahti|chahiye)/i,
  /apni jaan le/i,
  /khatam kar (?:lu|loon|lunga|lungi|dunga|dungi)/i,
  /(?:sab|sabkuch|sab kuch|khud ko) khatam kar/i,
  // Devanagari.
  /आत्महत्या|ख़ुदकुशी|खुदकुशी/,
  /मरना चाह|मर जाना चाह|मर जाऊ/,
  /जीना नहीं|जीने का मन नहीं|ज़िंदा नहीं रहना|जिंदा नहीं रहना/,
];

export function containsCrisisSignal(text: string): boolean {
  return CRISIS_PATTERNS.some((pattern) => pattern.test(text));
}
