import { Radio, Lock, GitBranch, Database, PenLine, Clock } from "lucide-react";

export const demos = [
  {
    href: "/realtime",
    title: "Realtime Endpoints",
    description: "Compare SSE, WebSocket, Polling, and Long Polling patterns",
    icon: Radio,
  },
  {
    href: "/contention",
    title: "Handling Contention",
    description: "Explore optimistic vs pessimistic locking strategies",
    icon: Lock,
  },
  {
    href: "/workflows",
    title: "Multi-Step Processes",
    description: "Learn about sagas, choreography, and orchestration patterns",
    icon: GitBranch,
  },
  {
    href: "/reads",
    title: "Scaling Reads",
    description: "Understand caching and read replica strategies",
    icon: Database,
  },
  {
    href: "/writes",
    title: "Scaling Writes",
    description: "Learn sharding, batching, queues, and write optimization",
    icon: PenLine,
  },
  {
    href: "/tasks",
    title: "Long Running Tasks",
    description: "Async job queues, worker pools, and background processing",
    icon: Clock,
  },
];
