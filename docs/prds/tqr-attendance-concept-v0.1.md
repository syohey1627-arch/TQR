# TQR Attendance Concept - PRD Draft

## Source

- Imported from Codex thread: `019e5c3a-0ba7-7e02-9c7f-e1d37015f8af`
- Original thread title: `IC勤怠の集計要件を確認`
- Working product name: `TQR`
- Formal name candidate: `トータル勤怠TQR`

## Background

Current attendance management uses paper time cards. The goal is to replace paper-based punching and manual aggregation with a low-cost attendance system using QR codes, smartphone/tablet terminals, cloud sync, and CSV export.

The original idea started with IC cards, but the current direction is QR-based attendance because it is cheaper and easier to operate with printed cards and a smartphone or tablet reader.

## Product Direction

TQR is a QR attendance management application.

The system should support:

- Employee QR cards
- A fixed attendance terminal using a smartphone or tablet
- Web-based administrator management
- CSV export for aggregation and payroll workflows
- Offline punching when Wi-Fi is unavailable
- Local backup storage on the terminal
- Cloud sync when online

## Target Users

- Companies currently using paper time cards
- Small and medium businesses that want low-cost attendance digitization
- On-site workers who need quick punching without logging in
- Administrators who need monthly attendance aggregation and CSV output

## Core Concept

The attendance terminal is a sub-system for punching and temporary data storage.

The cloud is the primary source of truth in normal operation. The terminal keeps local data as a temporary backup and offline buffer.

```text
Normal mode:
- Cloud is the source of truth
- Terminal storage is temporary backup

Offline mode:
- Terminal temporarily becomes the source of truth
- Data is later exported as CSV or synced to cloud
```

## Recommended Initial Architecture

```text
Admin Web App
- Company ID issuance
- Admin login
- Employee registration
- QR generation
- Device registration
- Punch data review
- Punch correction and approval
- CSV export

Punch Terminal App
- Company ID setup
- Device registration
- QR reading
- Offline punch storage
- Local encrypted database
- Cloud sync when online
- Local CSV or backup export with admin PIN
```

## Punch Method

Each employee receives a unique QR code.

The QR code should not contain a simple employee number. It should contain a random punch token tied to the employee in the system.

Example:

```text
employee_punch_token = random UUID or opaque token
```

This allows lost QR cards to be revoked and reissued.

Accepted QR media:

- Printed card
- Name tag
- Card case
- Smartphone screen

## Alternative PASS Punch Method

QR punching is the primary method, but TQR should also support PASS punching as a fallback.

Purpose:

- Allow punching from a Web screen when QR reading is unavailable
- Allow punching when the employee forgot or lost the QR card
- Allow operation on browsers or devices where camera permissions are unreliable
- Keep the initial Web/PWA prototype usable before native Android QR reading is finalized

PASS punching requires:

- Company ID
- Employee ID
- Employee PASS
- Current punch mode

Recommended rules:

- QR punching remains the default and fastest workflow
- PASS punching should be available from the terminal screen as a secondary action
- PASS punching should record the authentication method as `PASS`
- QR punching should record the authentication method as `QR`
- Administrators should be able to enable or disable PASS punching by company or site
- Failed PASS attempts should be logged after production authentication is implemented
- Employee PASS must be stored as a secure hash, never as plain text

Example fallback flow:

```text
1. Employee cannot use QR
2. Employee enters company ID, employee ID, and PASS
3. System verifies credentials
4. Current punch mode is applied
5. Punch record is saved with auth_method = PASS
```

## Punch Types

The terminal should support six punch types:

- Clock in
- Clock out
- Break start
- Break end
- Temporary leave
- Temporary return

Japanese labels:

- 出勤
- 退勤
- 休憩入り
- 休憩戻り
- 中抜け
- 中戻り

## Punch Screen UI

The punch screen should be visually clear by punch mode.

Recommended colors:

- 出勤: green
- 退勤: red
- 休憩入り: blue
- 休憩戻り: teal or navy
- 中抜け: orange
- 中戻り: purple

The UI should not rely on color alone. It should also use:

- Large text labels
- Icons
- Fixed button positions
- Confirmation messages
- Success sound

Recommended layout:

```text
Top:
- Current punch mode
- Current time

Center:
- QR camera preview
- Instruction text

Bottom:
- Punch type buttons

After scan:
- Employee name
- Punch type
- Punch time
```

## Automatic Mode Switching

Normal mode is determined by current time.

```text
00:00-13:30 -> Clock in mode
13:31-23:59 -> Clock out mode
```

Break and temporary leave modes are temporary manual modes.

When a temporary mode is selected:

