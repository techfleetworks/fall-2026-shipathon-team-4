# Where your record is kept: the facts (for the storage / offline notice)

The mentor asked for a clear notice about on-device storage, offline use and sync. These are the **facts** as built
(ADR-018, ADR-019). **The wording people see is Product's (Dominic) and Diana's.** The Settings card uses a first draft.

## The facts

| Question | Answer |
|---|---|
| Where is my record by default? | **Only on this device**, in the browser's storage. Nothing about my health is sent to the server unless I turn on backup, or use a feature that sends text to be processed (it isn't stored). |
| What happens if I clear my browser, or lose this device, with backup off? | The record is gone and can't be recovered. |
| What does "Back up and sync" do? | Saves an **encrypted** copy of my record on the server, and keeps my devices in step. It's **off until I turn it on**, in Settings → Privacy and data. |
| Who can read the server copy? | Only me, through the app while I'm logged in. The database stores it encrypted; the key is kept separately on the server. It is **not end-to-end encrypted**: the app's server decrypts it to send it back to me. |
| Does the app work offline? | Yes. Everything is saved on the device first. With backup on, changes back up when I'm online again. |
| What if I edit on two devices? | Both sets of changes are kept. Something deleted on one device stays deleted. If the same entry was changed on both before they synced, the device I'm using wins. |
| A new phone? | Log in. If I backed up before, my record comes back. |
| Someone else logs in on my device? | Backup pauses for them. Their account never gets my record, and mine never gets theirs. |
| Turning backup off | My record stays on this device. I choose to **keep** or **delete** the server copy. |
| Deleting my account | Deletes the account and the server copy for good, and clears this device. |
| What is never sent? | The on-device password hash, my email (it stays with my sign-in account) and share-link tokens. |

## Screens that currently promise "stays on this device"

These stay true while backup is off. With backup on, Product may want to adjust them:
`src/screens/public/Auth.tsx` ("This version keeps your data on this device only"), `src/screens/visit/Before.tsx` (photo alt text,
"links open only on this device"), `src/screens/Playbooks.tsx` and `src/screens/visit/After.tsx` (ratings "stay on this device"),
`src/screens/Onboarding.tsx` (progress saved on this device).
