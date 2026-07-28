#!/bin/bash
# Rootless fix for opencv-python's missing shared libraries in this spike's
# container (no sudo/apt-get install available - see README "Environment
# notes"). opencv-python (every variant: headless, contrib, regular) needs
# libGL/libX11/libxcb/libglib at import time even for pure imread() calls
# with no display attached, and this container's base image ships none of
# them.
#
# This does NOT install anything system-wide. It downloads the .deb files
# from the public Debian pool (no root needed to fetch a file) and unpacks
# them with ar/tar into ./.rootless-libs. Source scripts pick this up via
# LD_LIBRARY_PATH - see run_with_libs.sh.
#
# Versions pinned below are current for Debian 13 (trixie) amd64 as of
# 2026-07-28. If a package is gone from the pool, browse
# https://deb.debian.org/debian/pool/main/<first-letter-dir>/<source-pkg>/
# for the current filename.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIBDIR="$HERE/.rootless-libs"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

mkdir -p "$LIBDIR"

PACKAGES=(
  "https://deb.debian.org/debian/pool/main/libx/libxcb/libxcb1_1.17.0-2+b2_amd64.deb"
  "https://deb.debian.org/debian/pool/main/g/glib2.0/libglib2.0-0t64_2.89.2-1_amd64.deb"
  "https://deb.debian.org/debian/pool/main/libg/libglvnd/libgl1_1.7.0-3+b1_amd64.deb"
  "https://deb.debian.org/debian/pool/main/libx/libxau/libxau6_1.0.11-1+b2_amd64.deb"
  "https://deb.debian.org/debian/pool/main/libx/libxdmcp/libxdmcp6_1.1.5-2+b1_amd64.deb"
  "https://deb.debian.org/debian/pool/main/libg/libglvnd/libglvnd0_1.7.0-3+b1_amd64.deb"
  "https://deb.debian.org/debian/pool/main/libg/libglvnd/libglx0_1.7.0-3+b1_amd64.deb"
  "https://deb.debian.org/debian/pool/main/libx/libx11/libx11-6_1.8.13-1_amd64.deb"
)

for url in "${PACKAGES[@]}"; do
  fname="$(basename "$url")"
  echo "fetching $fname"
  curl -sL -o "$WORKDIR/$fname" "$url"
  (cd "$WORKDIR" && ar x "$fname")
  tar -xf "$WORKDIR/data.tar.xz" -C "$LIBDIR" 2>/dev/null \
    || tar -xf "$WORKDIR/data.tar.zst" -C "$LIBDIR" 2>/dev/null \
    || tar -xf "$WORKDIR/data.tar.gz" -C "$LIBDIR" 2>/dev/null
  rm -f "$WORKDIR"/data.tar.* "$WORKDIR"/control.tar.* "$WORKDIR"/debian-binary
done

echo "done - libs in $LIBDIR/usr/lib/x86_64-linux-gnu"
echo "source run_with_libs.sh or export:"
echo "  export LD_LIBRARY_PATH=\"$LIBDIR/usr/lib/x86_64-linux-gnu\""
