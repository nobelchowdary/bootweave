#!/usr/bin/env bash
# Ubuntu prerequisites only. Does not download QNX or configure a license.
set -euo pipefail

fail() {
    printf 'BootWeave host setup: %s\n' "$*" >&2
    exit 1
}

[[ -r /etc/os-release ]] || fail 'Cannot identify this operating system.'
# shellcheck source=/dev/null
source /etc/os-release
[[ ${ID:-} == ubuntu ]] || fail 'Ubuntu 22.04 or 24.04 is required.'
[[ $(uname -m) == x86_64 ]] || fail 'An x86_64 host is required for this setup.'

case ${VERSION_ID:-} in
    24.04) desktop_packages=(libgtk-3-0t64 libasound2t64) ;;
    22.04) desktop_packages=(libgtk-3-0 libasound2) ;;
    *) fail 'Ubuntu 22.04 or 24.04 is required.' ;;
esac

command -v sudo >/dev/null 2>&1 || fail 'sudo must be installed.'
if [[ $EUID -eq 0 ]]; then
    host_user=${SUDO_USER:-}
    [[ -n $host_user && $host_user != root ]] || fail 'Run as a non-root login user with sudo access.'
else
    host_user=$(id -un)
fi
id "$host_user" >/dev/null 2>&1 || fail 'Cannot identify the non-root login user.'
if ! sudo -n true 2>/dev/null; then
    sudo -v
fi

packages=(
    qemu-system-x86 qemu-utils libvirt-clients cpu-checker
    build-essential git python3-venv unzip xz-utils curl wget
    "${desktop_packages[@]}" libxtst6 xauth xvfb dbus-x11
)

# Keep existing configuration files; list service restart needs without
# automatically restarting services such as the active SSH connection.
sudo env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get update
sudo env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=l apt-get \
    -o Dpkg::Options::=--force-confdef \
    -o Dpkg::Options::=--force-confold \
    install --yes --no-install-recommends "${packages[@]}"

if ! getent group kvm >/dev/null; then
    sudo groupadd --system kvm
fi
sudo usermod --append --groups kvm "$host_user"

printf '\nInstalled Ubuntu host prerequisites. User %s belongs to the kvm group.\n' "$host_user"
printf 'Reconnect your login session before checking KVM device access with kvm-ok.\n'
if [[ ! -c /dev/kvm ]]; then
    printf 'KVM device is absent: verify nested virtualization and the host KVM driver.\n' >&2
fi
printf 'QNX Software Center, SDK, licenses, and target images remain separate setup steps.\n'
