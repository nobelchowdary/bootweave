# Ubuntu EC2 host for QNX development

This procedure prepares a Linux host for the BootWeave QNX validation lab. The prerequisite script alone does not install or license QNX or boot a guest. The separate image steps below produced the [initial November 24 observations](../validation/evidence/2026-11-24/README.md). The Python host application can run independently of QNX.

## Host selection

Use an Ubuntu **24.04 LTS x86_64** image on a supported nested-virtualization instance. A practical starting point is **c8i.2xlarge: 8 vCPU, 16 GiB RAM**, with about 80 GiB of SSD-backed EBS storage. An m8i.2xlarge provides 32 GiB RAM if more headroom is needed.

During launch, choose **Advanced details → Nested virtualization → Enable**. The CLI setting is `--cpu-options "NestedVirtualization=enabled"`; choosing a supported instance type alone does not enable it. See the [AWS nested virtualization guide](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/amazon-ec2-nested-virtualization.html). Use the account's required ownership/project tags and approved network configuration.

The EC2 instance is the **Ubuntu host**. QEMU runs a separate **QNX guest** inside it. They have different operating systems, processes, filesystems, and resource allocations. Start with one guest and leave CPU/RAM available for Ubuntu and the SDK; use the chosen QNX image's documented launch configuration. KVM availability is a prerequisite, not proof that an image boots or that timing matches physical hardware.

## Install Ubuntu prerequisites

Connect through your configured SSH key as the non-root Ubuntu login user. From a checkout of this repository:

```sh
bash scripts/setup-qnx-host.sh
```

The script checks the OS/architecture and sudo access, installs packages from the host's configured Ubuntu repositories, and adds the invoking login user to `kvm`. It is repeatable and preserves existing package configuration files. It does not change firewall rules, download QNX, handle credentials, or set up remote desktop access.

Disconnect and reconnect so the new group membership takes effect. Check the host:

```sh
id -nG
kvm-ok
qemu-system-x86_64 --version
python3 --version
```

If KVM is unavailable, confirm the EC2 CPU option and KVM driver/device access before proceeding. The script also accepts Ubuntu 22.04 and selects its pre-t64 library names. Ubuntu 22.04's default Python is older than BootWeave's Python 3.11+ requirement; supply a compatible interpreter separately if using that release. Ubuntu 24.04's default Python meets the requirement.

