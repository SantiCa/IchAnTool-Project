# Desktop backup recovery audit

Authorised on 11 November 2026 after the maintainer reported repeated hangs and unsuccessful backup
reactivation while running `npm.cmd start` from `desktop/`. Editor: Codex; author verification,
no independent reviewer assigned. Baseline: V0.132, commit `2588d46`. Delivery: V0.133.

## Scope and evidence

The audit follows the local-save, folder-copy, reactivation and project-navigation paths. Fixtures use an
8 × 8 synthetic PNG, real IndexedDB/OPFS transactions and controlled folder/permission failures. No private
projects or backup directories are opened. It also exercises the public IODP example through the desktop
program's normal detection and save/restart paths. This is a focused operating audit, not certification of
all application workflows or a reproduction of every hang experienced by the maintainer.

## Findings

| Finding | Evidence against V0.132 | Result in V0.133 |
|---|---|---|
| High: external folder I/O gates local navigation | Hold a manifest write open, then open the home screen/create another project. Both wait until the artificial folder delay is released. | Local save still gates navigation; the folder copy runs in the background against its captured source/destination. |
| High: overlapping backup attempts | During the held write, activate both recovery controls. More than one writer enters the manifest write. | One in-flight promise coordinates attempts; activation actions also suppress duplicates. |
| Medium: permission recovery can throw without guidance | Supply a handle without `requestPermission`, or one whose method throws synchronously. Both escape the original handler. A denied result gives no actionable reason. | Failure remains visible with its reason and folder-reselection guidance; controls recover. |
| High: pending copy bookkeeping can skip newer work | Source inspection: completion clears `backupPending` and advances the watermark to completion time even when another local save occurred during I/O. New destinations reuse the previous folder's watermark. | A save revision retains pending work; the watermark uses the run's start and includes equal timestamps. Destination selection resets it. Regression verifies automatic follow-up and unchanged-project copying. |
| High: restricted Electron directory request can remain unresolved | No `file-system-access-restricted` listener exists in main.js. Electron's implementation emits the event and waits for the application's callback. | The production session answers `deny`; unit and real-process bootstrap checks require the callback to settle. Protected locations are not granted. |
| High: a missing original can become an empty exported image | Source inspection: image resolution falls back to an empty Blob when a stored key is unavailable. This also matters if deletion races a background copy. | Missing originals abort copying/exporting with the image name. Regression requires the last complete manifest to remain unchanged. |

The restricted-directory finding is based on the
[Electron session contract](https://www.electronjs.org/docs/latest/api/session#event-file-system-access-restricted)
and the [installed-version implementation](https://github.com/electron/electron/blob/v45.2.2/shell/browser/file_system_access/file_system_access_permission_context.cc).
The actual native picker is not automated here. It is a plausible contributor to an unresponsive folder
selector, not proof that the maintainer selected a restricted directory.

## Reproduction and regression

The extended [interrupted-save regression](../../tests/e2e/interrupted-saves.mjs) fails on the baseline:
`singleFolderWriter`, `slowFolderDoesNotBlockHome`, `slowFolderDoesNotBlockLocalSwitch`,
`missingPermissionMethodReported` and `permissionExceptionReported` are false. Existing preservation
and successful-retry checks remain true. These failures were observed before implementation.

The regression also verifies saves during a held copy, visible pending status, an automatic follow-up pass,
denied permission, folder reselection and copying unchanged projects to a new destination. The delay is
controlled by a released promise; it is not a latency benchmark or a claim about a particular cloud provider.
The existing tests still reopen the last good and retried manifests/images and retain failed local edits.

Run from a checkout with existing test dependencies:

```powershell
py -3.12 -m http.server 8877 --bind 127.0.0.1
# In another terminal:
$env:APP_URL = 'http://127.0.0.1:8877/app/index.html'
$env:CHROME = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm.cmd run e2e
node desktop/scripts/prepare.js --with-examples
node tests/e2e/desktop.mjs
```

Electron tests use a new temporary profile and hidden windows. The restricted-event test injects the event
into the production session; folder I/O uses native OPFS handles behind deterministic failure wrappers.
The main desktop test covers app:// path rejection, preload/trainer IPC, the bundled ONNX loader asset,
public-example detection and pending local edits across a complete process restart.

## Verification results

Verified on Windows with Node 22.23.4, Electron 45.2.2, Python 3.12 and the locally installed Google Chrome:

- 227 Python tests pass; six optional dependency/filesystem-permission cases are skipped.
- 199 Node tests pass; JavaScript type checking, Ruff, version synchronisation and whitespace checks pass.
- The standalone build passes, and backup controls recover from injected failures in the HTML opened from disk.
- The complete Chrome smoke suite passes, including 356 traces in the first public-core section and an
  identical saved reload, legacy comparison, figure/table workflows, exports and interrupted-save recovery.
- The real Electron suite passes with the extended backup regression, public-example detection, preload IPC,
  app:// containment and pending local edits preserved through process restart.

One initial complete Chrome invocation stopped at a non-clickable startup button before the backup cases.
An isolated cold startup reported no renderer error, and subsequent complete runs passed. No production
freeze or separate startup fix is attributed to that isolated test-timing observation.

## Limits and next diagnosis

No complete process freeze was reproduced during the public-example detection/save/restart checks.
The audit confirms navigation waits caused by folder I/O and permission-handler defects; it does not
attribute all reported hangs to them. Physical power loss, a hung OS filesystem call, actual OneDrive/Drive/
Dropbox or network failures, GPU-driver failures, private-project memory pressure and cross-process folder
writers are outside the regression. A blocked external write can remain pending in the background; this
delivery prevents that wait from gating a completed local save, rather than imposing an unsafe I/O timeout.

If a hang remains, record the triggering action, project/image dimensions, visible status and terminal or
renderer error, then reproduce on shareable data. See M1.2.2 in the [roadmap](../roadmap.md).

The source review also flags the multiple-waiter path in `saveToDB` for a separate concurrency reproduction:
after several callers await one pending save, more than one may proceed into a new save. No local-save
corruption or freeze is attributed to that observation in this delivery; the failed-local-save guard and
transaction rollback regressions still pass. A separate delivery should establish the competing-caller
behaviour before changing the internal-save controller.
