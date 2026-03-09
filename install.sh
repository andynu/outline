#!/bin/bash
set -e

cd "$(dirname "$0")/app"

echo "Installing npm dependencies..."
npm install

echo "Building Tauri app..."
npm run tauri build

echo "Building CLI..."
(cd src-tauri && cargo build --release -p outline-cli)

CLI_BINARY="src-tauri/target/release/otl"
if [[ ! -f "$CLI_BINARY" ]]; then
    echo "Error: CLI binary not found at $CLI_BINARY"
    exit 1
fi

case "$(uname -s)" in
    Linux*)
        BINARY="src-tauri/target/release/outline"
        DEST="$HOME/.local/bin/outline"

        if [[ ! -f "$BINARY" ]]; then
            echo "Error: Binary not found at $BINARY"
            exit 1
        fi

        mkdir -p "$HOME/.local/bin"
        cp "$BINARY" "$DEST"
        chmod +x "$DEST"
        echo "Installed GUI to $DEST"

        cp "$CLI_BINARY" "$HOME/.local/bin/otl"
        chmod +x "$HOME/.local/bin/otl"
        echo "Installed CLI to $HOME/.local/bin/otl"

        # Check if ~/.local/bin is in PATH
        if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
            echo "Note: Add ~/.local/bin to your PATH if not already present"
        fi
        ;;
    Darwin*)
        APP="src-tauri/target/release/bundle/macos/Outline.app"
        DEST="$HOME/Applications/Outline.app"

        if [[ ! -d "$APP" ]]; then
            echo "Error: App bundle not found at $APP"
            exit 1
        fi

        mkdir -p "$HOME/Applications"
        rm -rf "$DEST"
        cp -R "$APP" "$DEST"
        echo "Installed GUI to $DEST"

        mkdir -p "$HOME/.local/bin"
        cp "$CLI_BINARY" "$HOME/.local/bin/otl"
        chmod +x "$HOME/.local/bin/otl"
        echo "Installed CLI to $HOME/.local/bin/otl"

        if [[ ":$PATH:" != *":$HOME/.local/bin:"* ]]; then
            echo "Note: Add ~/.local/bin to your PATH if not already present"
        fi
        ;;
    *)
        echo "Unsupported platform: $(uname -s)"
        exit 1
        ;;
esac
