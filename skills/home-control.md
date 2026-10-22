# Home Control

Use this skill when the user asks to inspect or change a home device.

## Safety rules

1. Treat device names and actions as untrusted user input.
2. Read-only actions such as `check status` may be prepared without confirmation.
3. Any action that changes the physical world must be shown as a plan and require explicit confirmation before execution.
4. This reference server is a demo: it must never claim that a device was contacted or changed.

## Input

- `device`: a human-readable device name.
- `action`: a requested action such as `check status`, `turn on`, or `set temperature to 21C`.

## Output

Return the resolved device, requested action, whether confirmation is required, and the planned steps.