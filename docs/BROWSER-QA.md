# Browser release checks — November 24, 2026

Checked the workbench served from the Ubuntu/QNX lab host through a local SSH tunnel, using the actual browser UI. Final evidence-table checks used public revision `95232b10c54c431e98ac5d5b2adfa0114af26eab`; file-review checks began at `5ba3c45`, with the same comparison implementation.

- Independently imported `native/configs/revised.xml` as baseline and `native/configs/risky.xml` as candidate through their separate file controls. Importing the candidate retained the baseline fingerprint.
- Protected `controller`: the regression produced **New coupling requires review**, naming the telemetry → controller session path and the changed dependency.
- Swapped revisions and compared: **No new coupling into protected services**. Viewing a candidate map retained the comparison inputs and selection.
- Opened the illustrative cycle example: missing prerequisite BW011 and dependency cycle BW013; map and impact unavailable.
- Loaded risky automatic evidence against risky XML: matched configuration hash, recorded target/build/operation, instance replacement and per-window IPC counters visible.
- Changed active XML to revised: stale check cleared. Checking the risky recording then produced **XML hash mismatch** and collapsed unbound observations.
- Imported the revised native recording through the actual JSON file chooser: matched revised XML, stable controller instance, successful controller IPC counters 12→45 before and 80→119 after. The UI explicitly scopes these to recording windows.
- Changed XML after a successful check and exported a bundle: `recording.check` was `null`, with the unverified raw recording retained.
- Imported a deliberately incomplete copy (`completed: false`): **Incomplete recording**, reason shown, observations collapsed even though XML hashes agreed.
- Exported a matched review bundle through the actual browser download control and parsed the resulting JSON: `bootweave.review-bundle.v1`, static report, raw recording, `matched` binding, six IPC rows.
- No browser console errors or warnings were captured during the release workflow.
- Narrow 319px viewport: body width remained 319px; tables scroll within their containers. Desktop media used the browser's default 1280×720 CSS viewport.

Actual screenshots are retained in [assets](assets/01-bootweave-cover.jpg), with the [recorded native counter view](assets/04-native-qnx-evidence.jpg). Media contains only the authored project UI, public evidence and owned typography/layout; no account pages, private cloud identifiers or licensed QNX software are shown.

These checks verify the listed interactions, not exhaustive browser compatibility or runtime behavior. See [host release checks](RELEASE-CHECKS.md) for independent checkout/hash checks, [native evidence](../validation/evidence/native-demo/README.md) for the QNX experiments and [validation matrix](../validation/matrix/README.md) for scoped additional cases.
