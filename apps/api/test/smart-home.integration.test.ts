import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from './helpers/pg'
import { runMigrations } from '../src/migrate'
import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client } from 'pg'
import jwt from 'jsonwebtoken'

let database: StartedPostgreSqlContainer
let app: { run(event: Record<string, unknown>, context: Record<string, unknown>): Promise<{ statusCode: number; body: string }> }
let closePool: () => Promise<void>
let admin = ''
let bridge: Server
let port = 0
const serviceToken = 'test-service-token-with-at-least-32-characters'
let power = false
const memberTokens: string[] = []
let otherAdmin = ''
let googleHomeId = 'google-home'
let permission = 'granted'
let available = true
let redirect = false
const climate = { currentC: 21, heatC: 20, coolC: 24, mode: 'heatCool', modes: ['off', 'heat', 'cool', 'heatCool'], minHeatC: 7, maxHeatC: 30, minCoolC: 16, maxCoolC: 32, minDeadBandC: 2 }
const light = () => ({ id: 'kitchen', name: 'Kitchen light', room: 'Kitchen', type: 'light', available: true,
  observedAt: '2026-10-15T12:00:00Z', capabilities: ['setPower'], power, brightness: null })

function call(method: string, path: string, token = admin, body?: unknown) {
  return app.run({ httpMethod: method, path, headers: {
    authorization: `Bearer ${token}`,
    ...(body === undefined ? {} : { 'content-type': 'application/json' }),
  }, queryStringParameters: {}, body: body === undefined ? null : JSON.stringify(body), isBase64Encoded: false }, {})
}

beforeAll(async () => {
  database = await new PostgreSqlContainer('postgres:16').start()
  const url = database.getConnectionUri()
  await runMigrations(url)
  process.env.DATABASE_URL = url
  process.env.LOCAL_JWT_SECRET = 'waffled-local-dev-secret-change-me'
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
  delete process.env.AUTH0_DOMAIN
  app = (await import('../src/app')).default as unknown as typeof app
  closePool = (await import('../src/platform/db')).closePool
  const setup = await call('POST', '/api/auth/setup', '', {
    household: { name: 'Home controls', timezone: 'America/Denver' },
    admin: { name: 'Owner', email: 'bridge@example.com', password: 'test-password1' },
  })
  expect(setup.statusCode).toBe(201)
  admin = JSON.parse(setup.body).accessToken
  expect((await call('GET', '/api/smart-home/devices')).statusCode).toBe(403)
  const db = new Client({ connectionString: url })
  await db.connect()
  try {
    for (const role of ['adult', 'teen', 'kid']) {
      const sub = `bridge|${role}`
      const person = await db.query<{ id: string }>('insert into persons (household_id, name, member_type, is_admin) values ($1,$2,$2,false) returning id', [JSON.parse(setup.body).household.id, role])
      await db.query("insert into identities (household_id, person_id, provider, auth0_user_id, email_verified) values ($1,$2,'password',$3,true)", [JSON.parse(setup.body).household.id, person.rows[0].id, sub])
      memberTokens.push(jwt.sign({}, 'waffled-local-dev-secret-change-me', { subject: sub, issuer: 'waffled-local', audience: 'waffled-api', expiresIn: '1h' }))
    }
    const other = await db.query<{ id: string }>("insert into households (name, timezone) values ('Another home','UTC') returning id")
    const otherPerson = await db.query<{ id: string }>("insert into persons (household_id, name, member_type, is_admin) values ($1,'Other owner','adult',true) returning id", [other.rows[0].id])
    await db.query("insert into identities (household_id, person_id, provider, auth0_user_id, email_verified) values ($1,$2,'password','bridge|other',true)", [other.rows[0].id, otherPerson.rows[0].id])
    otherAdmin = jwt.sign({}, 'waffled-local-dev-secret-change-me', { subject: 'bridge|other', issuer: 'waffled-local', audience: 'waffled-api', expiresIn: '1h' })
  } finally { await db.end() }
  bridge = createServer(async (req, res) => {
    res.setHeader('content-type', 'application/json')
    if (req.headers.authorization !== `Bearer ${serviceToken}`) { res.writeHead(401).end('{}'); return }
    if (redirect) { res.writeHead(302, { location: '/v1/status' }).end(); return }
    if (req.url === '/v1/status') {
      res.end(JSON.stringify({ apiVersion: 1, bridgeId: 'android-bridge', permission, homeId: googleHomeId, homeName: 'Home' }))
    } else if (req.url === '/v1/devices') {
      res.end(JSON.stringify({ devices: [{ ...light(), available }, { ...light(), id: 'bedroom', name: 'Bedroom light' },
        { id: 'thermostat', name: 'Thermostat', type: 'thermostat', available, observedAt: '2026-10-15T12:00:00Z', capabilities: ['setThermostatMode', 'setThermostatTargets'], thermostat: climate }] }))
    } else if (req.url === '/v1/devices/kitchen/commands' && req.method === 'POST') {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      power = JSON.parse(Buffer.concat(chunks).toString()).power
      res.writeHead(202).end('{"accepted":true}')
    } else if (req.url === '/v1/devices/thermostat/commands' && req.method === 'POST') {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const command = JSON.parse(Buffer.concat(chunks).toString())
      if (command.mode) climate.mode = command.mode
      if (command.heatC !== undefined) climate.heatC = command.heatC
      if (command.coolC !== undefined) climate.coolC = command.coolC
      res.writeHead(202).end('{"accepted":true}')
    } else res.writeHead(404).end('{}')
  })
  await new Promise<void>((resolve) => bridge.listen(0, '127.0.0.1', resolve))
  port = (bridge.address() as AddressInfo).port
})

