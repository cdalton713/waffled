export class HomeError extends Error {
  constructor(public statusCode: number, name: string, message: string) { super(message); this.name = name }
}

export const ACTIONS = ['setPower', 'setBrightness', 'setThermostatMode', 'setThermostatTargets'] as const
const MODES = ['off', 'heat', 'cool', 'heatCool']
export interface Climate {
  currentC: number | null; heatC: number | null; coolC: number | null
  mode: string | null; modes: string[]
  minHeatC: number | null; maxHeatC: number | null
  minCoolC: number | null; maxCoolC: number | null; minDeadBandC: number | null
}
export interface HomeDevice {
  id: string; name: string; room: string | null; type: 'light' | 'thermostat'
  available: boolean; observedAt: string | null; capabilities: string[]
  power?: boolean | null; brightness?: number | null; thermostat?: Climate | null
}
export interface BridgeStatus { apiVersion: number; bridgeId: string; permission: string; homeId: string | null; homeName: string | null; error?: unknown }
export interface BridgeCredentials { port: number; token: string }

export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new HomeError(400, 'BadRequest', 'An object is required.')
  return value as Record<string, unknown>
}

function invalidResponse(): never { throw new HomeError(502, 'InvalidBridgeResponse', 'The Android service returned an invalid response.') }

