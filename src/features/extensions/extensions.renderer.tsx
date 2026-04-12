import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Icon } from "../../renderer/src/components/Icon";
import {
  PageHeader,
  settingsIconButtonStyle,
  settingsInputStyle,
} from "../../renderer/src/components/SettingsLayout";
import type { CWSSearchResult, InstalledExtension } from "./extensions.shared";
import {
  installExtension,
  setExtensionEnabled,
  setSearchQuery,
  uninstallExtension,
  useExtensionsStore,
} from "./extensions.store";

// ── Formatting helpers ─────────────────────────────────────────

function formatUserCount(count: number): string {
  if (count >= 1_000_000) return `${Math.round(count / 1_000_000)}M+`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}K+`;
  return `${count}`;
}

// ── Extension Icon (with fallback) ─────────────────────────────

function ExtensionIcon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);

  if (!url || failed) {
    return (
      <Icon
        name="puzzle-piece"
        style="solid"
        css={{ fontSize: "0.875rem", color: "var(--muted-foreground)" }}
      />
    );
  }

  return (
    <img
      src={url}
      alt=""
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
      onError={() => setFailed(true)}
    />
  );
}

// ── Search Result Card ──────────────────────────────────────────

function SearchResultCard({
  result,
  isInstalled,
  isInstalling,
  installError,
}: {
  result: CWSSearchResult;
  isInstalled: boolean;
  isInstalling: boolean;
  installError: string | undefined;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        background: "var(--card)",
      }}
    >
      <div
        style={{
          width: "2.5rem",
          height: "2.5rem",
          borderRadius: "var(--radius-sm)",
          background: "var(--muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <ExtensionIcon url={result.iconUrl} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "var(--text-base)",
            fontWeight: 500,
            color: "var(--foreground)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {result.name}
        </div>
        {result.description && (
          <div
            style={{
              fontSize: "var(--text-sm)",
              color: "var(--content-text-secondary)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {result.description}
          </div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.625rem",
            marginTop: "0.25rem",
            fontSize: "var(--text-xs)",
            color: "var(--muted-foreground)",
          }}
        >
          {result.featured && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.25rem",
                color: "var(--primary)",
              }}
            >
              <Icon name="certificate" style="solid" css={{ fontSize: "0.625rem" }} />
              Featured
            </span>
          )}
          {result.rating != null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <Icon name="star" style="solid" css={{ fontSize: "0.5625rem", color: "#f59e0b" }} />
              {result.rating.toFixed(1)}
              {result.ratingCount != null && (
                <span style={{ color: "var(--muted-foreground)" }}>
                  ({formatUserCount(result.ratingCount)})
                </span>
              )}
            </span>
          )}
          {result.userCount != null && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
              <Icon name="users" style="solid" css={{ fontSize: "0.5625rem" }} />
              {formatUserCount(result.userCount)} users
            </span>
          )}
        </div>
        {installError && (
          <div
            style={{
              fontSize: "var(--text-xs)",
              color: "var(--destructive-foreground)",
              marginTop: "0.25rem",
            }}
          >
            Failed: {installError}
          </div>
        )}
      </div>

      <button
        type="button"
        disabled={isInstalled || isInstalling}
        onClick={() => installExtension(result.id, result.name)}
        className={isInstalled || isInstalling ? "" : "hover:opacity-90 active:opacity-80"}
        style={{
          padding: "0.375rem 0.75rem",
          minHeight: "var(--click-target-min)",
          fontSize: "var(--text-sm)",
          fontFamily: "inherit",
          fontWeight: 500,
          color: isInstalled
            ? "var(--muted-foreground)"
            : isInstalling
              ? "var(--muted-foreground)"
              : "var(--primary-foreground)",
          background: isInstalled
            ? "transparent"
            : isInstalling
              ? "var(--muted)"
              : "var(--primary)",
          border: isInstalled ? "1px solid var(--border)" : "none",
          borderRadius: "var(--radius-sm)",
          cursor: isInstalled || isInstalling ? "default" : "pointer",
          whiteSpace: "nowrap",
          transition: "opacity var(--duration-fast), background var(--duration-fast)",
          flexShrink: 0,
        }}
      >
        {isInstalled ? "Installed" : isInstalling ? "Installing..." : "Install"}
      </button>
    </div>
  );
}

// ── Installed Extension Card ────────────────────────────────────

function InstalledExtensionCard({ extension }: { extension: InstalledExtension }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.75rem",
        padding: "0.75rem",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        background: "var(--card)",
      }}
    >
      <div
        style={{
          width: "2.5rem",
          height: "2.5rem",
          borderRadius: "var(--radius-sm)",
          background: "var(--muted)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon
          name="puzzle-piece"
          style="solid"
          css={{
            fontSize: "0.875rem",
            color: extension.enabled ? "var(--foreground)" : "var(--muted-foreground)",
          }}
        />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "var(--text-base)",
            fontWeight: 500,
            color: "var(--foreground)",
          }}
        >
          {extension.name}
        </div>
        <div
          style={{
            fontSize: "var(--text-xs)",
            color: "var(--content-text-secondary)",
          }}
        >
          v{extension.version} &middot; {extension.enabled ? "Enabled" : "Disabled"}
        </div>
      </div>

      <label
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          cursor: "pointer",
          flexShrink: 0,
          minHeight: "var(--click-target-min)",
        }}
      >
        <input
          type="checkbox"
          checked={extension.enabled}
          onChange={(e) => setExtensionEnabled(extension.id, e.target.checked)}
          className="peer"
          style={{
            position: "absolute",
            opacity: 0,
            width: 0,
            height: 0,
          }}
        />
        <span
          className="peer-focus-visible:ring-2 peer-focus-visible:ring-ring"
          style={{
            width: "2.25rem",
            height: "1.25rem",
            borderRadius: "999px",
            background: extension.enabled ? "var(--primary)" : "var(--muted)",
            position: "relative",
            transition: "background var(--duration-fast)",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: "0.125rem",
              left: extension.enabled ? "calc(100% - 1.125rem)" : "0.125rem",
              width: "1rem",
              height: "1rem",
              borderRadius: "var(--radius-full)",
              background: extension.enabled ? "var(--primary-foreground)" : "var(--foreground)",
              transition: "left var(--duration-fast)",
            }}
          />
        </span>
      </label>

      <button
        type="button"
        onClick={() => uninstallExtension(extension.id)}
        aria-label={`Uninstall ${extension.name}`}
        data-tip={`Uninstall ${extension.name}`}
        className="hover:bg-accent hover:text-destructive-foreground active:opacity-80"
        style={settingsIconButtonStyle}
      >
        <Icon name="trash-can" style="solid" css={{ fontSize: "var(--text-xs)" }} />
      </button>
    </div>
  );
}

// ── Extensions Page ─────────────────────────────────────────────

export default function ExtensionsPage(_props: { params: Record<string, string> }) {
  const { extensions, searchQuery, searchResults, searchLoading, installing, installErrors } =
    useExtensionsStore(
      useShallow((s) => ({
        extensions: s.extensions,
        searchQuery: s.searchQuery,
        searchResults: s.searchResults,
        searchLoading: s.searchLoading,
        installing: s.installing,
        installErrors: s.installErrors,
      })),
    );

  const installedIds = new Set(extensions.map((e) => e.id));

  return (
    <div
      className="dark"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--content-bg)",
        color: "var(--foreground)",
      }}
    >
      <PageHeader icon="puzzle-piece" title="Extensions" />
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem 2rem 2rem",
        }}
      >
        {/* Search section */}
        <section>
          <h2
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--muted-foreground)",
              margin: "0 0 0.5rem",
              padding: "0.5rem 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            Chrome Web Store
          </h2>

          <div style={{ position: "relative", marginBottom: "0.75rem" }}>
            <Icon
              name="magnifying-glass"
              style="solid"
              css={{
                fontSize: "0.625rem",
                left: "0.625rem",
                top: "50%",
                transform: "translateY(-50%)",
                color: "var(--muted-foreground)",
                pointerEvents: "none",
                position: "absolute",
              }}
            />
            <input
              type="text"
              placeholder="Search extensions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                ...settingsInputStyle,
                paddingLeft: "1.75rem",
                maxWidth: "24rem",
              }}
            />
          </div>

          {searchLoading && searchResults.length === 0 && (
            <div
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--muted-foreground)",
                padding: "0.75rem 0",
              }}
            >
              Searching...
            </div>
          )}

          {searchResults.length > 0 && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.375rem",
                marginBottom: "1.5rem",
              }}
            >
              {searchResults.map((result) => (
                <SearchResultCard
                  key={result.id}
                  result={result}
                  isInstalled={installedIds.has(result.id)}
                  isInstalling={installing.has(result.id)}
                  installError={installErrors.get(result.id)}
                />
              ))}
            </div>
          )}

          {searchQuery && !searchLoading && searchResults.length === 0 && (
            <div
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--muted-foreground)",
                padding: "0.75rem 0",
                marginBottom: "1.5rem",
              }}
            >
              No extensions found for &ldquo;{searchQuery}&rdquo;
            </div>
          )}
        </section>

        {/* Installed extensions section */}
        <section>
          <h2
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--muted-foreground)",
              margin: "0 0 0.5rem",
              padding: "0.5rem 0",
              borderBottom: "1px solid var(--border)",
            }}
          >
            Installed
          </h2>

          {extensions.length === 0 ? (
            <div
              style={{
                fontSize: "var(--text-sm)",
                color: "var(--muted-foreground)",
                padding: "0.75rem 0",
              }}
            >
              No extensions installed. Search the Chrome Web Store above to find extensions.
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.375rem",
              }}
            >
              {extensions.map((ext) => (
                <InstalledExtensionCard key={ext.id} extension={ext} />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
