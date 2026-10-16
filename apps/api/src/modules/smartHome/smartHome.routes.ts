import type createAPI from 'lambda-api'
import type { QueryResultRow } from 'pg'
import { moduleRoutes } from '../../platform/route-guards'
import { query } from '../../platform/db'
import { requireCapability } from '../../platform/permissions'
import { decryptSecret, encryptSecret, encryptionAvailable } from '../../platform/crypto'
import { bridgeRequest, HomeError, object, readBridgeDevices, readBridgeStatus, validateHomeCommand, type BridgeCredentials } from './bridge'

const { tenantRoute, adminRoute } = moduleRoutes('smartHome')

interface Connection extends QueryResultRow {
  household_id: string; bridge_id: string; home_id: string; port: number; token_enc: string
  selected_device_ids: string[]; temperature_unit: 'F' | 'C'
}

async function connection(householdId: string): Promise<Connection | null> {
  return (await query<Connection>('select * from smart_home_connections where household_id = $1', [householdId])).rows[0] ?? null
}

function present(row: Connection | null) {
  return row ? { configured: true, tokenConfigured: true, port: row.port, bridgeId: row.bridge_id,
    homeId: row.home_id, selectedDeviceIds: row.selected_device_ids, temperatureUnit: row.temperature_unit }
    : { configured: false, tokenConfigured: false, selectedDeviceIds: [], temperatureUnit: 'F' }
}

function credentials(row: Connection): BridgeCredentials {
  try { return { port: row.port, token: decryptSecret(row.token_enc) } }
  catch { throw new HomeError(503, 'BridgeCredentialsUnavailable', 'Reconnect the Android service to restore access.') }
}

async function requireConnection(householdId: string) {
  const row = await connection(householdId)
  if (!row) throw new HomeError(503, 'BridgeNotConfigured', 'Connect the Android Home Bridge first.')
  const auth = credentials(row)
  const status = await readBridgeStatus(auth)
  if (status.permission !== 'granted' || status.error || !status.homeId) throw new HomeError(503, 'PermissionRequired', 'Open Waffled Home Bridge to connect Google Home.')
  if (status.bridgeId !== row.bridge_id || status.homeId !== row.home_id) throw new HomeError(409, 'BridgeChanged', 'Reconnect the Android service and select devices for this home.')
  return { row, auth }
}

export function registerSmartHomeRoutes(api: ReturnType<typeof createAPI>): void {
  api.get('/api/smart-home/config', adminRoute(async (tenant) => present(await connection(tenant.householdId))))

  api.put('/api/smart-home/config', adminRoute(async (tenant, req) => {
    const body = object(req.body)
    if (Object.keys(body).some((key) => !['port', 'token', 'selectedDeviceIds', 'temperatureUnit'].includes(key))) throw new HomeError(400, 'BadRequest', 'Unknown connection setting.')
    if (['port', 'token', 'temperatureUnit'].some((key) => body[key] === null)) throw new HomeError(400, 'BadRequest', 'Connection values cannot be null.')
    const previous = await connection(tenant.householdId)
    const port = body.port ?? previous?.port ?? 8765
    const token = body.token ?? (previous ? credentials(previous).token : null)
    if (typeof port !== 'number' || !Number.isInteger(port) || port < 1024 || port > 65535 ||
        typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) throw new HomeError(400, 'BadRequest', 'Supply a local service port and valid service token.')
    const unit = body.temperatureUnit ?? previous?.temperature_unit ?? 'F'
    if (unit !== 'F' && unit !== 'C') throw new HomeError(400, 'BadRequest', 'Temperature unit must be F or C.')
    if (body.selectedDeviceIds !== undefined && (!Array.isArray(body.selectedDeviceIds) || !body.selectedDeviceIds.every((id) => typeof id === 'string' && id.length > 0))) throw new HomeError(400, 'BadRequest', 'Select device IDs from discovery.')
    if (!encryptionAvailable()) throw new HomeError(503, 'EncryptionUnavailable', 'Configure TOKEN_ENCRYPTION_KEY before connecting the Android service.')
    const auth = { port, token }
    const status = await readBridgeStatus(auth)
    if (status.permission !== 'granted' || status.error || !status.homeId) throw new HomeError(503, 'PermissionRequired', 'Connect Google Home in the Android app first.')
    const replacement = !previous || previous.bridge_id !== status.bridgeId || previous.home_id !== status.homeId || previous.port !== port || body.token !== undefined
    const selected = replacement ? [] : [...new Set(body.selectedDeviceIds as string[] | undefined ?? previous.selected_device_ids)]
    if (selected.length) {
      const available = new Set((await readBridgeDevices(auth)).map((device) => device.id))
      if (selected.some((id) => !available.has(id))) throw new HomeError(400, 'BadRequest', 'Select device IDs from discovery.')
    }
    try {
      await query(`insert into smart_home_connections (household_id, bridge_id, home_id, port, token_enc, selected_device_ids, temperature_unit)
        values ($1,$2,$3,$4,$5,$6::jsonb,$7)
        on conflict (household_id) do update set bridge_id=excluded.bridge_id, home_id=excluded.home_id,
          port=excluded.port, token_enc=excluded.token_enc, selected_device_ids=excluded.selected_device_ids,
          temperature_unit=excluded.temperature_unit, updated_at=now()`,
      [tenant.householdId, status.bridgeId, status.homeId, port, encryptSecret(token), JSON.stringify(selected), unit])
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new HomeError(409, 'BridgeAlreadyConnected', 'This Android service is connected to another household.')
      throw error
    }
    return present(await connection(tenant.householdId))
  }))

  api.delete('/api/smart-home/config', adminRoute(async (tenant, _req, res) => {
    await query('delete from smart_home_connections where household_id = $1', [tenant.householdId])
    return res.status(204).send('')
  }))

  api.get('/api/smart-home/discovery', adminRoute(async (tenant) => {
    const { auth } = await requireConnection(tenant.householdId)
    return { devices: await readBridgeDevices(auth) }
  }))

  api.get('/api/smart-home/devices', tenantRoute(async (tenant) => {
    const { row, auth } = await requireConnection(tenant.householdId)
    const devices = (await readBridgeDevices(auth)).filter((device) => row.selected_device_ids.includes(device.id))
    return { devices, temperatureUnit: row.temperature_unit }
  }))

  api.post('/api/smart-home/devices/:id/commands', tenantRoute(async (tenant, req, res) => {
    await requireCapability(tenant, 'smartHome.control')
    const { row, auth } = await requireConnection(tenant.householdId)
    const id = req.params.id ?? ''
    if (!row.selected_device_ids.includes(id)) throw new HomeError(404, 'NotFound', 'Device not found.')
    const device = (await readBridgeDevices(auth)).find((device) => device.id === id)
    if (!device) throw new HomeError(404, 'NotFound', 'Device not found.')
    const command = validateHomeCommand(device, req.body)
    const result = await bridgeRequest(auth, `/devices/${encodeURIComponent(id)}/commands`, command)
    if (!result || typeof result !== 'object' || (result as { accepted?: unknown }).accepted !== true) throw new HomeError(502, 'InvalidBridgeResponse', 'The Android service did not accept the command.')
    return res.status(202).json({ accepted: true })
  }))
}