Install QNX Software Center and the licensed QNX SDP 8.0 Linux host tools separately through [QNX Everywhere](https://qnx.software/en/developers/get-started/qnx-everywhere), following the selected package's supported-host requirements. Keep installers, license material, SDK files, and guest images outside this repository. Source the SDK environment from its actual installation location before building any target programs.

## Workbench through SSH

On the Ubuntu host, from the repository, run:

```sh
python3 -m bootweave serve
```

Leave that session running. In a second terminal on your own computer, replace `HOST` with your configured SSH hostname and select your SSH key through your usual SSH configuration:

```sh
ssh -N -L 127.0.0.1:8765:127.0.0.1:8765 ubuntu@HOST
```

Open `http://127.0.0.1:8765` locally. Both the workbench and the local tunnel endpoint bind to loopback; the web port need not be exposed through the EC2 security group. If local port 8765 is occupied, start the remote server with `python3 -m bootweave serve --port 8766`, forward `127.0.0.1:8766:127.0.0.1:8766`, and browse to local port 8766. Keep the local and remote port numbers equal because the server validates browser origins against its listening port.

## Native validation remains separate

### Recorded minimal image setup

Use QNX Software Center as the non-root build user. Follow its [headless installation instructions](https://www.qnx.com/developers/docs/qsc/com.qnx.doc.qsc.inst_larg_org/topic/create_headless_installation_linux_macos.html), including the installer's agreement and vendor checksum verification. The November 24 lab used QSC 2.0.4. Keep authentication in a mode-600 options file outside the checkout, following the [QSC CLI guidance](https://www.qnx.com/developers/docs/qsc/com.qnx.doc.qsc.user_guide/topic/commandline_qsc.html); a password supplied directly on the command line may be logged. Remove the temporary authentication file when installation finishes.

After the appropriate license is deployed and approved, these operations activate it and install the baseline. `-activateAll` is appropriate only when the account contains just the intended license. Synchronization and activation must be in the same invocation in the recorded QSC version. The metadata selector is `qnx800`; the installable baseline identifier is `com.qnx.qnx800`.

```sh
QSC="$HOME/qnx/qnxsoftwarecenter/qnxsoftwarecenter_clt"
"$QSC" @"$HOME/.qnx/bootweave-auth.args" -syncLicenseKeys -activateAll
"$QSC" @"$HOME/.qnx/bootweave-auth.args" -mirrorBaseline qnx800
"$QSC" @"$HOME/.qnx/bootweave-auth.args" -destination "$HOME/qnx800" -setPolicy conservative -installBaseline com.qnx.qnx800
```

Build a minimal image, using a dedicated SSH key for this disposable guest:

```sh
source "$HOME/qnx800/qnxsdp-env.sh"
ssh-keygen -q -t ed25519 -N '' -C bootweave-qnx-lab -f "$HOME/.ssh/bootweave-qnx-lab"
mkdir -p "$HOME/bootweave-qnx-target"
cd "$HOME/bootweave-qnx-target"
mkqnximage --type=qemu --arch=x86_64 --hostname=bootweave-qnx --cpu=2 --ram=2G --graphics=no --ssh-ident="$HOME/.ssh/bootweave-qnx-lab.pub" --sshd-pregen=yes --build
```

The recorded launch used the generated kernel/disk, a standard `pc` virtual board, KVM, user networking and loopback-only SSH forwarding. Replace the example MAC with the value shown by `mkqnximage --options` for your image. Run from the image folder, with no other process using this disk or port:

```sh
qemu-system-x86_64 -machine pc -accel kvm \
  -cpu host,host-phys-bits-limit=39,amx-tile=off,amx-int8=off,amx-bf16=off \
  -smp 2 -m 2G -kernel output/ifs.bin \
  -drive file=output/disk-qemu.vmdk,format=vmdk,if=ide,id=drv0 \
  -netdev user,id=net0,hostfwd=tcp:127.0.0.1:2222-:22 \
  -device virtio-net-pci,netdev=net0,mac=52:54:00:3f:ad:f6 \
  -object rng-random,filename=/dev/urandom,id=rng0 \
  -device virtio-rng-pci,rng=rng0 -display none \
  -serial file:output/qemu.out -pidfile output/qemu.pid -daemonize
```

QNX [recommends the physical-address bit limit](https://qnx.com/developers/docs/qnxeverywhere/com.qnx.doc.target_images/topic/qsti_qemu/additional_specs.html) for Intel hosts. In this lab, host CPU passthrough still produced an early kernel object-size assertion; masking AMX allowed startup to continue. That association is an experimental compatibility finding, not a vendor diagnosis or universal requirement. A `q35` experiment then failed to mount this image because its generated startup used `devb-eide`; restoring the default `pc` board worked. The remaining MCFG warning did not prevent the recorded successful boots.

Verify the guest's SSH host key against `local/misc_files/ssh_host_ed25519_key.pub` before trusting the loopback endpoint. The lab stores the verified key in `guest-known-hosts`; connect with the dedicated private key. Do not disable host-key verification. This generated image includes `slogger2` but did not include `slm` or `slmctl`; copy the licensed binaries from `$QNX_TARGET/x86_64/usr/sbin/slm` and `$QNX_TARGET/x86_64/bin/slmctl` into `/data/bootweave-lab/` on the guest, then make them executable. Their required libraries were already present in this recorded image. Do not publish those binaries.

Run the authored observation recorder on the Ubuntu host with the supplied distinct-argument fixture, using a fresh dedicated daemon per operation:

```sh
python3 /path/to/bootweave/validation/observe-native.py \
  --lab "$HOME/bootweave-qnx-target" \
  --fixture /path/to/bootweave/validation/fixtures/lifecycle-distinct.xml \
  --operation plain --output "$HOME/plain-observation.json"
```

Repeat with `--operation stateless-option` and a different output filename. The recorder expects the configured guest key, verified `guest-known-hosts`, the installed binaries, and no existing sleep processes. It verifies fixture bytes through SSH, identifies the daemon through its dedicated endpoint, and records observations rather than asserting that SLM matches the model. Cleanup kills only that disposable experiment's daemon and identified fixture processes; its output reports whether cleanup was verified.

After obtaining and booting a licensed QNX image, follow [QNX-VALIDATION.md](QNX-VALIDATION.md). Record the actual QNX version, architecture, SLM options, configuration hashes, commands, and results. Until those steps execute, label native validation **NOT RUN**. Host setup and passing Python tests establish neither successful QNX execution nor recovery behavior.

Stop the development instance when it is no longer needed; retained EBS storage and other allocated resources can continue to incur charges.
