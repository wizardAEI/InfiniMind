import { Clipboard, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import Modal from "./Modal.jsx";

const themeOptions = [
  { id: "light", label: "Light", detail: "Paper field", Icon: Sun },
  { id: "dark", label: "Dark", detail: "Night field", Icon: Moon },
];

function SettingsModal({ theme, onThemeChange, onClose }) {
  const [activeSection, setActiveSection] = useState("appearance");
  const [mcpConfig, setMcpConfig] = useState(null);
  const [copiedKey, setCopiedKey] = useState(null);

  useEffect(() => {
    let cancelled = false;

    loadMcpConfig().then((config) => {
      if (!cancelled) {
        setMcpConfig(config);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function copySnippet(key, value) {
    if (!value) return;
    await copyText(value);
    setCopiedKey(key);
    window.setTimeout(() => setCopiedKey(null), 1200);
  }

  return (
    <Modal className="settings-modal" eyebrow="Preferences" title="Settings" onClose={onClose}>
      <div className="settings-shell">
        <nav className="settings-sidebar" aria-label="Settings sections">
          <button
            className={`settings-nav-item ${activeSection === "appearance" ? "active" : ""}`}
            type="button"
            aria-current={activeSection === "appearance" ? "page" : undefined}
            onClick={() => setActiveSection("appearance")}
          >
            <span>Appearance</span>
            <small>Theme</small>
          </button>
          <button
            className={`settings-nav-item ${activeSection === "mcp" ? "active" : ""}`}
            type="button"
            aria-current={activeSection === "mcp" ? "page" : undefined}
            onClick={() => setActiveSection("mcp")}
          >
            <span>MCP</span>
            <small>Local server</small>
          </button>
        </nav>

        {activeSection === "appearance" ? (
          <AppearanceSettingsPanel theme={theme} onThemeChange={onThemeChange} />
        ) : (
          <McpSettingsPanel mcpConfig={mcpConfig} copiedKey={copiedKey} onCopySnippet={copySnippet} />
        )}
      </div>
    </Modal>
  );
}

function AppearanceSettingsPanel({ theme, onThemeChange }) {
  return (
    <section className="settings-panel" aria-labelledby="appearance-settings-title">
      <header className="settings-panel-header">
        <div>
          <span>Appearance</span>
          <h3 id="appearance-settings-title">Theme</h3>
        </div>
      </header>

      <div className="theme-settings" role="radiogroup" aria-label="Theme">
        {themeOptions.map(({ id, label, detail, Icon }) => (
          <button
            className="theme-option"
            type="button"
            role="radio"
            aria-checked={theme === id}
            data-theme-option={id}
            key={id}
            onClick={() => onThemeChange(id)}
          >
            <span className="theme-swatch" aria-hidden="true">
              <span />
              <span />
            </span>
            <span className="theme-option-copy">
              <strong>
                <Icon size={15} />
                {label}
              </strong>
              <small>{detail}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function McpSettingsPanel({ mcpConfig, copiedKey, onCopySnippet }) {
  return (
    <section className="settings-panel" aria-labelledby="mcp-settings-title">
      <header className="settings-panel-header">
        <div>
          <span>MCP</span>
          <h3 id="mcp-settings-title">Connection</h3>
        </div>
      </header>

      {!mcpConfig ? (
        <div className="mcp-empty-state">
          <p>MCP configuration is available in the desktop app.</p>
        </div>
      ) : (
        <div className="mcp-settings">
          <section className="mcp-path-row">
            <span>Install path</span>
            <code>{mcpConfig.appRoot}</code>
          </section>

          <McpSnippet
            title="Recommended JSON"
            value={mcpConfig.json}
            copied={copiedKey === "json"}
            onCopy={() => onCopySnippet("json", mcpConfig.json)}
          />
          <McpSnippet
            title="Codex TOML"
            value={mcpConfig.codexToml}
            copied={copiedKey === "toml"}
            onCopy={() => onCopySnippet("toml", mcpConfig.codexToml)}
          />
          <McpSnippet
            title="Fallback JSON"
            value={mcpConfig.fallbackJson}
            copied={copiedKey === "fallback"}
            onCopy={() => onCopySnippet("fallback", mcpConfig.fallbackJson)}
          />
        </div>
      )}
    </section>
  );
}

function McpSnippet({ title, value, copied, onCopy }) {
  return (
    <section className="mcp-snippet">
      <header>
        <h3>{title}</h3>
        <button type="button" title={`Copy ${title}`} aria-label={`Copy ${title}`} onClick={onCopy}>
          <Clipboard size={15} />
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </header>
      <pre>{value}</pre>
    </section>
  );
}
async function loadMcpConfig() {
  if (!window.infinimindStorage?.mcpConfig) {
    return null;
  }

  try {
    return window.infinimindStorage.mcpConfig();
  } catch {
    return null;
  }
}

async function copyText(value) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

export default SettingsModal;
