import { Fragment, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import logo from './assets/logo.svg'
import { fetchHealthState } from './api/health'
import type { AdapterInfo, HealthState, ModelReport, PeerState, ServerRow } from './types'

const STATE_CHARS: Record<PeerState, string> = {
  offline: '_',
  unreachable: '✖',
  joining: '●',
  online: '●',
}

const INFO_MESSAGES = {
  publicName:
    'Specify the public name with --public_name. Names are shown only for online servers that host ≥10 blocks.',
  throughput:
    'Compute throughput, measured in tokens/sec per block. Used for routing requests and balancing load.',
  inference:
    'Inference throughput, measured in tokens/sec. Shows sustained generation capacity per server.',
  forward: 'Forward throughput, measured in tokens/sec.',
  network: 'Network throughput, measured in tokens/sec.',
  precision:
    'Torch dtype used for computation and quantization mode for compressed weights. Float dtypes are shortened.',
  adapters:
    'LoRA adapters that are pre-loaded by the server. Clients may request one of these adapters during inference.',
  cache: 'Available attention cache tokens per block. Low values may delay or reject inference requests.',
  availability:
    'Whether the server is reachable directly or via a libp2p relay (relay nodes tend to be slower).',
  pings:
    'Round-trip times from this server to potential neighbors. Used to build the fastest inference chains.',
}

const MAX_CONTRIBUTORS = 5

const App = () => {
  const { data, isLoading, isFetching, isError, error, refetch } = useQuery<HealthState>({
    queryKey: ['health-state'],
    queryFn: fetchHealthState,
    refetchInterval: (query) => {
      const seconds = query.state.data?.update_period ?? 60
      return Math.max(seconds * 1000, 30_000)
    },
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    retry: 2,
  })

  const resolved = data ? data : {
    bootstrap_states: [],
    top_contributors: {},
    model_reports: [],
    reachability_issues: [],
    last_updated: new Date(),
    update_period: 60,
    update_duration: 0,
  }
  const nonOfficialModels = resolved.model_reports.filter((model) => !model.official)
  const topContributors = useMemo(() => getTopContributors(resolved.top_contributors), [resolved.top_contributors])
  const lastUpdated = new Date(resolved.last_updated)
  const staleMessage = isError ? (error instanceof Error ? error.message : 'Unknown error') : null

  if (!data) {
    if (isLoading) {
      return (
        <PageShell>
          <LoadingState />
        </PageShell>
      )
    }
    if (isError) {
      return (
        <PageShell>
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load the health state.'}
            onRetry={refetch}
          />
        </PageShell>
      )
    }
  }

  return (
    <div className="health-app">
      <Header isRefreshing={isFetching} />
      <main>
        <BootstrapSection states={resolved.bootstrap_states} />
        {nonOfficialModels.length > 0 && <SwarmSection models={nonOfficialModels} />}
        <TopContributorsSection contributors={topContributors} />
        {staleMessage && (
          <div className="error-banner">
            <p>
              Some data may be stale: {staleMessage}{' '}
              <button type="button" className="link-button" onClick={() => refetch()}>
                Retry
              </button>
            </p>
          </div>
        )}
        {nonOfficialModels.map((model) => (
          <ModelSection key={model.dht_prefix} model={model} />
        ))}
        <Legend />
        {resolved.reachability_issues.length > 0 && (
          <ReachabilityIssues items={resolved.reachability_issues} />
        )}
      </main>
      <Footer lastUpdated={lastUpdated} updatePeriod={resolved.update_period} />
    </div>
  )
}

const PageShell = ({ children }: { children: React.ReactNode }) => (
  <div className="health-app">
    <Header isRefreshing={false} />
    <main>{children}</main>
  </div>
)

const Header = ({ isRefreshing }: { isRefreshing: boolean }) => (
  <header>
    <div className="logo">
      <a target="_blank" rel="noreferrer" href="https://petals.dev">
        <img src={logo} height={50} className="rot-image" alt="Petals logo" />
      </a>
    </div>
    <h1>
      Petals <span style={{ fontSize: '13pt', color: '#aaa' }}>Health Monitor</span>
    </h1>
    {isRefreshing && <span className="refresh-indicator">Refreshing…</span>}
  </header>
)

const BootstrapSection = ({ states }: { states: PeerState[] }) => (
  <section>
    <p>
      Bootstrap peers:
      <span className="bootstrap-map">
        {states.map((state, index) => (
          <span key={`${state}-${index}`} className={state}>
            {STATE_CHARS[state]}
          </span>
        ))}
      </span>
    </p>
  </section>
)

const SwarmSection = ({ models }: { models: ModelReport[] }) => (
  <section>
    <p>
      Swarm:
      <span className="toc">
        {models.map((model, idx) => (
          <Fragment key={model.dht_prefix}>
            <a className={model.state} href={`#${model.short_name}`} title={`DHT prefix: ${model.dht_prefix}`}>
              {model.short_name}
            </a>
            {idx < models.length - 1 && <span className="bull">&bull;</span>}
          </Fragment>
        ))}
      </span>
    </p>
  </section>
)

const TopContributorsSection = ({ contributors }: { contributors: ContributorEntry[] }) => (
  <section>
    <p>
      Top contributors:
      <span className="top-contributors">
        {contributors.length === 0 ? (
          <span className="gray">No data yet</span>
        ) : (
          contributors.map(([name, blocks], idx) => (
            <Fragment key={`${name}-${idx}`}>
              <span className="entry">
                <span className="name">{formatContributorName(name)}</span>
                <span className="num-blocks gray">({blocks} blocks)</span>
              </span>
              {idx < contributors.length - 1 && <span className="bull">&bull;</span>}
            </Fragment>
          ))
        )}
      </span>
    </p>
  </section>
)

const ModelSection = ({ model }: { model: ModelReport }) => {
  const [showFullPeerIds, setShowFullPeerIds] = useState(false)
  const [showRpsDetails, setShowRpsDetails] = useState(false)

  return (
    <section id={model.short_name}>
      <p>
        Model{' '}
        <a target="_blank" rel="noreferrer" href={model.repository} title={`DHT prefix: ${model.dht_prefix}`}>
          {model.name}
        </a>{' '}
        (<span className={model.state}>{model.state}</span>):
      </p>

      {!model.official && (
        <p className="hint">
          This model is <b>not</b> officially supported. Use it at your own risk.
        </p>
      )}

      {model.limited && (
        <p className="hint">
          This model is intended for the{' '}
          <a target="_blank" rel="noreferrer" href="https://chat.petals.dev">
            chatbot app
          </a>{' '}
          only. We do not provide a public API for this model due to license restrictions.
        </p>
      )}

      <table className="servers">
        <thead>
          <tr>
            <td>
              Server ID{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => setShowFullPeerIds((current) => !current)}
                aria-label="Toggle peer ID display"
              >
                {showFullPeerIds ? '«' : '»'}
              </button>
            </td>
            <td>
              Contributor <InfoButton text={INFO_MESSAGES.publicName} />
            </td>
            <td>Version</td>
            <td>
              Throughput{' '}
              <button
                type="button"
                className="link-button"
                onClick={() => setShowRpsDetails((current) => !current)}
                aria-label="Toggle throughput details"
              >
                {showRpsDetails ? '«' : '»'}
              </button>
            </td>
            {showRpsDetails && (
              <>
                <td>
                  Inference <InfoButton text={INFO_MESSAGES.inference} />
                </td>
                <td>
                  Forward <InfoButton text={INFO_MESSAGES.forward} />
                </td>
                <td>
                  Network <InfoButton text={INFO_MESSAGES.network} />
                </td>
              </>
            )}
            <td>
              Precision <InfoButton text={INFO_MESSAGES.precision} />
            </td>
            <td>
              LoRAs <InfoButton text={INFO_MESSAGES.adapters} />
            </td>
            <td>
              Cache <InfoButton text={INFO_MESSAGES.cache} />
            </td>
            <td>
              Avl. <InfoButton text={INFO_MESSAGES.availability} />
            </td>
            <td>
              Pings <InfoButton text={INFO_MESSAGES.pings} />
            </td>
            <td className="bm-header" colSpan={model.num_blocks + 1}>
              Served blocks
            </td>
          </tr>
        </thead>
        <tbody>
          {model.server_rows.map((row) => (
            <ServerRowItem
              key={row.peer_id}
              row={row}
              showFullPeerIds={showFullPeerIds}
              showRpsDetails={showRpsDetails}
              numBlocks={model.num_blocks}
            />
          ))}
        </tbody>
      </table>

      {model.state === 'broken' && (
        <p className="hint">
          <b>Not enough servers?</b>{' '}
          <a
            target="_blank"
            rel="noreferrer"
            href="https://github.com/bigscience-workshop/petals#connect-your-gpu-and-increase-petals-capacity"
          >
            Connect your GPU
          </a>{' '}
          and increase Petals capacity!
        </p>
      )}
    </section>
  )
}

const ServerRowItem = ({
  row,
  showFullPeerIds,
  showRpsDetails,
  numBlocks,
}: {
  row: ServerRow
  showFullPeerIds: boolean
  showRpsDetails: boolean
  numBlocks: number
}) => {
  const [showPings, setShowPings] = useState(false)
  const serverInfo = row.span.server_info
  const hasPings = Object.keys(row.pings_to_me).length > 0

  return (
    <tr>
      <td>{showFullPeerIds ? row.peer_id : row.short_peer_id}</td>
      <td className="contributor">{renderContributor(row)}</td>
      <td>{renderVersion(serverInfo.version)}</td>
      <td>{renderThroughput(serverInfo.throughput)}</td>
      {showRpsDetails && (
        <>
          <td>{renderRps(serverInfo.inference_rps)}</td>
          <td>{renderRps(serverInfo.forward_rps)}</td>
          <td>{renderRps(serverInfo.network_rps)}</td>
        </>
      )}
      <td>{renderPrecision(serverInfo)}</td>
      <td>{renderAdapters(row.adapters)}</td>
      <td>{renderCache(row.cache_tokens_left_per_block)}</td>
      <td>{renderAvailability(serverInfo.using_relay)}</td>
      <td className="ping">
        {hasPings ? (
          <>
            <button type="button" className="link-button" onClick={() => setShowPings((current) => !current)}>
              {showPings ? 'Hide' : 'Show'}
            </button>
            {showPings && (
              <div className="ping-results">
                {Object.entries(row.pings_to_me).map(([sourceId, rtt]) => (
                  <span key={sourceId} className="rtt">
                    {formatPing(rtt)}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <span className="gray">—</span>
        )}
      </td>
      <td>{`${row.span.start}:${row.span.end}`}</td>
      {Array.from({ length: numBlocks }, (_, idx) => {
        const inRange = idx >= row.span.start && idx < row.span.end
        return (
          <td key={`${row.peer_id}-${idx}`} className={`bm${inRange ? ` ${row.state}` : ''}`}>
            {inRange ? STATE_CHARS[row.state] : ''}
          </td>
        )
      })}
    </tr>
  )
}

const Legend = () => (
  <section>
    <p>Legend:</p>
    <table className="legend">
      <thead>
        <tr>
          <td colSpan={2}>Status</td>
          <td>Description</td>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td className="online">●</td>
          <td>online</td>
          <td>Up and running</td>
        </tr>
        <tr>
          <td className="joining">●</td>
          <td>joining</td>
          <td>Loading blocks, joining soon</td>
        </tr>
        <tr>
          <td className="unreachable">✖</td>
          <td>unreachable</td>
          <td>Unreachable from the Internet, see “Reachability issues” below</td>
        </tr>
        <tr>
          <td className="offline">_</td>
          <td>offline</td>
          <td>Disconnected a few minutes ago</td>
        </tr>
      </tbody>
    </table>
  </section>
)

const ReachabilityIssues = ({
  items,
}: {
  items: HealthState['reachability_issues']
}) => (
  <section>
    <p>Reachability issues:</p>
    <p className="hint">
      Servers may be unreachable due to port forwarding/NAT/firewall issues. Normally, they should become reachable in a
      few minutes once they join a{' '}
      <a target="_blank" rel="noreferrer" href="https://docs.libp2p.io/concepts/nat/circuit-relay/">
        libp2p circuit relay
      </a>
      . If your server fails to do that, please ask for help in the{' '}
      <b>
        <a target="_blank" rel="noreferrer" href="https://discord.gg/X7DgtxgMhc">
          #running-a-server
        </a>
      </b>{' '}
      channel of our Discord.
    </p>
    <table>
      <thead>
        <tr>
          <td>Peer ID</td>
          <td>Error message</td>
        </tr>
      </thead>
      <tbody>
        {items.map((issue) => (
          <tr key={issue.peer_id}>
            <td>{issue.peer_id}</td>
            <td className="error-message">{issue.err}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </section>
)

const Footer = ({ lastUpdated, updatePeriod }: { lastUpdated: Date; updatePeriod: number }) => (
  <footer>
    Last updated: {formatUtcTime(lastUpdated)} UTC (update in {updatePeriod} sec). See source code and API docs on{' '}
    <a target="_blank" rel="noreferrer" href="https://github.com/petals-infra/health.petals.dev">
      GitHub
    </a>
    .
  </footer>
)

const LoadingState = () => (
  <div className="loading">
    <p>Loading swarm status…</p>
    <div className="loading-animation">⏳</div>
  </div>
)

const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <div className="error">
    <p>{message}</p>
    <button type="button" className="link-button" onClick={onRetry}>
      Retry
    </button>
  </div>
)

const InfoButton = ({ text }: { text: string }) => (
  <button type="button" className="info-button" title={text} aria-label={text}>
    ?
  </button>
)

type ContributorEntry = [string, number]

const getTopContributors = (counter: Record<string, number>): ContributorEntry[] =>
  Object.entries(counter)
    .sort(([, a], [, b]) => b - a)
    .slice(0, MAX_CONTRIBUTORS)

const formatContributorName = (name: string): ReactNode => {
  if (name.startsWith('http://') || name.startsWith('https://')) {
    const { label, href } = normalizeLink(name)
    return (
      <a target="_blank" rel="noreferrer" href={href}>
        {truncateWithEllipsis(label, 20)}
      </a>
    )
  }
  return truncateWithEllipsis(name, 20)
}

const truncateWithEllipsis = (value: string, max = 20) => {
  if (value.length <= max) {
    return value
  }
  return `${value.slice(0, max - 1)}…`
}

const normalizeLink = (value: string) => {
  try {
    const url = new URL(value)
    return { href: value, label: url.host + url.pathname.replace(/\/$/, '') }
  } catch {
    return { href: value, label: value }
  }
}

const renderContributor = (row: ServerRow): ReactNode => {
  if (!row.show_public_name) {
    return null
  }
  const publicName = row.span.server_info.public_name
  if (!publicName) {
    return null
  }
  return formatContributorName(publicName)
}

const renderVersion = (version?: string | null) => {
  if (!version) {
    return '< 2.0.0'
  }
  return truncateWithEllipsis(version, 10)
}

const renderThroughput = (throughput?: number | null) => {
  if (!Number.isFinite(throughput)) {
    return '—'
  }
  return `${Math.round(Number(throughput)).toLocaleString()} tok/s`
}

const renderRps = (value?: number | null) => {
  if (!Number.isFinite(value)) {
    return ''
  }
  return Math.round(Number(value)).toLocaleString()
}

const renderPrecision = (info: ServerRow['span']['server_info']) => {
  const dtype = info.torch_dtype ? info.torch_dtype.replace('float', 'f') : ''
  const quant = info.quant_type && info.quant_type !== 'none' ? `(${info.quant_type})` : ''
  return `${dtype} ${quant}`.trim()
}

const renderAdapters = (items: AdapterInfo[]): ReactNode => {
  if (!items.length) {
    return null
  }
  return items.map((adapter, index) => (
    <Fragment key={adapter.name}>
      <a target="_blank" rel="noreferrer" href={`https://huggingface.co/${adapter.name}`}>
        {adapter.short_name}
      </a>
      {index < items.length - 1 && ' '}
    </Fragment>
  ))
}

const renderCache = (value?: number) => {
  if (!Number.isFinite(value)) {
    return ''
  }
  return Number(value).toLocaleString()
}

const renderAvailability = (usingRelay?: boolean | null) => {
  if (usingRelay === undefined || usingRelay === null) {
    return ''
  }
  return usingRelay ? 'Relay' : 'Direct'
}

const formatPing = (rtt: number) => {
  if (rtt <= 5) {
    return `${(rtt * 1000).toFixed(1)} ms`
  }
  return '> 5 s'
}

const formatUtcTime = (date: Date) =>
  `${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(
    date.getUTCSeconds(),
  ).padStart(2, '0')}`

export default App