afterAll(async () => {
  if (bridge) await new Promise<void>((resolve, reject) => bridge.close((error) => error ? reject(error) : resolve()))
  await closePool?.(); await database?.stop()
})

beforeEach(async () => {
  permission = 'granted'
  googleHomeId = 'google-home'
  available = true
  redirect = false
  power = false
  Object.assign(climate, { heatC: 20, coolC: 24, mode: 'heatCool' })
  expect((await call('PATCH', '/api/household/modules', admin, { smartHome: true })).statusCode).toBe(200)
  expect((await call('PUT', '/api/smart-home/config', admin, { port, token: serviceToken })).statusCode).toBe(200)
  expect((await call('PUT', '/api/smart-home/config', admin, { selectedDeviceIds: ['kitchen'], temperatureUnit: 'F' })).statusCode).toBe(200)
  expect((await call('PUT', '/api/permissions', admin, { permissions: {} })).statusCode).toBe(200)
})

describe('Google Home bridge', () => {
  it('keeps the optional feature disabled until an administrator enables it', async () => {
    expect((await call('PATCH', '/api/household/modules', admin, { smartHome: false })).statusCode).toBe(200)
    expect((await call('GET', '/api/smart-home/devices')).statusCode).toBe(403)
  })

  it('connects locally, selects a light, and confirms its changed state through the public API', async () => {
    expect((await call('PATCH', '/api/household/modules', admin, { smartHome: true })).statusCode).toBe(200)
    const connected = await call('PUT', '/api/smart-home/config', admin, { port, token: serviceToken })
    expect(connected.statusCode).toBe(200)
    expect(connected.body).not.toContain(serviceToken)
    const selected = await call('PUT', '/api/smart-home/config', admin, { selectedDeviceIds: ['kitchen'] })
    expect(selected.statusCode).toBe(200)
    const devices = JSON.parse((await call('GET', '/api/smart-home/devices')).body).devices
    expect(devices).toEqual([light()])
    const command = await call('POST', '/api/smart-home/devices/kitchen/commands', admin, { action: 'setPower', power: true })
    expect(command.statusCode).toBe(202)
    expect(JSON.parse((await call('GET', '/api/smart-home/devices')).body).devices[0].power).toBe(true)
  })

  it('lets every household role control devices while keeping setup administrator-only', async () => {
    for (const token of memberTokens) {
      const household = JSON.parse((await call('GET', '/api/household', token)).body)
      expect(household.person.capabilities).toContain('smartHome.control')
      expect((await call('POST', '/api/smart-home/devices/kitchen/commands', token, { action: 'setPower', power: false })).statusCode).toBe(202)
      expect((await call('GET', '/api/smart-home/config', token)).statusCode).toBe(403)
      expect((await call('GET', '/api/smart-home/discovery', token)).statusCode).toBe(403)
    }
    expect((await call('PUT', '/api/permissions', admin, { permissions: { kid: { 'smartHome.control': false } } })).statusCode).toBe(200)
    expect((await call('POST', '/api/smart-home/devices/kitchen/commands', memberTokens[2], { action: 'setPower', power: true })).statusCode).toBe(403)
    expect((await call('GET', '/api/smart-home/devices', memberTokens[2])).statusCode).toBe(200)
  })

  it('rejects unselected devices, malformed commands, and unavailable devices', async () => {
    expect((await call('POST', '/api/smart-home/devices/bedroom/commands', admin, { action: 'setPower', power: true })).statusCode).toBe(404)
    for (const body of [{ action: 'toggle' }, { action: 'setPower', power: 'true' }, { action: 'setPower', power: true, url: 'http://example.com' }]) {
      expect((await call('POST', '/api/smart-home/devices/kitchen/commands', admin, body)).statusCode).toBe(400)
    }
    available = false
    try { expect((await call('POST', '/api/smart-home/devices/kitchen/commands', admin, { action: 'setPower', power: true })).statusCode).toBe(503) }
    finally { available = true }
  })

  it('validates thermostat modes, temperature bounds, and the heat-cool gap', async () => {
    expect((await call('PUT', '/api/smart-home/config', admin, { selectedDeviceIds: ['kitchen', 'thermostat'], temperatureUnit: 'C' })).statusCode).toBe(200)
    for (const body of [{ action: 'setThermostatMode', mode: 'fan' }, { action: 'setThermostatTargets', heatC: 40 },
      { action: 'setThermostatTargets', heatC: 23, coolC: 24 }, { action: 'setThermostatTargets', heatC: '22' }]) {
      expect((await call('POST', '/api/smart-home/devices/thermostat/commands', admin, body)).statusCode).toBe(400)
    }
    expect((await call('POST', '/api/smart-home/devices/thermostat/commands', admin, { action: 'setThermostatTargets', heatC: 21, coolC: 25 })).statusCode).toBe(202)
    const state = JSON.parse((await call('GET', '/api/smart-home/devices')).body)
    expect(state.temperatureUnit).toBe('C')
    expect(state.devices.find((device: { id: string }) => device.id === 'thermostat').thermostat).toMatchObject({ heatC: 21, coolC: 25 })
    expect((await call('POST', '/api/smart-home/devices/thermostat/commands', admin, { action: 'setThermostatMode', mode: 'off' })).statusCode).toBe(202)
    expect((await call('POST', '/api/smart-home/devices/thermostat/commands', admin, { action: 'setThermostatTargets', heatC: 22 })).statusCode).toBe(400)
  })

  it('isolates households and keeps service credentials out of client data and replication', async () => {
    expect((await call('PATCH', '/api/household/modules', otherAdmin, { smartHome: true })).statusCode).toBe(200)
    expect(JSON.parse((await call('GET', '/api/smart-home/config', otherAdmin)).body).configured).toBe(false)
    expect((await call('GET', '/api/smart-home/devices', otherAdmin)).statusCode).toBe(503)
    expect((await call('PUT', '/api/smart-home/config', otherAdmin, { port, token: serviceToken })).statusCode).toBe(409)
    expect((await call('GET', '/api/household')).body).not.toContain(serviceToken)
    const db = new Client({ connectionString: database.getConnectionUri() })
    await db.connect()
    try {
      const stored = await db.query<{ token_enc: string }>('select token_enc from smart_home_connections')
      expect(stored.rows[0].token_enc).not.toContain(serviceToken)
      expect(stored.rows[0].token_enc.length).toBeGreaterThan(32)
      const publication = await db.query("select * from pg_publication_tables where pubname = 'powersync' and tablename = 'smart_home_connections'")
      expect(publication.rowCount).toBe(0)
    } finally { await db.end() }
  })

  it('stops commands after permission loss or a Google home change and refuses redirects', async () => {
    permission = 'required'
    try { expect((await call('POST', '/api/smart-home/devices/kitchen/commands', admin, { action: 'setPower', power: true })).statusCode).toBe(503) }
    finally { permission = 'granted' }
    googleHomeId = 'different-home'
    try { expect((await call('GET', '/api/smart-home/devices')).statusCode).toBe(409) }
    finally { googleHomeId = 'google-home' }
    redirect = true
    try { expect((await call('GET', '/api/smart-home/devices')).statusCode).toBe(503) }
    finally { redirect = false }
    expect((await call('PUT', '/api/smart-home/config', admin, { port: 'http://example.com', token: serviceToken })).statusCode).toBe(400)
  })

  it('keeps API keys out of device controls and disconnects without needing the Android service', async () => {
    const key = JSON.parse((await call('POST', '/api/api-keys', admin, { name: 'Other integration', scopes: ['family:read'] })).body).key
    const response = await app.run({ httpMethod: 'GET', path: '/api/smart-home/devices', headers: { 'x-api-key': key }, queryStringParameters: {}, body: null, isBase64Encoded: false }, {})
    expect(response.statusCode).toBe(403)
    expect((await call('DELETE', '/api/smart-home/config')).statusCode).toBe(204)
    expect(JSON.parse((await call('GET', '/api/smart-home/config')).body).configured).toBe(false)
    expect((await call('GET', '/api/smart-home/devices')).statusCode).toBe(503)
  })

  it('rejects null connection values instead of silently replacing device selection', async () => {
    for (const field of ['port', 'token', 'temperatureUnit']) {
      expect((await call('PUT', '/api/smart-home/config', admin, { [field]: null })).statusCode).toBe(400)
    }
    expect(JSON.parse((await call('GET', '/api/smart-home/config')).body).selectedDeviceIds).toEqual(['kitchen'])
  })
})
