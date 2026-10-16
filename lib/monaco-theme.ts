// Monaco editor theme configuration for Vercel-like dark mode
export const vercelDarkTheme = {
  base: "vs-dark" as const,
  colors: {
    "editor.background": "#000000",
    "editor.foreground": "#ededed",
    "editor.inactiveSelectionBackground": "#1A1A1A",
    "editor.lineHighlightBackground": "#0A0A0A",
    "editor.selectionBackground": "#264F78",
    "editorBracketMatch.background": "#0A0A0A",
    "editorBracketMatch.border": "#444444",
    "editorCursor.foreground": "#FFFFFF",
    "editorIndentGuide.activeBackground": "#333333",
    "editorIndentGuide.background": "#1A1A1A",
    "editorLineNumber.activeForeground": "#888888",
    "editorLineNumber.foreground": "#444444",
    "editorWhitespace.foreground": "#333333",
  },
  inherit: true,
  rules: [
    // Default foreground
    { foreground: "ededed", token: "" },

    // Comments
    { fontStyle: "italic", foreground: "a1a1a1", token: "comment" },

    // Keywords (pink)
    { foreground: "ff4d8d", token: "keyword" },
    { foreground: "ff4d8d", token: "keyword.operator" },

    // Strings (green)
    { foreground: "00ca50", token: "string" },
    { foreground: "00ca50", token: "string.escape" },

    // Numbers (white)
    { foreground: "ffffff", token: "number" },

    // Types (blue)
    { foreground: "47a8ff", token: "type" },
    { foreground: "47a8ff", token: "type.identifier" },

    // Identifiers and parameters (light gray - default)
    { foreground: "ededed", token: "identifier" },
    { foreground: "ededed", token: "parameter" },
    { foreground: "ededed", token: "variable" },
    { foreground: "ededed", token: "variable.parameter" },

    // Functions (purple)
    { foreground: "c472fb", token: "function" },
    { foreground: "c472fb", token: "identifier.function" },
    { foreground: "c472fb", token: "member.function" },

    // Built-in constants like true/false/null (blue)
    { foreground: "47a8ff", token: "constant.language" },
    { foreground: "47a8ff", token: "keyword.json" },

    // Built-in objects like console (light gray)
    { foreground: "ededed", token: "variable.predefined" },
    { foreground: "ededed", token: "support.variable" },
    { foreground: "ededed", token: "support.constant" },

    // Delimiters and punctuation (light gray)
    { foreground: "ededed", token: "delimiter" },
    { foreground: "ededed", token: "delimiter.bracket" },
    { foreground: "ededed", token: "delimiter.parenthesis" },
    { foreground: "ededed", token: "delimiter.curly" },
    { foreground: "ededed", token: "delimiter.array" },
    { foreground: "ededed", token: "punctuation" },

    // Operators (light gray)
    { foreground: "ededed", token: "operator" },

    // JSON-specific tokens
    { foreground: "47a8ff", token: "string.key.json" },
    { foreground: "00ca50", token: "string.value.json" },
    { foreground: "ffffff", token: "number.json" },
    { foreground: "47a8ff", token: "keyword.json" },
  ],
};