export async function bridgeRequest(credentials: BridgeCredentials, path: string, body?: unknown): Promise<unknown> {
  let response: globalThis.Response
  try {
    response = await fetch(`http://127.0.0.1:${credentials.port}/v1${path}`, {
      method: body === undefined ? 'GET' : 'POST', redirect: 'error', signal: AbortSignal.timeout(6500),
      headers: { authorization: `Bearer ${credentials.token}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    throw new HomeError(timedOut ? 504 : 503, 'BridgeUnavailable', timedOut ? 'The command was not confirmed. Refresh device state.' : 'The Android service is unavailable. Check that it is running on this device.')
  }
  if (!response.ok) {
    const status = [400, 404, 409, 503, 504].includes(response.status) ? response.status : 503
    throw new HomeError(status, 'BridgeRequestFailed', 'The Android service could not complete this request. Check its connection and refresh device state.')
  }
  try { return await response.json() } catch { return invalidResponse() }
}

export async function readBridgeStatus(credentials: BridgeCredentials): Promise<BridgeStatus> {
  const raw = await bridgeRequest(credentials, '/status')
  if (!raw || typeof raw !== 'object') return invalidResponse()
  const value = raw as Record<string, unknown>
  if (value.apiVersion !== 1 || typeof value.bridgeId !== 'string' || !value.bridgeId ||
      typeof value.permission !== 'string' || value.homeId != null && typeof value.homeId !== 'string' ||
      value.homeName != null && typeof value.homeName !== 'string') return invalidResponse()
  return { apiVersion: 1, bridgeId: value.bridgeId, permission: value.permission,
    homeId: value.homeId as string | null ?? null, homeName: value.homeName as string | null ?? null, error: value.error }
}

function nullableNumber(value: unknown): number | null {
  if (value == null) return null
  if (typeof value !== 'number' || !Number.isFinite(value)) return invalidResponse()
  return value
}

export async function readBridgeDevices(credentials: BridgeCredentials): Promise<HomeDevice[]> {
  const raw = await bridgeRequest(credentials, '/devices')
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { devices?: unknown }).devices)) return invalidResponse()
  return (raw as { devices: unknown[] }).devices.map((entry): HomeDevice => {
    if (!entry || typeof entry !== 'object') return invalidResponse()
    const value = entry as Record<string, unknown>
    if (typeof value.id !== 'string' || !value.id || typeof value.name !== 'string' ||
        !['light', 'thermostat'].includes(String(value.type)) || typeof value.available !== 'boolean' ||
        !Array.isArray(value.capabilities) || !value.capabilities.every((cap) => ACTIONS.includes(cap)) ||
        value.room != null && typeof value.room !== 'string' ||
        value.observedAt != null && (typeof value.observedAt !== 'string' || !Number.isFinite(Date.parse(value.observedAt)))) return invalidResponse()
    if (value.power != null && typeof value.power !== 'boolean') return invalidResponse()
    const brightness = nullableNumber(value.brightness)
    if (brightness != null && (!Number.isInteger(brightness) || brightness < 0 || brightness > 100)) return invalidResponse()
    let thermostat: Climate | null = null
    if (value.type === 'thermostat') {
      const climate = value.thermostat
      if (!climate || typeof climate !== 'object') return invalidResponse()
      const t = climate as Record<string, unknown>
      if (!Array.isArray(t.modes) || !t.modes.every((m) => typeof m === 'string' && MODES.includes(m)) ||
          t.mode != null && (typeof t.mode !== 'string' || !MODES.includes(t.mode))) return invalidResponse()
      thermostat = {
        currentC: nullableNumber(t.currentC), heatC: nullableNumber(t.heatC), coolC: nullableNumber(t.coolC),
        mode: t.mode as string | null ?? null, modes: t.modes as string[],
        minHeatC: nullableNumber(t.minHeatC), maxHeatC: nullableNumber(t.maxHeatC),
        minCoolC: nullableNumber(t.minCoolC), maxCoolC: nullableNumber(t.maxCoolC), minDeadBandC: nullableNumber(t.minDeadBandC),
      }
    }
    return { id: value.id, name: value.name, room: value.room as string | null ?? null, type: value.type as HomeDevice['type'],
      available: value.available, observedAt: value.observedAt as string | null ?? null, capabilities: value.capabilities,
      ...(value.type === 'light' ? { power: value.power as boolean | null ?? null, brightness } : { thermostat }) }
  })
}

export function validateHomeCommand(device: HomeDevice, body: unknown): Record<string, unknown> {
  const command = object(body)
  const bad = (message: string): never => { throw new HomeError(400, 'BadRequest', message) }
  if (!device.available) throw new HomeError(503, 'DeviceUnavailable', 'This device is unavailable.')
  if (typeof command.action !== 'string' || !device.capabilities.includes(command.action)) bad('This device does not support that command.')
  const fields: Record<string, string[]> = {
    setPower: ['power'], setBrightness: ['brightness'], setThermostatMode: ['mode'], setThermostatTargets: ['heatC', 'coolC'],
  }
  const allowed = fields[command.action as string]
  if (!allowed || Object.keys(command).some((key) => key !== 'action' && !allowed.includes(key))) bad('Unexpected command field.')
  if (command.action === 'setPower' && (device.type !== 'light' || typeof command.power !== 'boolean')) bad('Supply a power value.')
  if (command.action === 'setBrightness' && (device.type !== 'light' || !Number.isInteger(command.brightness) ||
      Number(command.brightness) < 0 || Number(command.brightness) > 100)) bad('Supply brightness from 0 to 100.')
  if (command.action === 'setThermostatMode' && (typeof command.mode !== 'string' || !device.thermostat?.modes.includes(command.mode))) bad('Supply a supported thermostat mode.')
  if (command.action === 'setThermostatTargets') {
    const t = device.thermostat ?? bad('This is not a thermostat.')
    if (command.heatC === undefined && command.coolC === undefined) bad('Supply heatC or coolC.')
    for (const [field, min, max, modes] of [
      ['heatC', t.minHeatC, t.maxHeatC, ['heat', 'heatCool']], ['coolC', t.minCoolC, t.maxCoolC, ['cool', 'heatCool']],
    ] as const) {
      if (command[field] === undefined) continue
      const n = command[field]
      if (typeof n !== 'number' || !Number.isFinite(n) || min == null || max == null || n < min || n > max || !(modes as readonly string[]).includes(t.mode ?? '')) bad('Temperature is outside the limits for the current mode.')
    }
    if (t.mode === 'heatCool') {
      const heat = command.heatC ?? t.heatC
      const cool = command.coolC ?? t.coolC
      if (typeof heat !== 'number' || typeof cool !== 'number' || t.minDeadBandC == null || cool - heat < t.minDeadBandC - 0.000001) bad('Keep the heating and cooling targets within the device temperature gap.')
    }
  }
  return command
}
