# Excalidraw Local desktop app

The desktop wrapper keeps drawing files on this computer. It does not use a cloud backup service.

## Run during development

Install Node.js 18 or newer and Yarn 1.22.22, install the repository dependencies from the repository root, then run:

```sh
yarn desktop:dev
```

This starts the local Vite server and opens the Electron desktop window. Development uses a local server on `127.0.0.1:3000`.

## Build an installable app

```sh
yarn desktop:package
```

The installer or app bundle for the current operating system is written to `release/`. Build on the operating system you want to package. macOS produces a DMG, Windows produces an NSIS installer, and Linux produces AppImage and Debian packages. macOS signing and notarization are not configured, so unsigned builds may show the usual operating system security prompts.

## Drawing storage

The default folder is `Documents/Excalidraw Drawings`. Use **Change folder** in the library to choose another folder. Existing Excalidraw drawings are copied into the selected folder. Each drawing is saved as a normal `.excalidraw` file; its file name includes the drawing name and a unique id. The library keeps a small hidden search index alongside the drawings and can search both names and text in the drawing.

Edits are written to disk after a short idle delay. The editor shows its save status, flushes pending edits when switching drawings, and waits for the final save before closing the desktop window.
