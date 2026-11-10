import { useCallback, useEffect, useMemo, useState } from "react";

import "./DesktopLibrary.scss";

export type DesktopDrawing = {
  id: string;
  name: string;
  updatedAt: number;
  searchText: string;
  unreadable?: boolean;
};

declare global {
  interface Window {
    excalidrawDesktop?: {
      getLibrary: () => Promise<DesktopDrawing[]>;
      getFolder: () => Promise<string>;
      createDrawing: () => Promise<{ id: string }>;
      readDrawing: (id: string) => Promise<string>;
      saveDrawing: (
        id: string,
        contents: string,
      ) => Promise<{ updatedAt: number }>;
      renameDrawing: (id: string, name: string) => Promise<{ name: string }>;
      chooseFolder: () => Promise<string | null>;
      openFolder: () => Promise<string>;
      onBeforeClose: (callback: () => void) => () => void;
      readyToClose: () => void;
    };
  }
}

const formatDate = (timestamp: number) => {
  if (!timestamp) {
    return "Could not read file";
  }
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(timestamp);
};

export const DesktopLibrary = ({
  onOpen,
  saveError,
  onRetrySave,
}: {
  onOpen: (id: string, isNew?: boolean) => void;
  saveError: string;
  onRetrySave: () => void;
}) => {
  const desktop = window.excalidrawDesktop;
  const [drawings, setDrawings] = useState<DesktopDrawing[]>([]);
  const [folder, setFolder] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const refresh = useCallback(async () => {
    if (!desktop) {
      return;
    }
    try {
      const [library, libraryFolder] = await Promise.all([
        desktop.getLibrary(),
        desktop.getFolder(),
      ]);
      setDrawings(library);
      setFolder(libraryFolder);
      setError("");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not read drawings",
      );
    }
  }, [desktop]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filteredDrawings = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) {
      return drawings;
    }
    return drawings.filter((drawing) =>
      `${drawing.name} ${drawing.searchText}`
        .toLocaleLowerCase()
        .includes(normalizedQuery),
    );
  }, [drawings, query]);

  if (!desktop) {
    return null;
  }

  const createDrawing = async () => {
    try {
      const { id } = await desktop.createDrawing();
      onOpen(id, true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not create drawing",
      );
    }
  };

  const chooseFolder = async () => {
    try {
      const selected = await desktop.chooseFolder();
      if (selected) {
        await refresh();
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not choose folder",
      );
    }
  };

  const saveRename = async (drawing: DesktopDrawing) => {
    try {
      await desktop.renameDrawing(drawing.id, renameValue);
      setRenamingId(null);
      await refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not rename drawing",
      );
    }
  };

  return (
    <main className="desktop-library">
      <div className="desktop-library__topbar">
        <div className="desktop-library__brand">
          <span className="desktop-library__mark" aria-hidden="true">
            ✳
          </span>
          <span>Excalidraw</span>
        </div>
        <button
          className="desktop-library__quiet-button"
          onClick={() => void desktop.openFolder()}
        >
          Open drawings folder
        </button>
      </div>

      <section className="desktop-library__content">
        <header className="desktop-library__heading">
          <div>
            <p className="desktop-library__eyebrow">LOCAL LIBRARY</p>
            <h1>Your drawings</h1>
            <p className="desktop-library__subtitle">
              Saved on this computer. Changes are saved as you work.
            </p>
          </div>
          <button
            className="desktop-library__new-button"
            onClick={() => void createDrawing()}
          >
            <span aria-hidden="true">＋</span> New drawing
          </button>
        </header>

        <div className="desktop-library__toolbar">
          <label className="desktop-library__search">
            <span aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search names and drawing text"
              aria-label="Search drawings"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </label>
          <button
            className="desktop-library__quiet-button"
            onClick={() => void chooseFolder()}
          >
            Change folder
          </button>
        </div>

        <div className="desktop-library__folder" title={folder}>
          <span aria-hidden="true">▣</span>
          <span>{folder || "Loading folder…"}</span>
          <span className="desktop-library__count">
            {drawings.length} {drawings.length === 1 ? "drawing" : "drawings"}
          </span>
        </div>

        {error && (
          <div className="desktop-library__error" role="alert">
            {error}
          </div>
        )}
        {saveError && (
          <div className="desktop-library__error" role="alert">
            {saveError} <button onClick={onRetrySave}>Retry save</button>
          </div>
        )}

        {filteredDrawings.length ? (
          <div className="desktop-library__list">
            {filteredDrawings.map((drawing) => (
              <article key={drawing.id} className="desktop-library__row">
                <button
                  className="desktop-library__document-icon"
                  aria-label={`Open ${drawing.name}`}
                  onClick={() => onOpen(drawing.id)}
                >
                  <span>✳</span>
                </button>
                <div className="desktop-library__row-main">
                  {renamingId === drawing.id ? (
                    <form
                      className="desktop-library__rename"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void saveRename(drawing);
                      }}
                    >
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(event) => setRenameValue(event.target.value)}
                        aria-label="Drawing name"
                      />
                      <button type="submit">Save</button>
                      <button type="button" onClick={() => setRenamingId(null)}>
                        Cancel
                      </button>
                    </form>
                  ) : (
                    <button
                      className="desktop-library__title"
                      onClick={() => onOpen(drawing.id)}
                    >
                      {drawing.name}
                    </button>
                  )}
                  <span className="desktop-library__date">
                    {formatDate(drawing.updatedAt)}
                  </span>
                </div>
                <button
                  className="desktop-library__rename-button"
                  onClick={() => {
                    setRenamingId(drawing.id);
                    setRenameValue(drawing.name);
                  }}
                >
                  Rename
                </button>
                <button
                  className="desktop-library__open-button"
                  onClick={() => onOpen(drawing.id)}
                >
                  Open <span aria-hidden="true">→</span>
                </button>
              </article>
            ))}
          </div>
        ) : (
          <div className="desktop-library__empty">
            <div className="desktop-library__empty-icon" aria-hidden="true">
              ✳
            </div>
            <h2>{query ? "No matching drawings" : "Your library is ready"}</h2>
            <p>
              {query
                ? "Try another name or a word used in one of your drawings."
                : "Create a drawing and it will be saved here automatically."}
            </p>
            {!query && (
              <button
                className="desktop-library__new-button"
                onClick={() => void createDrawing()}
              >
                <span aria-hidden="true">＋</span> Create your first drawing
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
};
