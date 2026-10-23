import { z } from 'zod';

const devices = new Map([
  ['living_room_light', { deviceId: 'living_room_light', name: 'Living room light', kind: 'light', power: 'on', brightness: 55, updatedAt: new Date().toISOString() }],
  ['entry_light', { deviceId: 'entry_light', name: 'Entry light', kind: 'light', power: 'off', brightness: 0, updatedAt: new Date().toISOString() }],
  ['thermostat', { deviceId: 'thermostat', name: 'Thermostat', kind: 'thermostat', temperatureC: 20, mode: 'heat', updatedAt: new Date().toISOString() }],
  ['front_door_lock', { deviceId: 'front_door_lock', name: 'Front door lock', kind: 'lock', locked: true, updatedAt: new Date().toISOString() }],
]);
const sceneLog = [];

function simulatedCalendarEvents() {
  const now = Date.now();
  return [
    {
      eventId: 'demo-roadmap-review',
      title: 'Product roadmap review',
      startTime: new Date(now - 10 * 60_000).toISOString(),
      endTime: new Date(now + 35 * 60_000).toISOString(),
      location: 'Conference room 4B (simulated)',
      attendees: ['Product team (sample attendees)'],
      note: 'Sample calendar event; no calendar account is connected.',
    },
    {
      eventId: 'demo-design-checkin',
      title: 'Design check-in',
      startTime: new Date(now + 3 * 60 * 60_000).toISOString(),
      endTime: new Date(now + 3 * 60 * 60_000 + 30 * 60_000).toISOString(),
      location: 'Video call (simulated)',
      attendees: ['Design team (sample attendees)'],
      note: 'Sample calendar event; no calendar account is connected.',
    },
  ];
}

export function simulatorSnapshot() {
  return {
    simulated: true,
    disclaimer: 'This is demo data in the server process. No real home, calendar, or third-party account is connected.',
    generatedAt: new Date().toISOString(),
    devices: [...devices.values()].map(device => ({ ...device })),
    recentScenes: sceneLog.slice(-10).map(item => ({ ...item })),
  };
}

export function registerHomeSimulator(server) {
  server.registerTool('get_calendar_events', {
    title: 'Check sample calendar',
    description: 'Reads upcoming events from an explicitly simulated sample calendar. It does not access Google Calendar, Outlook, or a real account.',
    inputSchema: z.object({ windowHours: z.number().int().min(1).max(72).optional() }).strict(),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ windowHours = 12 }) => {
    const now = Date.now();
    const until = now + windowHours * 60 * 60_000;
    const events = simulatedCalendarEvents().filter(event => Date.parse(event.endTime) >= now && Date.parse(event.startTime) <= until);
    const text = events.length
      ? `Sample calendar — ${events.length} event${events.length === 1 ? '' : 's'} in the next ${windowHours} hours:\n${events.map(event => `${event.title}: ${event.startTime} to ${event.endTime}; ${event.location}. ${event.note}`).join('\n')}`
      : `No sample calendar events in the next ${windowHours} hours.`;
    return { content: [{ type: 'text', text }], structuredContent: { simulated: true, windowHours, events } };
  });

  server.registerTool('get_home_status', {
    title: 'Check simulated home',
    description: 'Reads current device states from the explicitly simulated household. It does not access a real smart-home system.',
    inputSchema: z.object({}).strict(),
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  }, async () => {
    const snapshot = simulatorSnapshot();
    const text = `Simulated home status (not connected to a real home):\n${snapshot.devices.map(device => {
      if (device.kind === 'light') return `- ${device.name}: ${device.power}, ${device.brightness}% brightness`;
      if (device.kind === 'thermostat') return `- ${device.name}: ${device.temperatureC}°C, ${device.mode} mode`;
      return `- ${device.name}: ${device.locked ? 'locked' : 'unlocked'}`;
    }).join('\n')}`;
    return { content: [{ type: 'text', text }], structuredContent: snapshot };
  });

  const LightChange = z.object({
    deviceId: z.enum(['living_room_light', 'entry_light']),
    power: z.enum(['on', 'off']).optional(),
    brightness: z.number().int().min(0).max(100).optional(),
  }).strict().refine(change => change.power !== undefined || change.brightness !== undefined, 'Specify power or brightness.');
  const ThermostatChange = z.object({
    deviceId: z.literal('thermostat'),
    temperatureC: z.number().min(12).max(28),
  }).strict();
  const LockChange = z.object({
    deviceId: z.literal('front_door_lock'),
    locked: z.boolean(),
  }).strict();
  const SceneChange = z.discriminatedUnion('deviceId', [LightChange, ThermostatChange, LockChange]);

  server.registerTool('set_home_scene', {
    title: 'Prepare the simulated home',
    description: 'Changes one to three named demo-device states, such as turning off lights or locking the demo door. This is a visible state change in a simulator only; it is never a real home action. The application requires explicit user approval before calling it.',
    inputSchema: z.object({
      sceneName: z.string().trim().min(1).max(80),
      changes: z.array(SceneChange).min(1).max(3),
    }).strict(),
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, async ({ sceneName, changes }) => {
    const before = changes.map(change => ({ ...devices.get(change.deviceId) }));
    for (const change of changes) {
      const current = devices.get(change.deviceId);
      if (!current) return { isError: true, content: [{ type: 'text', text: `Unknown simulated device ${change.deviceId}.` }] };
      if (current.kind === 'light') {
        if (change.power !== undefined) current.power = change.power;
        if (change.brightness !== undefined) {
          current.brightness = change.brightness;
          if (change.brightness === 0) current.power = 'off';
          else if (change.power === undefined) current.power = 'on';
        }
      } else if (current.kind === 'thermostat') {
        current.temperatureC = change.temperatureC;
      } else if (current.kind === 'lock') {
        current.locked = change.locked;
      }
      current.updatedAt = new Date().toISOString();
    }
    const after = changes.map(change => ({ ...devices.get(change.deviceId) }));
    const record = { sceneName, appliedAt: new Date().toISOString(), simulated: true, before, after };
    sceneLog.push(record);
    return {
      content: [{ type: 'text', text: `Applied “${sceneName}” to the simulated home after approval. Updated demo devices: ${after.map(device => `${device.name} (${device.kind === 'light' ? `${device.power}, ${device.brightness}%` : device.kind === 'lock' ? (device.locked ? 'locked' : 'unlocked') : `${device.temperatureC}°C`})`).join('; ')}. No real devices were changed.` }],
      structuredContent: record,
    };
  });
}
