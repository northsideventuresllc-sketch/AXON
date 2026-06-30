import { ToolPlaceholder } from '@/components/axon/tool-placeholder';

export default function HermesToolPage() {
  return (
    <ToolPlaceholder
      title="Hermes Task Sync"
      description="Mirror Hermes marketing tasks into AXON. Sync only — no LLM overlap per guardrails."
    />
  );
}
