"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface TechniqueCardProps {
  title: string;
  description: string;
  useCase: string;
  latency?: string;
  complexity?: string;
  tradeoff?: string;
  implementations?: string[];
}

function TechniqueCard({
  title,
  description,
  useCase,
  latency,
  complexity,
  tradeoff,
  implementations,
}: TechniqueCardProps) {
  return (
    <Card className="flex flex-col overflow-hidden border-2 transition-all hover:shadow-md">
      <CardHeader className="space-y-2 p-4 pb-2">
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
        <CardDescription className="text-sm leading-relaxed">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex-1 p-4 pt-2">
        <div className="space-y-3">
          <div className="rounded-lg border bg-muted/50 p-3">
            <div className="text-xs font-medium text-muted-foreground mb-1">
              Use Case
            </div>
            <div className="text-sm">{useCase}</div>
          </div>

          {(latency || complexity) && (
            <div className="flex gap-3">
              {latency && (
                <div className="flex-1 rounded-lg border bg-muted/50 p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Latency
                  </div>
                  <div className="text-sm font-medium">{latency}</div>
                </div>
              )}
              {complexity && (
                <div className="flex-1 rounded-lg border bg-muted/50 p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-1">
                    Complexity
                  </div>
                  <div className="text-sm font-medium">{complexity}</div>
                </div>
              )}
            </div>
          )}

          {tradeoff && (
            <div className="rounded-lg border border-orange-500/20 bg-orange-500/10 p-3">
              <div className="text-xs font-medium text-orange-600 mb-1">
                Tradeoff
              </div>
              <div className="text-sm text-orange-700">{tradeoff}</div>
            </div>
          )}

          {implementations && implementations.length > 0 && (
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="text-xs font-medium text-muted-foreground mb-2">
                Implementations
              </div>
              <ul className="text-sm space-y-1">
                {implementations.map((impl, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                    {impl}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export default function ContentionPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">
          Handling Contention
        </h1>
        <p className="mt-2 text-muted-foreground">
          Strategies for managing concurrent access to shared resources in
          distributed systems.
        </p>
      </header>

      {/* Single Node Solutions */}
      <section className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-xl font-semibold">Single Node Solutions</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Techniques for handling contention within a single database or
            service instance.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <TechniqueCard
            title="Atomicity (Database Transactions)"
            description="Groups operations so they all succeed or all fail together. Use BEGIN TRANSACTION / COMMIT / ROLLBACK."
            useCase="Ensuring data consistency within a single database"
            tradeoff="Doesn't prevent concurrent transactions from reading the same data simultaneously"
          />

          <TechniqueCard
            title="Pessimistic Locking"
            description="Acquires locks upfront, assuming conflicts will happen. Uses SELECT ... FOR UPDATE to acquire an exclusive lock on a row before reading."
            useCase="High contention scenarios"
            latency="Low"
            complexity="Low"
          />

          <TechniqueCard
            title="Isolation Levels"
            description="Let the database automatically handle conflicts by raising the isolation level. SERIALIZABLE is the strongest, making transactions appear to run one at a time."
            useCase="Need automatic conflict detection"
            latency="Medium"
            complexity="Low"
            tradeoff="More expensive than explicit locks"
          />

          <TechniqueCard
            title="Optimistic Concurrency Control (OCC)"
            description="Assumes conflicts are rare and detects them after they occur. Include a version number in updates - if it doesn't match, the update fails and must retry."
            useCase="Low contention, high throughput scenarios"
            latency="Low (no conflicts)"
            complexity="Medium"
          />
        </div>
      </section>

      {/* Multi Node Solutions */}
      <section className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-xl font-semibold">Multi Node Solutions</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Techniques for coordinating across multiple services or databases in
            a distributed system.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <TechniqueCard
            title="Two-Phase Commit (2PC)"
            description="A coordinator asks all participants to 'prepare' the transaction, then tells them to 'commit' or 'abort' based on whether everyone prepared successfully."
            useCase="Must have cross-system atomicity"
            latency="High"
            complexity="Very High"
            tradeoff="Expensive and fragile - coordinator crashes can leave participants in limbo"
          />

          <TechniqueCard
            title="Distributed Locks"
            description="Ensures only one process can work on a resource at a time across the entire system. Also useful for user-facing 'reservation' flows."
            useCase="User-facing flows, reservations"
            latency="Low"
            complexity="Medium"
            implementations={[
              "Redis with TTL",
              "Database columns with cleanup jobs",
              "ZooKeeper / etcd",
            ]}
          />

          <TechniqueCard
            title="Saga Pattern"
            description="Breaks operations into independent steps that can each be undone via 'compensating transactions' if something fails. No long-running open transactions."
            useCase="Long-running distributed transactions"
            tradeoff="Eventual consistency - the system is temporarily inconsistent"
          />
        </div>
      </section>

      {/* Decision Framework */}
      <section className="space-y-4">
        <div className="border-b pb-2">
          <h2 className="text-xl font-semibold">Decision Framework</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Quick reference for choosing the right approach.
          </p>
        </div>

        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-semibold">
                      Approach
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Use When
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Latency
                    </th>
                    <th className="px-4 py-3 text-left font-semibold">
                      Complexity
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-medium">
                      Pessimistic Locking
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      High contention, single DB
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                        Low
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                        Low
                      </span>
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-medium">
                      SERIALIZABLE Isolation
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      Need automatic conflict detection
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-600">
                        Medium
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                        Low
                      </span>
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-medium">
                      Optimistic Concurrency
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      Low contention, high throughput
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                        Low
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-600">
                        Medium
                      </span>
                    </td>
                  </tr>
                  <tr className="border-b">
                    <td className="px-4 py-3 font-medium">
                      Distributed Transactions
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      Must have cross-system atomicity
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600">
                        High
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600">
                        Very High
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td className="px-4 py-3 font-medium">Distributed Locks</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      User-facing flows, reservations
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                        Low
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-600">
                        Medium
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card className="border-2 border-primary/20 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <div className="rounded-full bg-primary/10 p-2">
                <svg
                  className="h-5 w-5 text-primary"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              </div>
              <div>
                <div className="font-semibold">Key Takeaway</div>
                <p className="text-sm text-muted-foreground mt-1">
                  Exhaust single-database solutions before considering
                  distributed coordination. Start with pessimistic locking -
                  it&apos;s simple, predictable, and can be optimized later.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
