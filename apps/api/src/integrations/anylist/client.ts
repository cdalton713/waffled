// Read-only client for the unofficial www.anylist.com API, used to import an account into
// Waffled. Email/password → bearer token, then one call returns the whole account.
import { randomUUID } from 'node:crypto'
import { config } from '../../platform/config'
import { decodeUserData, type PbUserData } from './codec'

const API_VERSION = '3'
const TIMEOUT_MS = 30_000

// AnyList refused the email/password.
export class AnyListAuthError extends Error {
  constructor(message = 'AnyList rejected the email or password') {
    super(message)
    this.name = 'AnyListAuthError'
  }
}

// AnyList answered with something other than success (or not at all).
export class AnyListHttpError extends Error {
  constructor(public status: number, path: string) {
    super(`AnyList ${path} failed with HTTP ${status}`)
    this.name = 'AnyListHttpError'
  }
}

async function post(path: string, form: FormData, headers: Record<string, string> = {}): Promise<Response> {
  try {
    return await fetch(config.anylist.baseUrl + path, {
      method: 'POST',
      body: form,
      redirect: 'manual',
      headers: { 'X-AnyLeaf-API-Version': API_VERSION, ...headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new AnyListHttpError(0, path)
  }
}

export class AnyListClient {
  private constructor(private accessToken: string, private clientId: string) {}

  static async signIn(email: string, password: string): Promise<AnyListClient> {
    const form = new FormData()
    form.append('email', email)
    form.append('password', password)
    const res = await post('/auth/token', form)
    if (res.status === 400 || res.status === 401 || res.status === 403) throw new AnyListAuthError()
    if (!res.ok) throw new AnyListHttpError(res.status, '/auth/token')
    const body = (await res.json()) as { access_token?: string }
    if (!body.access_token) throw new AnyListHttpError(res.status, '/auth/token')
    return new AnyListClient(body.access_token, randomUUID())
  }

  async getUserData(): Promise<PbUserData> {
    const res = await post('/data/user-data/get', new FormData(), {
      authorization: `Bearer ${this.accessToken}`,
      'X-AnyLeaf-Client-Identifier': this.clientId,
    })
    if (res.status === 401) throw new AnyListAuthError('AnyList rejected the access token')
    if (!res.ok) throw new AnyListHttpError(res.status, '/data/user-data/get')
    return decodeUserData(new Uint8Array(await res.arrayBuffer()))
  }
}

export function photoUrl(photoId: string): string {
  return `${config.anylist.photosBaseUrl}/${photoId}.jpg`
}

export async function downloadPhoto(url: string): Promise<{ bytes: Buffer; contentType: string } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
    if (!res.ok) return null
    return { bytes: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? 'image/jpeg' }
  } catch {
    return null
  }
}