- Keep that mode for 5 minutes
- Show countdown
- After 5 minutes, return to the normal mode based on the current time
- Provide a manual "return to normal mode" button

Important rule:

Do not return to the previous mode after 5 minutes. Recalculate the normal mode based on the current time.

Example:

```text
13:28 Break end selected
13:33 Auto return
Return destination = Clock out mode
```

## Device Choice

Recommended for MVP:

- Android smartphone or tablet
- Front camera QR reading
- Wi-Fi operation when available

Alternative:

- Android tablet plus USB/Bluetooth QR reader
- Dedicated Android scanner terminal for high-volume sites

Front camera is preferred because users can see the screen while holding their QR card toward the terminal.

## Kiosk Operation

The ideal operation is to keep the terminal locked to the punch app.

App-only restrictions are not enough for full lock-down. Use OS-level kiosk features.

Recommended:

- Android device
- Android Lock Task Mode or MDM-based kiosk mode

Desired terminal behavior:

- Launch directly into QR reading screen
- Prevent switching to other apps
- Prevent home/app switcher access
- Hide notifications where possible
- Require admin PIN for settings
- Require admin PIN to exit terminal mode

## Online and Offline Storage

### Normal Mode

Recommended operation is Wi-Fi connected.

Rules:

- Save punch data to local device database first
- Sync to cloud immediately when online
- Keep synced data locally for about 7 days
- Keep unsynced data until sync completes
- Show unsynced count on terminal

### Offline Mode

For sites without Wi-Fi:

- Save punch data locally for up to 2 months
- Export CSV from terminal with admin PIN
- Optionally sync later when Wi-Fi is available
- Do not delete unexported or unsynced data
- Delete old data only after export or sync confirmation

Recommended offline safety features:

- Local data encryption
- Admin PIN for CSV export
- CSV export history
- Storage capacity warning
- Remaining retention days display
- Unsynced/unexported count display

## CSV Export

Admin web should support CSV export.

Terminal should also support local CSV export for offline or failure recovery.

Example columns:

```text
社員ID,社員名,日付,出勤,退勤,休憩入り,休憩戻り,中抜け,中戻り,実働時間,休憩時間,修正有無
```

Column definitions should later be adjusted to match the target payroll or accounting workflow.

## Device Registration

Device registration should be included.

Purpose:

- Prevent punching from unknown devices
- Track which device recorded each punch
- Disable lost devices
- Assign devices to offices or sites
- Show last sync time per device

## Risk Scope

Initial version should handle common risks:

- Device battery drain
- Wi-Fi instability
- Camera permission issues
- App accidentally closed
- QR card loss
- Wrong punch type selection
- Duplicate scans
- Monthly correction work
- Unsynced data

Rare combined failures can be out of scope for MVP:

- Cloudflare or cloud service outage
- Terminal device breaks during the same outage
- Local data cannot be extracted

For this rare case, manual correction by administrator is acceptable in the initial version.

## MVP Scope

Recommended MVP:

- Admin login
- Company ID setup
- Employee registration
- Employee QR issuance
- Registered terminal setup
- QR punch screen
- Six punch types
- Time-based automatic clock-in/clock-out mode
- 5-minute temporary mode timer
- Local-first punch save
- Cloud sync
- Offline unsynced queue
- 7-day synced local retention
- Admin CSV export from web
- Local terminal CSV export with admin PIN

## Out Of Scope For MVP

- Strict biometric identity verification
- Full anti-buddy-punching prevention
- Multi-cloud disaster recovery
- Terminal-to-terminal backup
- Dedicated MDM product integration
- Payroll software direct API integration
- Native iOS kiosk mode support

## Open Questions

- Should MVP be a web app/PWA, native Android app, or hybrid app?
- Which payroll or accounting CSV format should be supported first?
- Is photo capture required at punch time?
- Are multiple offices/sites required in the first version?
- Do administrators need punch correction and approval in MVP?
- What is the expected number of employees per company?
- What is the expected number of punch terminals per company?

## Suggested Next Development Steps

1. Decide MVP platform: PWA, Android native, or React Native.
2. Define database schema for companies, employees, devices, punch records, and sync state.
3. Build clickable punch screen prototype.
4. Build admin web prototype for employee registration and CSV export.
5. Implement local-first punch storage.
6. Implement sync queue and offline retention rules.
7. Implement QR generation and token revocation.
8. Test with a low-cost Android tablet in kiosk-style operation.

## Current Clarity Score

70/100

The product direction and core workflow are clear enough to start a prototype. Before production development, the platform choice, CSV output format, and administrator correction flow should be confirmed.
