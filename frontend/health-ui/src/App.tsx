import { Fragment, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  Clock3,
  Gauge,
  GitBranch,
  Info,
  Moon,
  RefreshCw,
  Server as ServerIcon,
  Shield,
  Signal,
  Sun,
} from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import logo from '@/assets/logo.svg'
import { fetchHealthState } from '@/api/health'
import type { AdapterInfo, HealthState, ModelReport, PeerState, ServerRow } from '@/types'

const STATE_CHARS: Record<PeerState, string> = {
  offline: '_',
  unreachable: '✖',
  joining: '●',
  online: '●',
}

const STATE_BADGES: Record<PeerState, string> = {
  online: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-200',
  joining: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-500/10 dark:text-amber-200',
  unreachable: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/10 dark:text-rose-200',
  offline: 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800/70 dark:text-slate-200',
}

const MODEL_STATE_BADGES: Record<ModelReport['state'], string> = {
  healthy: 'bg-emerald-500/15 text-emerald-600 border-transparent',
  broken: 'bg-rose-500/15 text-rose-600 border-transparent',
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

const FALLBACK_HEALTH_STATE: HealthState = {
  bootstrap_states: [],
  top_contributors: {},
  model_reports: [],
  reachability_issues: [],
  last_updated: Date.now(),
  update_period: 60,
  update_duration: 0,
}

const App = () => {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme())

  useEffect(() => {
    applyTheme(theme)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(THEME_STORAGE_KEY, theme)
    }
  }, [theme])

  const handleToggleTheme = () => {
    setTheme((current) => (current === 'dark' ? 'light' : 'dark'))
  }

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

  const resolved = data ?? FALLBACK_HEALTH_STATE
  const communityModels = resolved.model_reports.filter((model) => !model.official)
  const topContributors = useMemo(() => getTopContributors(resolved.top_contributors), [resolved.top_contributors])
  const lastUpdated = new Date(resolved.last_updated)
  const staleMessage = isError ? (error instanceof Error ? error.message : 'Unknown error') : null

  if (!data) {
    if (isLoading) {
      return (
        <PageShell>
          <Header isRefreshing={false} theme={theme} onToggleTheme={handleToggleTheme} />
          <LoadingState />
        </PageShell>
      )
    }
    if (isError) {
      return (
        <PageShell>
          <Header isRefreshing={false} theme={theme} onToggleTheme={handleToggleTheme} />
          <ErrorState
            message={error instanceof Error ? error.message : 'Failed to load the health state.'}
            onRetry={refetch}
          />
        </PageShell>
      )
    }
  }

  return (
    <PageShell>
      <Header isRefreshing={isFetching} theme={theme} onToggleTheme={handleToggleTheme} />
      <main className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-3">
          <BootstrapSection states={resolved.bootstrap_states} />
          {communityModels.length > 0 && <SwarmSection models={communityModels} />}
        </div>
        <TopContributorsSection contributors={topContributors} />
        {staleMessage && (
          <Alert variant="pending" className="border-amber-500/40 bg-amber-50/60 text-amber-800 dark:bg-amber-500/10">
            <AlertTriangle className="h-5 w-5" />
            <AlertTitle>Live data may be stale</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-4">
              <span>{staleMessage}</span>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                Retry now
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {communityModels.map((model) => (
          <ModelSection key={model.dht_prefix} model={model} />
        ))}
        <div className="grid gap-6 lg:grid-cols-2">
          <Legend />
          {resolved.reachability_issues.length > 0 && <ReachabilityIssues items={resolved.reachability_issues} />}
        </div>
      </main>
      <Footer lastUpdated={lastUpdated} updatePeriod={resolved.update_period} />
    </PageShell>
  )
}

const PageShell = ({ children }: { children: React.ReactNode }) => (
  <TooltipProvider delayDuration={200}>
    <div className="min-h-screen bg-gradient-to-b from-background via-muted/40 to-background">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 lg:px-8 lg:py-12">{children}</div>
    </div>
  </TooltipProvider>
)

const Header = ({
  isRefreshing,
  theme,
  onToggleTheme,
}: {
  isRefreshing: boolean
  theme: ThemeMode
  onToggleTheme: () => void
}) => (
  <Card className="border-none bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-600 text-white shadow-xl">
    <CardContent className="flex flex-col gap-6 p-6 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-4">
        <a target="_blank" rel="noreferrer" href="https://petals.dev" className="rounded-full bg-white/10 p-3">
          <img src={logo} alt="Petals logo" className="h-12 w-12 animate-spin-slow" />
        </a>
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/70">Petals Network</p>
          <h1 className="text-2xl font-semibold tracking-tight">Health Monitor</h1>
          <p className="text-sm text-white/80">Live telemetry for distributed inference swarms</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="secondary" className="bg-white/10 text-white">
          <Signal className="mr-1 h-4 w-4" /> Swarm online
        </Badge>
        {isRefreshing && (
          <Badge variant="secondary" className="bg-white/20 text-white">
            <RefreshCw className="mr-1 h-4 w-4 animate-spin" /> Refreshing
          </Badge>
        )}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              className="bg-white/20 text-white hover:bg-white/30"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent className="text-xs">
            {theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          </TooltipContent>
        </Tooltip>
        <Button asChild variant="secondary" className="bg-white text-primary hover:bg-white/90">
          <a target="_blank" rel="noreferrer" href="https://github.com/petals-infra/health.petals.dev">
            View source
          </a>
        </Button>
      </div>
    </CardContent>
  </Card>
)

const BootstrapSection = ({ states }: { states: PeerState[] }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Bootstrap peers</CardTitle>
      <CardDescription>Live bootstrap node status across the swarm</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex flex-wrap gap-2 font-mono text-sm">
        {states.length === 0 ? (
          <span className="text-muted-foreground">No data yet</span>
        ) : (
          states.map((state, index) => (
            <Badge key={`${state}-${index}`} variant="outline" className={cn('border-dashed', STATE_BADGES[state])}>
              <span className="text-base">{STATE_CHARS[state]}</span>
              <span className="ml-2 font-sans text-xs capitalize">{state}</span>
            </Badge>
          ))
        )}
      </div>
    </CardContent>
  </Card>
)

const SwarmSection = ({ models }: { models: ModelReport[] }) => (
  <Card className="lg:col-span-2">
    <CardHeader>
      <CardTitle className="text-base">Community swarm models</CardTitle>
      <CardDescription>Select a model to inspect peer health details</CardDescription>
    </CardHeader>
    <CardContent>
      <div className="flex flex-wrap gap-3">
        {models.map((model) => (
          <a
            key={model.dht_prefix}
            href={`#${model.short_name}`}
            className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Badge
              variant="secondary"
              className={cn(
                'cursor-pointer border border-border/60 bg-muted/60 text-foreground hover:bg-muted hover:text-foreground',
                model.state === 'broken' && 'border-rose-200 bg-rose-50 text-rose-700 dark:bg-rose-500/10',
              )}
            >
              <Shield className="mr-1 h-3.5 w-3.5" /> {model.short_name}
            </Badge>
          </a>
        ))}
      </div>
    </CardContent>
  </Card>
)

const TopContributorsSection = ({ contributors }: { contributors: ContributorEntry[] }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Top contributors</CardTitle>
      <CardDescription>Community members serving the most blocks right now</CardDescription>
    </CardHeader>
    <CardContent>
      {contributors.length === 0 ? (
        <p className="text-sm text-muted-foreground">No contributors reported yet.</p>
      ) : (
        <div className="space-y-3">
          {contributors.map(([name, blocks], idx) => (
            <div key={`${name}-${idx}`} className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Badge variant="outline" className="h-6 w-6 justify-center rounded-full text-xs font-semibold">
                  {idx + 1}
                </Badge>
                <span className="text-sm font-medium">{formatContributorName(name)}</span>
              </div>
              <span className="text-sm text-muted-foreground">{blocks} blocks</span>
            </div>
          ))}
        </div>
      )}
    </CardContent>
  </Card>
)

const ModelSection = ({ model }: { model: ModelReport }) => {
  const [showFullPeerIds, setShowFullPeerIds] = useState(false)
  const [showRpsDetails, setShowRpsDetails] = useState(false)

  return (
    <Card id={model.short_name} className="scroll-mt-32">
      <CardHeader className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <a
              target="_blank"
              rel="noreferrer"
              href={model.repository}
              className="text-xl font-semibold tracking-tight hover:text-primary"
            >
              {model.name}
            </a>
            <Badge variant="outline" className={MODEL_STATE_BADGES[model.state]}>
              {model.state}
            </Badge>
            {!model.official && (
              <Badge variant="destructive" className="uppercase tracking-wide">
                Community
              </Badge>
            )}
            {model.limited && <Badge variant="secondary">Chatbot only</Badge>}
          </div>
          <CardDescription className="flex flex-wrap items-center gap-4 text-sm">
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-4 w-4" /> {model.dht_prefix}
            </span>
            <span className="inline-flex items-center gap-1">
              <ServerIcon className="h-4 w-4" /> {model.server_rows.length} servers
            </span>
            <span className="inline-flex items-center gap-1">
              <Gauge className="h-4 w-4" /> {model.num_blocks} served blocks
            </span>
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <Button variant="ghost" size="xs" onClick={() => setShowFullPeerIds((current) => !current)}>
            {showFullPeerIds ? 'Show short peer IDs' : 'Show full peer IDs'}
          </Button>
          <Separator orientation="vertical" className="hidden h-4 lg:block" />
          <Button variant="ghost" size="xs" onClick={() => setShowRpsDetails((current) => !current)}>
            {showRpsDetails ? 'Hide RPS breakdown' : 'Show RPS breakdown'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!model.official && (
          <Alert variant="pending">
            <Shield className="h-4 w-4" />
            <AlertTitle>Community maintained</AlertTitle>
            <AlertDescription>
              This model is not officially supported. Use at your own risk and double-check trust settings.
            </AlertDescription>
          </Alert>
        )}

        {model.limited && (
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>License restrictions</AlertTitle>
            <AlertDescription>
              This model is intended for the{' '}
              <a className="underline" target="_blank" rel="noreferrer" href="https://chat.petals.dev">
                chatbot app
              </a>{' '}
              only. Public APIs are not provided.
            </AlertDescription>
          </Alert>
        )}

        <ScrollArea className="max-w-full rounded-xl border border-border/70 bg-card/80" type="auto">
          <div className="min-w-[980px]">
            <Table className="text-xs">
              <TableHeader>
                <TableRow className="[&>th]:whitespace-nowrap">
                  <TableHead className="w-40">Server ID</TableHead>
                  <TableHead>
                    <div className="inline-flex items-center gap-1">
                      Contributor <InfoButton text={INFO_MESSAGES.publicName} />
                    </div>
                  </TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>
                    <div className="inline-flex items-center gap-1">
                      Throughput <InfoButton text={INFO_MESSAGES.throughput} />
                    </div>
                  </TableHead>
                  {showRpsDetails && (
                    <>
                      <TableHead>
                        <div className="inline-flex items-center gap-1">
                          Inference <InfoButton text={INFO_MESSAGES.inference} />
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="inline-flex items-center gap-1">
                          Forward <InfoButton text={INFO_MESSAGES.forward} />
                        </div>
                      </TableHead>
                      <TableHead>
                        <div className="inline-flex items-center gap-1">
                          Network <InfoButton text={INFO_MESSAGES.network} />
                        </div>
                      </TableHead>
                    </>
                  )}
                  <TableHead>
                    <div className="inline-flex items-center gap-1">
                      Precision <InfoButton text={INFO_MESSAGES.precision} />
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="inline-flex items-center gap-1">
                      LoRAs <InfoButton text={INFO_MESSAGES.adapters} />
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="inline-flex items-center gap-1">
                      Cache <InfoButton text={INFO_MESSAGES.cache} />
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="inline-flex items-center gap-1">
                      Availability <InfoButton text={INFO_MESSAGES.availability} />
                    </div>
                  </TableHead>
                  <TableHead>
                    <div className="inline-flex items-center gap-1">
                      Pings <InfoButton text={INFO_MESSAGES.pings} />
                    </div>
                  </TableHead>
                  <TableHead colSpan={model.num_blocks + 1}>Served blocks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {model.server_rows.map((row) => (
                  <ServerRowItem
                    key={row.peer_id}
                    row={row}
                    showFullPeerIds={showFullPeerIds}
                    showRpsDetails={showRpsDetails}
                    numBlocks={model.num_blocks}
                  />
                ))}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>
      </CardContent>
      {model.state === 'broken' && (
        <CardFooter>
          <p className="text-sm text-muted-foreground">
            Not enough servers?{' '}
            <a
              target="_blank"
              rel="noreferrer"
              href="https://github.com/bigscience-workshop/petals#connect-your-gpu-and-increase-petals-capacity"
              className="font-medium text-primary underline-offset-4 hover:underline"
            >
              Connect your GPU
            </a>{' '}
            and increase Petals capacity!
          </p>
        </CardFooter>
      )}
    </Card>
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
  const availability = renderAvailability(serverInfo.using_relay)

  return (
    <TableRow className="align-top text-sm">
      <TableCell className="font-mono text-xs">{showFullPeerIds ? row.peer_id : row.short_peer_id}</TableCell>
      <TableCell>{renderContributor(row)}</TableCell>
      <TableCell className="font-mono text-xs">{renderVersion(serverInfo.version)}</TableCell>
      <TableCell className="font-mono">{renderThroughput(serverInfo.throughput)}</TableCell>
      {showRpsDetails && (
        <>
          <TableCell className="font-mono text-xs">{renderRps(serverInfo.inference_rps)}</TableCell>
          <TableCell className="font-mono text-xs">{renderRps(serverInfo.forward_rps)}</TableCell>
          <TableCell className="font-mono text-xs">{renderRps(serverInfo.network_rps)}</TableCell>
        </>
      )}
      <TableCell className="font-mono text-xs">{renderPrecision(serverInfo)}</TableCell>
      <TableCell className="space-x-1 whitespace-nowrap">{renderAdapters(row.adapters)}</TableCell>
      <TableCell className="font-mono text-xs">{renderCache(row.cache_tokens_left_per_block)}</TableCell>
      <TableCell>
        {availability ? (
          <Badge variant="outline" className="text-xs capitalize">
            {availability}
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-xs">
        {hasPings ? (
          <div className="space-y-2">
            <Button variant="link" size="xs" className="px-0" onClick={() => setShowPings((current) => !current)}>
              {showPings ? 'Hide' : 'Show'} RTT
            </Button>
            {showPings && (
              <div className="flex flex-wrap gap-1 font-mono text-xs text-muted-foreground">
                {Object.entries(row.pings_to_me).map(([sourceId, rtt]) => (
                  <Badge key={sourceId} variant="secondary" className="bg-muted text-foreground">
                    {formatPing(rtt)}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="font-mono text-xs">{`${row.span.start}:${row.span.end}`}</TableCell>
      {Array.from({ length: numBlocks }, (_, idx) => {
        const inRange = idx >= row.span.start && idx < row.span.end
        return (
          <TableCell
            key={`${row.peer_id}-${idx}`}
            className={cn(
              'p-1 text-center font-mono text-xs',
              inRange
                ? cn(
                    'rounded-sm border border-transparent',
                    row.state === 'online' && 'bg-emerald-500/15 text-emerald-600',
                    row.state === 'joining' && 'bg-amber-500/15 text-amber-600',
                    row.state === 'unreachable' && 'bg-rose-500/15 text-rose-600',
                    row.state === 'offline' && 'bg-slate-500/10 text-slate-500',
                  )
                : 'text-muted-foreground',
            )}
          >
            {inRange ? STATE_CHARS[row.state] : ''}
          </TableCell>
        )
      })}
    </TableRow>
  )
}

const Legend = () => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Legend</CardTitle>
      <CardDescription>Status tokens used throughout the dashboard</CardDescription>
    </CardHeader>
    <CardContent className="space-y-3">
      {Object.entries(STATE_CHARS).map(([state, char]) => (
        <div key={state} className="flex items-center justify-between rounded-lg border border-border/70 p-3">
          <div className="flex items-center gap-3">
            <Badge variant="outline" className={STATE_BADGES[state as PeerState]}>
              <span className="text-base">{char}</span>
              <span className="ml-2 font-sans text-xs capitalize">{state}</span>
            </Badge>
            <span className="text-sm text-muted-foreground">{legendDescriptions[state as PeerState]}</span>
          </div>
        </div>
      ))}
    </CardContent>
  </Card>
)

const legendDescriptions: Record<PeerState, string> = {
  online: 'Up and serving requests',
  joining: 'Loading blocks; will be available shortly',
  unreachable: 'Cannot be reached from the internet yet',
  offline: 'Disconnected recently',
}

const ReachabilityIssues = ({ items }: { items: HealthState['reachability_issues'] }) => (
  <Card>
    <CardHeader>
      <CardTitle className="text-base">Reachability issues</CardTitle>
      <CardDescription>Troublesome peers reported by bootstrap nodes</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4 text-sm text-muted-foreground">
      <p>
        Servers may be unreachable due to networking or firewall constraints. They typically recover after joining a{' '}
        <a
          target="_blank"
          rel="noreferrer"
          href="https://docs.libp2p.io/concepts/nat/circuit-relay/"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          libp2p circuit relay
        </a>
        . For stuck peers, ask for help in{' '}
        <a
          target="_blank"
          rel="noreferrer"
          href="https://discord.gg/X7DgtxgMhc"
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          #running-a-server
        </a>
        .
      </p>
      <div className="overflow-x-auto rounded-lg border border-border/70">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Peer ID</th>
              <th className="px-4 py-3">Error message</th>
            </tr>
          </thead>
          <tbody className="[&>tr]:border-b [&>tr]:border-border/60">
            {items.map((issue) => (
              <tr key={issue.peer_id}>
                <td className="px-4 py-3 font-mono text-xs">{issue.peer_id}</td>
                <td className="px-4 py-3">{issue.err}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </CardContent>
  </Card>
)

const Footer = ({ lastUpdated, updatePeriod }: { lastUpdated: Date; updatePeriod: number }) => (
  <Card>
    <CardFooter className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted-foreground">
      <span>
        Last updated <span className="font-mono">{formatUtcTime(lastUpdated)}</span> UTC (next update in {updatePeriod}{' '}
        sec)
      </span>
      <div className="flex items-center gap-4">
        <Clock3 className="h-4 w-4" />
        <Button variant="link" asChild>
          <a target="_blank" rel="noreferrer" href="https://github.com/petals-infra/health.petals.dev">
            Source & API docs
          </a>
        </Button>
      </div>
    </CardFooter>
  </Card>
)

const LoadingState = () => (
  <Card>
    <CardHeader>
      <CardTitle>Loading swarm status…</CardTitle>
      <CardDescription>Fetching the latest telemetry snapshot</CardDescription>
    </CardHeader>
    <CardContent className="space-y-4">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-16 w-full" />
    </CardContent>
  </Card>
)

const ErrorState = ({ message, onRetry }: { message: string; onRetry: () => void }) => (
  <Alert variant="destructive">
    <AlertTriangle className="h-5 w-5" />
    <AlertTitle>Unable to load swarm health</AlertTitle>
    <AlertDescription className="flex flex-wrap items-center gap-4">
      <span>{message}</span>
      <Button variant="outline" onClick={onRetry}>
        Retry
      </Button>
    </AlertDescription>
  </Alert>
)

const InfoButton = ({ text }: { text: string }) => (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6 text-muted-foreground hover:text-foreground"
        aria-label={text}
      >
        <Info className="h-3.5 w-3.5" />
      </Button>
    </TooltipTrigger>
    <TooltipContent className="max-w-xs text-xs">{text}</TooltipContent>
  </Tooltip>
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
      <a target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline" href={href}>
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
    return <span className="text-muted-foreground">Hidden</span>
  }
  const publicName = row.span.server_info.public_name
  if (!publicName) {
    return <span className="text-muted-foreground">—</span>
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
    return <span className="text-muted-foreground">—</span>
  }
  return items.map((adapter, index) => (
    <Fragment key={adapter.name}>
      <a
        target="_blank"
        rel="noreferrer"
        href={`https://huggingface.co/${adapter.name}`}
        className="text-primary underline-offset-4 hover:underline"
      >
        {adapter.short_name}
      </a>
      {index < items.length - 1 && <span>, </span>}
    </Fragment>
  ))
}

const renderCache = (value?: number) => {
  if (!Number.isFinite(value)) {
    return '—'
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

type ThemeMode = 'light' | 'dark'

const THEME_STORAGE_KEY = 'helion-theme'

const getInitialTheme = (): ThemeMode => {
  if (typeof window === 'undefined') {
    return 'light'
  }
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
  const resolved: ThemeMode =
    stored === 'light' || stored === 'dark'
      ? stored
      : window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'

  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }

  return resolved
}

const applyTheme = (value: ThemeMode) => {
  if (typeof document === 'undefined') {
    return
  }
  document.documentElement.classList.toggle('dark', value === 'dark')
}
