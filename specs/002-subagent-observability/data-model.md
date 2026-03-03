# Data Model: Subagent Observability

## Entity: SubagentInvocationRecord

- invocationId (string, unique per run)
- runId (string)
- attempt (number)
- stage (string: e.g., blocked-debate, review, recovery)
- reviewType (string)
- reason (string)
- inputArtifactPath (string)
- outputArtifactPath (string)
- createdAt (ISO datetime)

## Entity: SubagentInputSnapshot

- invocationId (string)
- focus (string)
- contextSummary (string)
- files[] (string)
- redactionReport (RedactionReport)
- truncation (TruncationInfo)

## Entity: SubagentOutputSnapshot

- invocationId (string)
- parseStatus (string: parsed|raw|invalid)
- validationStatus (string: valid|invalid|skipped)
- decision (string | null)
- severity (string | null)
- findings[] (object)
- rawText (string, truncated)
- truncation (TruncationInfo)

## Entity: RedactionReport

- rulesApplied[] (string)
- replacementsCount (number)
- redactedFields[] (string)

## Entity: TruncationInfo

- wasTruncated (boolean)
- maxBytes (number)
- originalBytes (number)
- keptBytes (number)

## Entity: AttemptDecisionTrace

- attempt (number)
- blockedReason (string | null)
- strategyBefore (string)
- subagentInvoked (boolean)
- strategyAfter (string)
- summary (string)
