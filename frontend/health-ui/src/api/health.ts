import type { HealthState } from '@/types'

const HEALTH_ENDPOINT = '/api/v1/state'

export const fetchHealthState = async (): Promise<HealthState> => {
  const response = await fetch(HEALTH_ENDPOINT, {
    headers: {
      Accept: 'application/json',
    },
  })

  if (!response.ok) {
    const message = await safeReadText(response)
    throw new Error(message || `Request failed with status ${response.status}`)
  }

  const payload = (await response.json()) as HealthState

  return {
    ...payload,
    last_updated: normalizeTimestamp(payload.last_updated),
  }
}

const safeReadText = async (response: Response): Promise<string | undefined> => {
  try {
    return await response.text()
  } catch {
    return undefined
  }
}

const normalizeTimestamp = (timestamp: number | string): number => {
  const value = typeof timestamp === 'string' ? Number(timestamp) : timestamp
  if (Number.isFinite(value)) {
    // API returns seconds; convert to ms
    return value * 1000
  }
  return Date.now()
}

