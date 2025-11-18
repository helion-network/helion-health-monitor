export type PeerState = 'offline' | 'unreachable' | 'joining' | 'online'

export interface HealthState {
  bootstrap_states: PeerState[]
  top_contributors: Record<string, number>
  model_reports: ModelReport[]
  reachability_issues: ReachabilityIssue[]
  last_updated: number
  update_period: number
  update_duration: number
}

export interface ReachabilityIssue {
  peer_id: string
  err: string
}

export interface ModelReport extends ModelInfo {
  name: string
  short_name: string
  state: 'healthy' | 'broken'
  server_rows: ServerRow[]
}

export interface ModelInfo {
  repository: string
  dht_prefix: string
  num_blocks: number
  official: boolean
  limited: boolean
}

export interface ServerRow {
  short_peer_id: string
  peer_id: string
  show_public_name: boolean
  state: PeerState
  span: SpanInfo
  adapters: AdapterInfo[]
  pings_to_me: Record<string, number>
  cache_tokens_left_per_block?: number
  peer_ip_info?: string | PeerIpInfo
}

export interface PeerIpInfo {
  location?: string
  multiaddrs?: string[]
}

export interface SpanInfo {
  start: number
  end: number
  length: number
  server_info: ServerInfo
}

export interface ServerInfo {
  public_name?: string | null
  version?: string | null
  throughput?: number | null
  inference_rps?: number | null
  forward_rps?: number | null
  network_rps?: number | null
  torch_dtype?: string | null
  quant_type?: string | null
  cache_tokens_left?: number | null
  using_relay?: boolean | null
}

export interface AdapterInfo {
  name: string
  short_name: string
}

